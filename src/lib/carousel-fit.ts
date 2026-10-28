import { coverRect, wholeRect } from "@/lib/carousel";

/** Drawing carousel slides in the browser (canvas): shared by Carousel Studio and a post's slides. */
export const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => resolve(im); im.onerror = () => reject(new Error("picture")); im.src = url;
});
/** A picture's size (no CORS needed, nothing is drawn). */
export const measureImage = (url: string) => new Promise<{ w: number; h: number }>((resolve, reject) => {
  const im = new Image(); im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => reject(new Error("picture")); im.src = url;
});
export const canvasBlob =(c: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.92));

/**
 * A picture fitted to a w×h slide: cropped (centred) to fill it, or whole on a blurred copy of
 * itself, so a poster's headline or a tall photo's top isn't cut off (2026-10-28).
 */
export type Fit = "fill" | "whole";
export async function fitTo(url: string, size: { w: number; h: number }, fit: Fit) {
  const im = await loadImage(url);
  const { w, h } = size;
  const r = coverRect(im.naturalWidth, im.naturalHeight, w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  if (fit === "fill") { ctx.drawImage(im, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h); return canvasBlob(c); }
  // The blur: the filled picture shrunk to a few pixels and stretched back in two steps (smooth in
  // every browser; Safari's canvas has no filter).
  const shrink = (from: CanvasImageSource, sw: number, src?: typeof r) => {
    const t = document.createElement("canvas"); t.width = sw; t.height = Math.max(1, Math.round((sw * h) / w));
    const g = t.getContext("2d")!;
    if (src) g.drawImage(from, src.sx, src.sy, src.sw, src.sh, 0, 0, t.width, t.height); else g.drawImage(from, 0, 0, t.width, t.height);
    return t;
  };
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(shrink(shrink(im, 24, r), 160), 0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(0, 0, w, h);
  const d = wholeRect(im.naturalWidth, im.naturalHeight, w, h);
  ctx.drawImage(im, d.dx, d.dy, d.dw, d.dh);
  return canvasBlob(c);
}
