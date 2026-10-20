"use client";

import { FabricImage, Point, util } from "fabric";
import { dilate, type RegionMap } from "@/lib/editor/regions";

/**
 * What the AI eraser and the magic outline mark on one photo (2026-10-20), in the photo's own pixels
 * scaled to a working size (at most 2048 px, the size AI tools get). Brushed and outlined areas and
 * picked map regions are kept apart, so a region can be un-picked; what shows over the photo is a
 * smaller tinted copy. Browser only.
 */
export const WORK_MAX = 2048;
const SHOW_MAX = 1024;

export type Marks = {
  /** Natural size of the photo, and the working size. */
  nw: number; nh: number; w: number; h: number;
  strokes: HTMLCanvasElement; regions: HTMLCanvasElement; display: HTMLCanvasElement;
  map: RegionMap | null; picked: Set<number>; hover: number;
  /** Anything brushed or outlined since the last clear. */
  painted: boolean;
};

const canvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const ctx = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true })!;

export function naturalSize(img: FabricImage) {
  const el = img.getElement() as HTMLImageElement | HTMLCanvasElement;
  return { nw: (el as HTMLImageElement).naturalWidth || el.width || img.width, nh: (el as HTMLImageElement).naturalHeight || el.height || img.height };
}

export function newMarks(img: FabricImage): Marks {
  const { nw, nh } = naturalSize(img);
  const s = Math.min(1, WORK_MAX / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * s)), h = Math.max(1, Math.round(nh * s));
  const d = Math.min(1, SHOW_MAX / Math.max(w, h));
  return { nw, nh, w, h, strokes: canvas(w, h), regions: canvas(w, h), display: canvas(Math.max(1, Math.round(w * d)), Math.max(1, Math.round(h * d))), map: null, picked: new Set(), hover: 0, painted: false };
}

/** A scene point (canvas units) in the photo's natural pixels, and back. */
export function sceneToPhoto(img: FabricImage, x: number, y: number) {
  const p = util.transformPoint(new Point(x, y), util.invertTransform(img.calcTransformMatrix()));
  return { x: p.x + img.width / 2, y: p.y + img.height / 2 };
}
export function photoToScene(img: FabricImage, x: number, y: number) {
  return util.transformPoint(new Point(x - img.width / 2, y - img.height / 2), img.calcTransformMatrix());
}
/** Natural photo pixels → working pixels. */
export const toWork = (m: Marks, x: number, y: number) => ({ x: (x * m.w) / m.nw, y: (y * m.h) / m.nh });

export function paintStroke(m: Marks, from: { x: number; y: number }, to: { x: number; y: number }, radius: number) {
  const c = ctx(m.strokes);
  c.globalCompositeOperation = "source-over";
  c.strokeStyle = c.fillStyle = "#fff";
  c.lineCap = c.lineJoin = "round";
  c.lineWidth = radius * 2;
  m.painted = true;
  c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(to.x, to.y); c.stroke();
  c.beginPath(); c.arc(to.x, to.y, radius, 0, Math.PI * 2); c.fill();
}

/** A closed outline (working pixels) filled into the brushed marks. */
export function fillOutline(m: Marks, pts: Array<{ x: number; y: number }>) {
  if (pts.length < 3) return;
  const c = ctx(m.strokes);
  c.globalCompositeOperation = "source-over";
  c.fillStyle = "#fff";
  m.painted = true;
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill();
}

export function clearMarks(m: Marks) {
  ctx(m.strokes).clearRect(0, 0, m.w, m.h);
  ctx(m.regions).clearRect(0, 0, m.w, m.h);
  m.picked.clear(); m.hover = 0; m.painted = false;
  repaint(m);
}

/** The map label under a working-pixel point (0 = nothing found there). */
export function labelAt(m: Marks, x: number, y: number) {
  if (!m.map) return 0;
  const lx = Math.floor((x * m.map.w) / m.w), ly = Math.floor((y * m.map.h) / m.h);
  if (lx < 0 || ly < 0 || lx >= m.map.w || ly >= m.map.h) return 0;
  return m.map.labels[ly * m.map.w + lx];
}

/** A map-sized picture of some labels (white, or the tint given). */
function labelsPicture(map: RegionMap, which: (id: number) => boolean, rgba: [number, number, number, number]) {
  const c = canvas(map.w, map.h);
  const im = new ImageData(map.w, map.h);
  for (let i = 0; i < map.labels.length; i++) {
    const id = map.labels[i];
    if (!id || !which(id)) continue;
    im.data[i * 4] = rgba[0]; im.data[i * 4 + 1] = rgba[1]; im.data[i * 4 + 2] = rgba[2]; im.data[i * 4 + 3] = rgba[3];
  }
  ctx(c).putImageData(im, 0, 0);
  return c;
}

export function togglePicked(m: Marks, id: number) {
  if (!m.map || !id) return;
  if (m.picked.has(id)) m.picked.delete(id); else m.picked.add(id);
  const r = ctx(m.regions);
  r.clearRect(0, 0, m.w, m.h);
  if (m.picked.size) { r.imageSmoothingEnabled = true; r.drawImage(labelsPicture(m.map, (x) => m.picked.has(x), [255, 255, 255, 255]), 0, 0, m.w, m.h); }
  repaint(m);
}

export const hasMarks = (m: Marks) => m.painted || m.picked.size > 0;

/** Redraw what shows: marked areas red, the thing under the pointer blue. */
export function repaint(m: Marks) {
  const c = ctx(m.display);
  const { width: dw, height: dh } = m.display;
  c.globalCompositeOperation = "source-over";
  c.clearRect(0, 0, dw, dh);
  c.drawImage(m.strokes, 0, 0, dw, dh);
  c.drawImage(m.regions, 0, 0, dw, dh);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = "rgba(255, 64, 64, 0.5)";
  c.fillRect(0, 0, dw, dh);
  c.globalCompositeOperation = "source-over";
  if (m.map && m.hover && !m.picked.has(m.hover)) c.drawImage(labelsPicture(m.map, (x) => x === m.hover, [80, 170, 255, 110]), 0, 0, dw, dh);
}

/**
 * The mask the eraser gets, at w×h (the size of the picture sent with it): white where marked,
 * grown a little so soft edges, halos and shadows-at-the-edge go too.
 */
export async function maskBlob(m: Marks, w: number, h: number): Promise<Blob> {
  const u = canvas(w, h);
  const c = ctx(u);
  c.imageSmoothingEnabled = true;
  c.drawImage(m.strokes, 0, 0, w, h);
  c.drawImage(m.regions, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = d[i * 4 + 3] > 24 ? 255 : 0;
  const grown = dilate(on, w, h, Math.max(2, Math.round(Math.max(w, h) / 220)));
  const out = new ImageData(w, h);
  for (let i = 0; i < grown.length; i++) { const v = grown[i]; out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v; out.data[i * 4 + 3] = 255; }
  c.putImageData(out, 0, 0);
  return new Promise((res, rej) => u.toBlob((b) => (b ? res(b) : rej(new Error("mask export failed"))), "image/png"));
}

/** The overlay that shows the marks, placed exactly over the photo (not saved, not exported). */
export function overlayFor(img: FabricImage, m: Marks) {
  const o = new FabricImage(m.display, {
    left: img.left, top: img.top, angle: img.angle, flipX: img.flipX, flipY: img.flipY, originX: img.originX, originY: img.originY,
    scaleX: (img.scaleX * img.width) / m.display.width, scaleY: (img.scaleY * img.height) / m.display.height,
    selectable: false, evented: false, excludeFromExport: true, objectCaching: false,
  });
  return o;
}

/** A photo's pixels with an outline cut out, kept alone, or copied (natural pixels). */
/** The photo before its adjust filters (a result made from the filtered one would be filtered twice). */
const original = (img: FabricImage) => ((img as unknown as { _originalElement?: CanvasImageSource })._originalElement ?? img.getElement()) as CanvasImageSource;

export async function cutWithOutline(img: FabricImage, pts: Array<{ x: number; y: number }>, mode: "erase" | "keep" | "copy") {
  const el = original(img);
  const { nw, nh } = naturalSize(img);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const box = mode === "copy"
    ? { x: Math.max(0, Math.floor(Math.min(...xs))), y: Math.max(0, Math.floor(Math.min(...ys))), r: Math.min(nw, Math.ceil(Math.max(...xs))), b: Math.min(nh, Math.ceil(Math.max(...ys))) }
    : { x: 0, y: 0, r: nw, b: nh };
  const w = Math.max(1, box.r - box.x), h = Math.max(1, box.b - box.y);
  const c = canvas(w, h);
  const x = ctx(c);
  const path = () => { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p.x - box.x, p.y - box.y) : x.moveTo(p.x - box.x, p.y - box.y))); x.closePath(); };
  x.drawImage(el, -box.x, -box.y, nw, nh);
  x.globalCompositeOperation = mode === "erase" ? "destination-out" : "destination-in";
  path(); x.fill();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
  return { blob, box: { x: box.x, y: box.y, w, h } };
}

/** A small copy of the photo for mapping and for the outline's edge search. */
export function workingPixels(img: FabricImage, max: number) {
  const el = img.getElement() as CanvasImageSource;
  const { nw, nh } = naturalSize(img);
  const s = Math.min(1, max / Math.max(nw, nh));
  const c = canvas(Math.max(1, Math.round(nw * s)), Math.max(1, Math.round(nh * s)));
  ctx(c).drawImage(el, 0, 0, c.width, c.height);
  return { canvas: c, w: c.width, h: c.height, data: ctx(c).getImageData(0, 0, c.width, c.height).data };
}
