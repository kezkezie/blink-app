"use client";

const PROXY_HOSTS = ["res.cloudinary.com", "supabase.co", "tempfile.aiquickdraw.com", "i.pinimg.com"];

/** Same-origin URL for canvas work (a cross-origin pixel read would taint exports). */
export function canvasSafe(url: string) {
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return url;
  try {
    return PROXY_HOSTS.some((h) => new URL(url).hostname.endsWith(h)) ? `/api/fetch-media?url=${encodeURIComponent(url)}` : url;
  } catch { return url; }
}

/** The original (un-proxied) URL behind a canvasSafe() URL. */
export function originalUrl(src: string) {
  if (src.startsWith("/api/fetch-media?url=")) return decodeURIComponent(src.slice("/api/fetch-media?url=".length));
  return src;
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the image"));
    img.src = src;
  });
}

/** The dominant colours of an image, most common first, skipping near-duplicates. */
export function paletteOf(img: CanvasImageSource, max = 6): string[] {
  const c = document.createElement("canvas");
  c.width = 48; c.height = 48;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, 48, 48);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, 48, 48).data; } catch { return []; }
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2];
    buckets.set(key, e);
  }
  const out: Array<[number, number, number]> = [];
  for (const e of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const rgb = [e.r / e.n, e.g / e.n, e.b / e.n].map(Math.round) as [number, number, number];
    if (out.every((o) => Math.hypot(o[0] - rgb[0], o[1] - rgb[1], o[2] - rgb[2]) > 48)) out.push(rgb);
    if (out.length >= max) break;
  }
  return out.map(([r, g, b]) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase());
}

/** Draw an image no larger than `max` px into a PNG blob (for AI tools with size limits). */
export async function shrinkToBlob(src: string, max = 2048): Promise<Blob> {
  const img = await loadImage(src);
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
}

/** Points of a regular star or polygon inside a w×h box. */
export function starPoints(w: number, h: number, points = 5, inner = 0.45, star = true) {
  const out: Array<{ x: number; y: number }> = [];
  const n = star ? points * 2 : points;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = star && i % 2 === 1 ? inner : 1;
    out.push({ x: w / 2 + (w / 2) * r * Math.cos(a), y: h / 2 + (h / 2) * r * Math.sin(a) });
  }
  return out;
}

export type PenAnchor = { x: number; y: number; hx?: number; hy?: number };

/** SVG path for pen anchors; an anchor's handle (hx,hy) is its outgoing control point, mirrored inbound. */
export function penPath(anchors: PenAnchor[], closed: boolean) {
  if (!anchors.length) return "";
  const p = anchors;
  let d = `M ${p[0].x} ${p[0].y}`;
  const seg = (a: PenAnchor, b: PenAnchor) => {
    const out = a.hx !== undefined ? { x: a.hx, y: a.hy! } : a;
    const inn = b.hx !== undefined ? { x: 2 * b.x - b.hx, y: 2 * b.y - b.hy! } : b;
    return a.hx === undefined && b.hx === undefined ? ` L ${b.x} ${b.y}` : ` C ${out.x} ${out.y} ${inn.x} ${inn.y} ${b.x} ${b.y}`;
  };
  for (let i = 1; i < p.length; i++) d += seg(p[i - 1], p[i]);
  if (closed && p.length > 2) d += seg(p[p.length - 1], p[0]) + " Z";
  return d;
}
