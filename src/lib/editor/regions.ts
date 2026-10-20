import { deflateSync, inflateSync } from "fflate";

/**
 * The AI eraser's map of a photo (Kezie, 2026-10-20: "map out the whole image and be able to erase
 * some parts"). SAM 2 on Replicate returns one black-and-white mask per thing it finds; here they
 * become one label per pixel (0 = nothing found), smaller things on top of larger ones, so a click
 * picks the most specific thing under the pointer. Shared by the route and the editor.
 */
/** Mapping a photo: SAM 2 on Replicate, about $0.02 a run (200 credits per provider dollar). */
export const MAP_CREDITS = 5;
/** One AI erase: Bria Eraser on Replicate, $0.04. */
export const AI_ERASE_CREDITS = 8;

export type Region = { id: number; area: number; box: [number, number, number, number] };
export type RegionMap = { w: number; h: number; labels: Uint8Array; regions: Region[] };
export const MAX_REGIONS = 255;

/** Masks (one byte per pixel, same size) into labels; largest first so small things win. */
export function composeLabels(masks: Uint8Array[], w: number, h: number, threshold = 128): RegionMap {
  const n = w * h;
  const areas = masks.map((m) => { let a = 0; for (let i = 0; i < n; i++) if (m[i] >= threshold) a++; return a; });
  const order = masks.map((_, i) => i).filter((i) => areas[i] > 0).sort((a, b) => areas[b] - areas[a]).slice(0, MAX_REGIONS);
  const labels = new Uint8Array(n);
  order.forEach((mi, k) => { const m = masks[mi]; const id = k + 1; for (let i = 0; i < n; i++) if (m[i] >= threshold) labels[i] = id; });
  return { w, h, labels, regions: regionsOf(labels, w, h) };
}

/** What's left of each label once smaller things covered it: its area and box. */
export function regionsOf(labels: Uint8Array, w: number, h: number): Region[] {
  const minX = new Int32Array(256).fill(w), minY = new Int32Array(256).fill(h), maxX = new Int32Array(256).fill(-1), maxY = new Int32Array(256).fill(-1), area = new Int32Array(256);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const id = labels[y * w + x];
      if (!id) continue;
      area[id]++;
      if (x < minX[id]) minX[id] = x; if (x > maxX[id]) maxX[id] = x;
      if (y < minY[id]) minY[id] = y; if (y > maxY[id]) maxY[id] = y;
    }
  }
  const out: Region[] = [];
  for (let id = 1; id < 256; id++) if (area[id]) out.push({ id, area: area[id], box: [minX[id], minY[id], maxX[id] - minX[id] + 1, maxY[id] - minY[id] + 1] });
  return out;
}

/** Labels for the wire: deflated, base64. A 1024 px map is usually 20 to 80 KB. */
export function packLabels(labels: Uint8Array): string {
  const z = deflateSync(labels, { level: 6 });
  let s = "";
  for (let i = 0; i < z.length; i += 0x8000) s += String.fromCharCode(...z.subarray(i, i + 0x8000));
  return typeof btoa === "function" ? btoa(s) : Buffer.from(z).toString("base64");
}

export function unpackLabels(b64: string, size: number): Uint8Array | null {
  try {
    const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
    const z = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) z[i] = bin.charCodeAt(i);
    const out = inflateSync(z);
    return out.length === size ? out : null;
  } catch { return null; }
}

export function validRegionMap(raw: unknown): RegionMap | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { w?: unknown; h?: unknown; labels?: unknown; regions?: unknown };
  const w = Number(r.w), h = Number(r.h);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 8 || h < 8 || w * h > 4_200_000 || typeof r.labels !== "string") return null;
  const labels = unpackLabels(r.labels, w * h);
  if (!labels) return null;
  return { w, h, labels, regions: regionsOf(labels, w, h) };
}

/**
 * Grow a mask by r pixels (alpha > 0 counts as marked), so the eraser also takes the thing's soft
 * edge and its halo. Square-ish neighbourhood, two passes (rows then columns).
 */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const rows = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -Infinity;
    for (let x = 0; x < w; x++) { if (mask[y * w + x]) last = x; if (x - last <= r) rows[y * w + x] = 255; }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) { if (mask[y * w + x]) last = x; if (last - x <= r) rows[y * w + x] = 255; }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) { if (rows[y * w + x]) last = y; if (y - last <= r) out[y * w + x] = 255; }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) { if (rows[y * w + x]) last = y; if (last - y <= r) out[y * w + x] = 255; }
  }
  return out;
}

/**
 * The AI result back on the original (the eraser returns a smaller picture): only inside the
 * feathered mask does the new picture show, so everything else keeps the original's sharpness.
 * All RGBA at the original's size; `alpha` 0-255 per pixel.
 */
export function blendInto(orig: Uint8Array, fresh: Uint8Array, alpha: Uint8Array): Uint8Array {
  const out = new Uint8Array(orig.length);
  for (let i = 0, p = 0; p < alpha.length; p++, i += 4) {
    const a = alpha[p] / 255, b = 1 - a;
    out[i] = orig[i] * b + fresh[i] * a;
    out[i + 1] = orig[i + 1] * b + fresh[i + 1] * a;
    out[i + 2] = orig[i + 2] * b + fresh[i + 2] * a;
    out[i + 3] = orig[i + 3] * b + fresh[i + 3] * a;
  }
  return out;
}
