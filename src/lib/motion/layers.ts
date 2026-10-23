/**
 * Free elements on a motion scene (Kezie, 2026-10-23: "enlarging images, or placing images in
 * various locations while editing"). Each scene keeps its template and can carry up to 12 layers
 * (pictures, words, shapes) the user places, sizes, turns and animates on the canvas. Positions
 * are fractions of the frame (x, y = the centre), so they hold at 9:16, 1:1 and 16:9. Layers draw
 * after the template, in order: the renderer has no z-index, so "bring forward" moves a layer later.
 */
export const LAYER_LIMIT = 12;
export const LAYER_ENTERS = ["none", "fade", "rise", "pop", "wipe", "draw"] as const;
export type LayerEnter = (typeof LAYER_ENTERS)[number];
export const LAYER_SHAPES = ["rect", "circle", "pill", "line"] as const;
export type LayerShape = (typeof LAYER_SHAPES)[number];

type Common = {
  id: string;
  x: number; y: number; w: number; h: number; // fractions of the frame; x, y = centre
  rotate: number; opacity: number; // degrees, 0..1
  enter: LayerEnter; delay: number; // seconds after the scene starts
  locked?: boolean;
};
export type ImageLayer = Common & { kind: "image"; src: string; fit: "cover" | "contain"; radius: number };
export type TextLayer = Common & { kind: "text"; text: string; size: number; weight: number; color: string; align: "left" | "center" | "right" };
export type ShapeLayer = Common & { kind: "shape"; shape: LayerShape; fill: string; radius: number };
export type MotionLayer = ImageLayer | TextLayer | ShapeLayer;

const HEX = /^#[0-9a-f]{6}$/i;
const HTTPS = /^https:\/\/[^\s"'<>]+$/i;
const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

let seq = 0;
export const layerId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A new layer in the middle of the frame, sized to suit what it is. */
export function newLayer(kind: "image", opts: { src: string; aspect?: number }): ImageLayer;
export function newLayer(kind: "text", opts?: { text?: string; color?: string }): TextLayer;
export function newLayer(kind: "shape", opts?: { shape?: LayerShape; fill?: string }): ShapeLayer;
export function newLayer(kind: MotionLayer["kind"], opts: Record<string, unknown> = {}): MotionLayer {
  const base: Common = { id: layerId(), x: 0.5, y: 0.5, w: 0.5, h: 0.3, rotate: 0, opacity: 1, enter: "pop", delay: 0.2 };
  if (kind === "image") {
    const a = clamp(opts.aspect, 0.2, 5, 1);
    const w = a >= 1 ? 0.56 : 0.42, h = Math.min(0.7, w / a);
    return { ...base, kind, w, h, src: String(opts.src), fit: "cover", radius: 0.04 };
  }
  if (kind === "text") return { ...base, kind, y: 0.3, w: 0.8, h: 0.14, enter: "rise", text: String(opts.text ?? "Your words"), size: 0.07, weight: 800, color: HEX.test(String(opts.color)) ? String(opts.color) : "#FFFFFF", align: "center" };
  return { ...base, kind: "shape", w: 0.3, h: 0.3, enter: "pop", shape: pick(opts.shape, LAYER_SHAPES, "circle"), fill: HEX.test(String(opts.fill)) ? String(opts.fill) : "#C6F432", radius: 0.1 };
}

/**
 * The layers a scene may keep. Pictures must be ones the studio offered (the planner can't invent
 * an image URL), words are capped, colours must be hex, and every number is clamped.
 */
export function cleanLayers(raw: unknown, images: Set<string>): MotionLayer[] {
  if (!Array.isArray(raw)) return [];
  const out: MotionLayer[] = [];
  for (const r of raw.slice(0, LAYER_LIMIT * 2)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const common: Common = {
      id: typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : layerId(),
      x: clamp(o.x, -0.5, 1.5, 0.5), y: clamp(o.y, -0.5, 1.5, 0.5),
      w: clamp(o.w, 0.02, 2, 0.4), h: clamp(o.h, 0.02, 2, 0.3),
      rotate: clamp(o.rotate, -180, 180, 0), opacity: clamp(o.opacity, 0, 1, 1),
      enter: pick(o.enter, LAYER_ENTERS, "fade"), delay: clamp(o.delay, 0, 30, 0),
      ...(o.locked === true ? { locked: true } : {}),
    };
    if (o.kind === "image") {
      const src = typeof o.src === "string" ? o.src.trim() : "";
      if (!HTTPS.test(src) || !images.has(src)) continue;
      out.push({ ...common, kind: "image", src, fit: o.fit === "contain" ? "contain" : "cover", radius: clamp(o.radius, 0, 0.5, 0) });
    } else if (o.kind === "text") {
      const text = typeof o.text === "string" ? o.text.replace(/\s+/g, " ").trim().slice(0, 200) : "";
      if (!text) continue;
      out.push({ ...common, kind: "text", text, size: clamp(o.size, 0.015, 0.4, 0.07), weight: Math.round(clamp(o.weight, 300, 900, 800) / 100) * 100, color: HEX.test(String(o.color)) ? String(o.color) : "#FFFFFF", align: pick(o.align, ["left", "center", "right"] as const, "center") });
    } else if (o.kind === "shape") {
      out.push({ ...common, kind: "shape", shape: pick(o.shape, LAYER_SHAPES, "rect"), fill: HEX.test(String(o.fill)) ? String(o.fill) : "#FFFFFF", radius: clamp(o.radius, 0, 0.5, 0) });
    }
    if (out.length >= LAYER_LIMIT) break;
  }
  return out;
}

/** Bring a layer forward or back one step (later in the list draws on top). */
export function reorderLayer(layers: MotionLayer[], id: string, by: number): MotionLayer[] {
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return layers;
  const j = Math.max(0, Math.min(layers.length - 1, i + by));
  if (i === j) return layers;
  const next = [...layers];
  const [l] = next.splice(i, 1);
  next.splice(j, 0, l);
  return next;
}

/** A copy a little down and to the right, so it's visible. */
export const duplicateLayer = (l: MotionLayer): MotionLayer => ({ ...l, id: layerId(), x: Math.min(1, l.x + 0.04), y: Math.min(1, l.y + 0.04), locked: undefined });

/** 0 → 1 as a layer arrives, from its delay over `seconds`. */
export function arrival(frame: number, fps: number, delay: number, seconds = 0.5) {
  const t = (frame / fps - delay) / seconds;
  return Math.max(0, Math.min(1, t));
}
