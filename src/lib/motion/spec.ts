/**
 * Motion graphics (Kezie, 2026-10-15: "imagine if Claude could make motion graphics and put it
 * inside the video editor"; approved: Remotion, these 6 templates, straight through to clips on
 * the timeline). Claude writes a small spec, never code; our Remotion templates draw it in the
 * brand's colours, font and logo, so every letter is exact. Pure parts here (the spec, its checks,
 * timing, the prompt); the templates are in components/motion, the call in /api/editor/motion.
 */

import { cleanLayers, type MotionLayer } from "./layers";

export type MotionShape = "9:16" | "1:1" | "16:9";
export const MOTION_FPS = 30;
export const MOTION_CREDITS = 4;
export const MAX_MOTION_SECONDS = 30;
/** Where the Motion page picks up a plan from Video Inspo's "Make it as motion graphics" (one handoff, then cleared). */
export const MOTION_INSPO_HANDOFF_KEY = "blink-motion-inspo-plan";

/** second: a supporting colour for shapes (the sun behind a hill, a picture's circle); older specs have none. */
export type Palette = { background: string; text: string; accent: string; second?: string };

export type KineticHeadline = { template: "kinetic-headline"; seconds: number; words: string; sub?: string; enter: "word" | "line" | "slam" };
export type Stat = { template: "stat"; seconds: number; value: number; decimals: number; prefix?: string; suffix?: string; label: string };
export type ProductReveal = { template: "product-reveal"; seconds: number; image?: string; name: string; price?: string; tagline?: string };
export type LogoSting = { template: "logo-sting"; seconds: number; tagline?: string };
export type LowerThird = { template: "lower-third"; seconds: number; title: string; subtitle?: string };
export type EndCard = { template: "end-card"; seconds: number; cta: string; handle?: string; website?: string; logo: boolean };
/**
 * One step of an app walkthrough (Kezie, 2026-10-20: "motion graphics tutorials on what buttons do
 * what"): a screenshot in a phone or laptop frame, the camera easing in to one area (box, as
 * fractions of the screenshot), a tap there and a label saying what it does.
 */
export type ScreenStep = { template: "screen"; seconds: number; image: string; aspect: number; box: [number, number, number, number]; label: string; sub?: string; device: "phone" | "laptop" | "none" };
/**
 * The use cases of Claude's own motion graphics (Kezie, 2026-10-21, the "AI motion graphics" video):
 * numbers that move (bars), the before-and-after number (compare) and a post or notes turned into
 * key points (points).
 */
export type Bars = { template: "bars"; seconds: number; title: string; bars: Array<{ label: string; value: number }>; prefix?: string; suffix?: string; decimals: number; highlight?: number };
export type Compare = { template: "compare"; seconds: number; label: string; from: number; to: number; decimals: number; prefix?: string; suffix?: string; fromLabel?: string; toLabel?: string };
export type Points = { template: "points"; seconds: number; title: string; points: string[] };
/**
 * A story card (Kezie, 2026-10-21, motion quotes like @vibex_26's): stacked words in mixed sizes
 * (small connecting words around one big key word), soft shapes (floating circles, a hill rising,
 * a sun rising behind it) and a picture in a circle or a card. With no picture yet, "placeholder"
 * says which photo to add there; the studio swaps one in.
 */
export type StoryLine = { text: string; size: "s" | "m" | "l" | "xl"; accent: boolean; align: "left" | "center" | "right" };
export type Story = { template: "story"; seconds: number; lines: StoryLine[]; place: "top" | "center" | "bottom"; backdrop: "plain" | "dots" | "hill" | "sunrise"; picture?: string; placeholder?: string; frame: "circle" | "card" | "none"; enter: "blur" | "rise" | "pop" };
/** Every scene can carry free layers on top of its template (lib/motion/layers.ts, 2026-10-23). */
/**
 * Where the owner moved a part of what the AI made (Kezie, 2026-10-24: "drag it around, you know,
 * like almost like an image editor"): an offset as fractions of the frame and a size, applied on top
 * of the template's own layout and animation. Each template names its parts in PART_NAMES.
 */
export type PartNudge = { dx: number; dy: number; scale: number };
export type MotionScene = (KineticHeadline | Stat | ProductReveal | LogoSting | LowerThird | EndCard | ScreenStep | Bars | Compare | Points | Story) & { layers?: MotionLayer[]; parts?: Record<string, PartNudge> };
export type MotionTemplate = MotionScene["template"];

/** The parts of each template that can be moved and resized, with their names in the studio. */
export const PART_NAMES: Record<MotionTemplate, Record<string, string>> = {
  "kinetic-headline": { words: "Words", bar: "Bar", sub: "Smaller line" },
  stat: { bar: "Progress bar", number: "Number", label: "Label" },
  "product-reveal": { card: "Card", picture: "Picture", name: "Name", tagline: "Tagline", price: "Price" },
  "logo-sting": { ring: "Ring", logo: "Logo", tagline: "Tagline" },
  "lower-third": { bar: "Name bar" },
  "end-card": { logo: "Logo", button: "Button", details: "Handle and website" },
  screen: { device: "Screen", label: "Label" },
  bars: { title: "Title", chart: "Chart" },
  compare: { label: "Label", number: "Number", change: "Change" },
  points: { title: "Title", points: "Points" },
  story: { picture: "Picture", words: "Words" },
};

/** The moves kept for a scene: known parts only, within the frame's reach, and none that does nothing. */
export function cleanParts(raw: unknown, template: MotionTemplate): Record<string, PartNudge> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const names = PART_NAMES[template] ?? {};
  const out: Record<string, PartNudge> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(id in names) || !v || typeof v !== "object") continue;
    const n = v as Record<string, unknown>;
    const dx = Number(n.dx), dy = Number(n.dy), scale = Number(n.scale ?? 1);
    if (![dx, dy, scale].every(Number.isFinite)) continue;
    const p = { dx: clamp(dx, -1, 1), dy: clamp(dy, -1, 1), scale: clamp(scale, 0.2, 4) };
    if (Math.abs(p.dx) < 1e-4 && Math.abs(p.dy) < 1e-4 && Math.abs(p.scale - 1) < 1e-3) continue;
    out[id] = { dx: Math.round(p.dx * 10000) / 10000, dy: Math.round(p.dy * 10000) / 10000, scale: Math.round(p.scale * 1000) / 1000 };
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * "full": scenes fill the frame (intros, stats, end cards). "overlay": a see-through lower third over
 * footage. `background` (Kezie, 2026-10-22: "animate vectors over a real frame"): a picture the clip
 * plays over, with a slow ken-burns move and a scrim so text stays readable — the motion-graphics
 * look on an AI frame or any photo. The scenes animate on top of it.
 */
export type MotionSpec = { kind: "full" | "overlay"; shape: MotionShape; palette: Palette; scenes: MotionScene[]; background?: string; look?: string; font?: string };

const HTTPS = /^https:\/\/[^\s"'<>]+$/i;

export const MOTION_TEMPLATES: Array<{ id: MotionTemplate; label: string; line: string; seconds: [number, number] }> = [
  { id: "kinetic-headline", label: "Kinetic headline", line: "Words arrive one by one", seconds: [2.5, 6] },
  { id: "stat", label: "Number", line: "A number counts up", seconds: [2.5, 5] },
  { id: "product-reveal", label: "Product reveal", line: "Your product slides in on a card", seconds: [3, 6] },
  { id: "logo-sting", label: "Logo sting", line: "Your logo builds on", seconds: [2, 4] },
  { id: "lower-third", label: "Lower third", line: "A name or caption bar over footage", seconds: [3, 8] },
  { id: "end-card", label: "End card", line: "Call to action, handle, website", seconds: [3, 5] },
  { id: "screen", label: "App walkthrough step", line: "Your screenshot zooms to a button: a tap and a label", seconds: [3, 7] },
  { id: "bars", label: "Bar chart", line: "Your numbers grow into bars, counting up", seconds: [4, 8] },
  { id: "compare", label: "Before and after", line: "One number turns into another", seconds: [3, 6] },
  { id: "points", label: "Key points", line: "Points arrive one by one, from a post or notes", seconds: [4, 10] },
  { id: "story", label: "Story card", line: "Stacked words, soft shapes and a picture, like a motion quote", seconds: [2, 7] },
];

const HEX = /^#[0-9a-f]{6}$/i;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const opt = (v: unknown, max: number) => text(v, max) || undefined;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const words = (s: string, n: number) => s.split(" ").slice(0, n).join(" ");

/** Readable text on a background: the darker or lighter of the brand's own colours. */
export function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The palette, checked: brand colours where given, and text that is readable on the background. */
export function paletteFor(raw: unknown, brand: { primary?: string | null; secondary?: string | null }): Palette {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown, fallback: string) => { const s = text(v, 9).toUpperCase(); return HEX.test(s) ? s : fallback; };
  const primary = brand.primary && HEX.test(brand.primary) ? brand.primary.toUpperCase() : "#6D5BFF";
  const secondary = brand.secondary && HEX.test(brand.secondary) ? brand.secondary.toUpperCase() : "#111111";
  const background = pick(r.background, luminance(secondary) < 0.2 ? secondary : "#111111");
  let fg = pick(r.text, luminance(background) > 0.4 ? "#111111" : "#FFFFFF");
  if (contrast(fg, background) < 4.5) fg = luminance(background) > 0.4 ? "#111111" : "#FFFFFF";
  let accent = pick(r.accent, primary);
  if (accent === background) accent = fg;
  // The supporting colour: as given, else the brand's other colour when it shows on the background, else a lighter accent.
  const other = [secondary, primary].find((c) => c !== accent && c !== background && contrast(c, background) >= 1.4);
  let second = pick(r.second, other ?? mixHex(accent, luminance(accent) > 0.5 ? "#000000" : "#FFFFFF", 0.45));
  if (second === background) second = mixHex(accent, "#FFFFFF", 0.45);
  return { background, text: fg, accent, second };
}

/** a, moved `amount` of the way to b. */
export function mixHex(a: string, b: string, amount: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return `#${[1, 3, 5].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * amount).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function scene(raw: unknown, images: Set<string>): MotionScene | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const t = MOTION_TEMPLATES.find((m) => m.id === r.template);
  if (!t) return null;
  const n = Number(r.seconds);
  const seconds = Math.round(clamp(Number.isFinite(n) ? n : (t.seconds[0] + t.seconds[1]) / 2, t.seconds[0], t.seconds[1]) * 10) / 10;
  switch (t.id) {
    case "kinetic-headline": {
      const w = words(text(r.words, 90), 10);
      if (!w) return null;
      return { template: t.id, seconds, words: w, sub: opt(r.sub, 60), enter: r.enter === "line" || r.enter === "slam" ? r.enter : "word" };
    }
    case "stat": {
      const value = Number(r.value);
      const label = words(text(r.label, 60), 8);
      if (!Number.isFinite(value) || Math.abs(value) > 1e12 || !label) return null;
      const d = Number(r.decimals);
      // Money or a percentage, never both ("$200%" came back for "200 pairs").
      const suffix = opt(r.suffix, 6);
      const prefix = suffix === "%" ? undefined : opt(r.prefix, 4);
      return { template: t.id, seconds, value, decimals: Number.isInteger(d) ? clamp(d, 0, 2) : Number.isInteger(value) ? 0 : 2, prefix, suffix, label };
    }
    case "product-reveal": {
      const name = words(text(r.name, 50), 6);
      if (!name) return null;
      const image = typeof r.image === "string" && images.has(r.image) ? r.image : undefined;
      return { template: t.id, seconds, image, name, price: opt(r.price, 20), tagline: opt(r.tagline, 60) };
    }
    case "logo-sting":
      return { template: t.id, seconds, tagline: opt(r.tagline, 50) };
    case "lower-third": {
      const title = words(text(r.title, 50), 7);
      if (!title) return null;
      return { template: t.id, seconds, title, subtitle: opt(r.subtitle, 60) };
    }
    case "end-card": {
      const cta = words(text(r.cta, 40), 6);
      if (!cta) return null;
      return { template: t.id, seconds, cta, handle: opt(r.handle, 40), website: opt(r.website, 60), logo: r.logo !== false };
    }
    case "bars": {
      const title = words(text(r.title, 70), 10);
      const bars = (Array.isArray(r.bars) ? r.bars : []).slice(0, 8).map((b) => ({ label: words(text((b as { label?: unknown })?.label, 24), 3), value: Number((b as { value?: unknown })?.value) }))
        .filter((b) => b.label && Number.isFinite(b.value) && Math.abs(b.value) <= 1e12);
      if (!title || bars.length < 2) return null;
      const suffix = opt(r.suffix, 6);
      const d = Number(r.decimals);
      const h = Number(r.highlight);
      return { template: t.id, seconds, title, bars, suffix, prefix: suffix === "%" ? undefined : opt(r.prefix, 4), decimals: Number.isInteger(d) ? clamp(d, 0, 2) : bars.every((b) => Number.isInteger(b.value)) ? 0 : 1, highlight: Number.isInteger(h) && h >= 0 && h < bars.length ? h : undefined };
    }
    case "compare": {
      const label = words(text(r.label, 60), 8);
      const from = Number(r.from), to = Number(r.to);
      if (!label || !Number.isFinite(from) || !Number.isFinite(to) || Math.abs(from) > 1e12 || Math.abs(to) > 1e12 || from === to) return null;
      const suffix = opt(r.suffix, 6);
      const d = Number(r.decimals);
      return { template: t.id, seconds, label, from, to, suffix, prefix: suffix === "%" ? undefined : opt(r.prefix, 4), decimals: Number.isInteger(d) ? clamp(d, 0, 2) : Number.isInteger(from) && Number.isInteger(to) ? 0 : 1, fromLabel: opt(r.fromLabel, 20), toLabel: opt(r.toLabel, 20) };
    }
    case "points": {
      const title = words(text(r.title, 70), 10);
      const points = (Array.isArray(r.points) ? r.points : []).map((x) => words(text(x, 80), 10)).filter(Boolean).slice(0, 5);
      if (!title || points.length < 2) return null;
      return { template: t.id, seconds, title, points };
    }
    case "story": {
      const SIZES = ["s", "m", "l", "xl"] as const, ALIGN = ["left", "center", "right"] as const;
      const lines = (Array.isArray(r.lines) ? r.lines : []).slice(0, 6).map((x) => {
        const l = (x && typeof x === "object" ? x : { text: x }) as Record<string, unknown>;
        const t = words(text(l.text, 40), 5);
        return t ? { text: t, size: SIZES.find((z) => z === l.size) ?? "m", accent: l.accent === true, align: ALIGN.find((z) => z === l.align) ?? "center" } : null;
      }).filter((l): l is StoryLine => !!l);
      const picture = typeof r.picture === "string" && images.has(r.picture) ? r.picture : undefined;
      const placeholder = picture ? undefined : opt(r.placeholder, 70);
      if (!lines.length && !picture && !placeholder) return null;
      const place = r.place === "top" || r.place === "bottom" ? r.place : "center";
      const backdrop = r.backdrop === "dots" || r.backdrop === "hill" || r.backdrop === "sunrise" ? r.backdrop : "plain";
      const frame = r.frame === "card" || r.frame === "none" ? r.frame : "circle";
      const enter = r.enter === "rise" || r.enter === "pop" ? r.enter : "blur";
      return { template: t.id, seconds, lines, place, backdrop, ...(picture ? { picture } : {}), ...(placeholder ? { placeholder } : {}), frame, enter };
    }
    case "screen": {
      const image = typeof r.image === "string" && images.has(r.image) ? r.image : null;
      const label = words(text(r.label, 70), 10);
      const b = Array.isArray(r.box) ? r.box.map(Number) : [];
      const aspect = Number(r.aspect);
      if (!image || !label || b.length !== 4 || b.some((n) => !Number.isFinite(n)) || !Number.isFinite(aspect) || aspect <= 0) return null;
      // A box as fractions of the screenshot, kept inside it and not vanishingly small.
      const x = clamp(b[0], 0, 0.98), y = clamp(b[1], 0, 0.98);
      const box: [number, number, number, number] = [x, y, clamp(b[2], 0.02, 1 - x), clamp(b[3], 0.02, 1 - y)];
      const device = r.device === "laptop" || r.device === "none" ? r.device : r.device === "phone" ? "phone" : aspect > 1.2 ? "laptop" : "phone";
      return { template: t.id, seconds, image, aspect: clamp(aspect, 0.3, 3), box, label, sub: opt(r.sub, 70), device };
    }
  }
}

/**
 * A spec as Claude (or the browser, after edits) gave it, checked: known templates only, word
 * limits, lengths within each template's range and 30 s in all, colours as hex, images only from
 * the list the server offered. A lower third is see-through, so it travels alone ("overlay").
 */
export function validateMotionSpec(raw: unknown, ctx: { shape: MotionShape; brand: { primary?: string | null; secondary?: string | null }; images?: string[] }): MotionSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const images = new Set(ctx.images ?? []);
  // Free layers ride along on each scene (pictures only from what was offered, like everything else).
  const all = (Array.isArray(r.scenes) ? r.scenes : []).slice(0, 8).map((s) => {
    const sc = scene(s, images);
    const layers = sc && s && typeof s === "object" ? cleanLayers((s as Record<string, unknown>).layers, images) : [];
    const parts = sc && s && typeof s === "object" ? cleanParts((s as Record<string, unknown>).parts, sc.template) : undefined;
    return sc ? ({ ...sc, ...(layers.length ? { layers } : {}), ...(parts ? { parts } : {}) } as MotionScene) : sc;
  }).filter((s): s is MotionScene => !!s);
  const overlay = r.kind === "overlay" || (all.length > 0 && all.every((s) => s.template === "lower-third"));
  const scenes = all.filter((s) => (overlay ? s.template === "lower-third" : s.template !== "lower-third"));
  const kept: MotionScene[] = [];
  let total = 0;
  for (const s of scenes) {
    if (total + s.seconds > MAX_MOTION_SECONDS) break;
    kept.push(s);
    total += s.seconds;
  }
  if (!kept.length) return null;
  // A background picture travels with a "full" clip (never under a see-through lower third). Only an
  // image the caller offered is kept, so the model can never invent one (a made-up stock URL would
  // also break the in-browser render). The server sets the handed-off picture after validating;
  // the studio passes the current background in `images` when it re-checks before a render.
  const bgRaw = typeof r.background === "string" ? r.background.trim() : "";
  const bg = bgRaw && HTTPS.test(bgRaw) && images.has(bgRaw) ? bgRaw : undefined;
  // A look (lib/motion/looks.ts) and its typeface: names only, checked by shape (an unknown look draws plain).
  const look = typeof r.look === "string" && /^[a-z0-9-]{2,24}$/.test(r.look) ? r.look : undefined;
  const font = typeof r.font === "string" && /^[A-Za-z0-9 ]{2,40}$/.test(r.font.trim()) ? r.font.trim() : undefined;
  return { kind: overlay ? "overlay" : "full", shape: ctx.shape, palette: paletteFor(r.palette, ctx.brand), scenes: overlay ? kept.slice(0, 1) : kept, ...(bg && !overlay ? { background: bg } : {}), ...(look ? { look } : {}), ...(font ? { font } : {}) };
}

/**
 * Animate a picture (Kezie, 2026-10-22). A deterministic overlay clip: the picture as the moving
 * background, a kinetic headline, and an end card with the brand's call to action — the vector/text
 * motion-graphics look on a real frame, no AI call. Words come from the brief and the brand.
 */
export function overlayOnPicture(opts: {
  picture: string; shape: MotionShape; brand: { primary?: string | null; secondary?: string | null }; headline: string; sub?: string; cta?: string; handle?: string; website?: string;
}): MotionSpec {
  const palette = paletteFor(null, opts.brand);
  const words = (opts.headline || "").trim().slice(0, 90) || "Your brand, in motion";
  const scenes: MotionScene[] = [
    { template: "kinetic-headline", seconds: 3, words, ...(opts.sub ? { sub: opts.sub.slice(0, 60) } : {}), enter: "word" },
  ];
  if (opts.cta || opts.handle || opts.website) {
    scenes.push({ template: "end-card", seconds: 2.5, cta: (opts.cta || "Learn more").slice(0, 40), ...(opts.handle ? { handle: opts.handle.slice(0, 40) } : {}), ...(opts.website ? { website: opts.website.slice(0, 60) } : {}), logo: true });
  }
  return { kind: "full", shape: opts.shape, palette, scenes, background: opts.picture };
}

/**
 * Claude's screen steps point at a screenshot ref (S1...) with a box in that screenshot's pixels;
 * here the ref becomes our URL and the box fractions of the picture. A step whose ref isn't one of
 * ours loses its picture (and is dropped by validateMotionSpec).
 */
export function placeScreens(raw: unknown, screens: Array<{ ref: string; url: string; width: number; height: number }>): unknown {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { scenes?: unknown }).scenes)) return raw;
  const byRef = new Map(screens.map((x) => [x.ref, x]));
  const scenes = ((raw as { scenes: unknown[] }).scenes).map((sc) => {
    if (!sc || typeof sc !== "object" || (sc as { template?: unknown }).template !== "screen") return sc;
    const r = sc as Record<string, unknown>;
    const x = byRef.get(String(r.image));
    const b = Array.isArray(r.box) ? r.box.map(Number) : [];
    if (!x || b.length !== 4 || !x.width || !x.height) return { ...r, image: null };
    return { ...r, image: x.url, aspect: x.width / x.height, box: [b[0] / x.width, b[1] / x.height, b[2] / x.width, b[3] / x.height] };
  });
  return { ...(raw as object), scenes };
}

export const sceneFrames = (s: MotionScene) => Math.round(s.seconds * MOTION_FPS);
export const totalFrames = (spec: MotionSpec) => spec.scenes.reduce((n, s) => n + sceneFrames(s), 0);
export const totalSeconds = (spec: MotionSpec) => totalFrames(spec) / MOTION_FPS;

export function sizeFor(shape: MotionShape) {
  return shape === "9:16" ? { width: 1080, height: 1920 } : shape === "1:1" ? { width: 1080, height: 1080 } : { width: 1920, height: 1080 };
}

/** A short name for the Library and the timeline. */
export function motionTitle(spec: MotionSpec) {
  const s = spec.scenes[0];
  const words = s.template === "kinetic-headline" ? s.words : s.template === "stat" ? s.label : s.template === "product-reveal" ? s.name : s.template === "lower-third" ? s.title : s.template === "end-card" ? s.cta : s.template === "screen" ? s.label : s.template === "bars" || s.template === "points" ? s.title : s.template === "compare" ? s.label : s.template === "story" ? (s.lines.map((l) => l.text).join(" ") || s.placeholder || "Story") : s.tagline || "Logo";
  return `Motion · ${words}`.slice(0, 80);
}

export type MotionBrief = {
  brandName: string; industry?: string | null; prompt: string; shape: MotionShape;
  colours: string[]; font?: string | null; hasLogo: boolean;
  products: Array<{ ref: string; name: string; price?: string | null }>;
  pictures: Array<{ ref: string; title: string }>;
  look?: string | null; website?: string | null; handle?: string | null;
  /** Text or numbers the user pasted (a post, notes, a table), the material to work from. */
  source?: string | null;
  /** Screenshots for an app walkthrough, attached to the message in this order. */
  screens?: Array<{ ref: string; width: number; height: number }>;
};

export const MOTION_SYSTEM = `You are BlinkSpot's motion designer. You plan short brand motion graphics from a fixed kit of animated templates. You never write code: reply with JSON only, matching this shape:
{"kind":"full" | "overlay","palette":{"background":"#RRGGBB","text":"#RRGGBB","accent":"#RRGGBB"},"scenes":[ ...scenes in order... ]}
Templates (each scene is one of these; "seconds" within the range):
- {"template":"kinetic-headline","seconds":2.5-6,"words":"up to 10 words","sub":"optional, up to 8 words","enter":"word" | "line" | "slam"}
- {"template":"stat","seconds":2.5-5,"value":12.5,"decimals":0-2,"prefix":"only for money, e.g. $","suffix":"only for a unit, e.g. % or k","label":"up to 8 words"} (a plain count like 200 pairs has neither: put the unit in the label)
- {"template":"product-reveal","seconds":3-6,"image":"one of the given picture refs, optional","name":"product name","price":"optional, as written","tagline":"optional, up to 8 words"}
- {"template":"logo-sting","seconds":2-4,"tagline":"optional, up to 6 words"}
- {"template":"lower-third","seconds":3-8,"title":"name or caption, up to 7 words","subtitle":"optional"}
- {"template":"end-card","seconds":3-5,"cta":"call to action, up to 6 words","handle":"optional @handle","website":"optional","logo":true}
- {"template":"bars","seconds":4-8,"title":"what the numbers show, up to 10 words","bars":[{"label":"up to 3 words","value":123}, ...2 to 8 bars in order],"prefix":"optional, e.g. $","suffix":"optional, e.g. % or k","decimals":0-2,"highlight":"optional index of the bar that matters"}
- {"template":"compare","seconds":3-6,"label":"what changed, up to 8 words, e.g. Churn, down to","from":8.4,"to":0.9,"decimals":0-2,"prefix":"optional","suffix":"optional, e.g. %","fromLabel":"optional, e.g. Last year","toLabel":"optional, e.g. This year"}
- {"template":"points","seconds":4-10,"title":"up to 10 words","points":["2 to 5 points, each up to 10 words"]}
- {"template":"story","seconds":2-7,"lines":[{"text":"1 to 5 words","size":"s|m|l|xl","accent":true|false,"align":"left|center|right"}, ...0 to 6 lines, top to bottom],"place":"top|center|bottom","backdrop":"plain|dots|hill|sunrise","picture":"optional picture ref","placeholder":"only when no given picture fits: the photo to add here, up to 8 words","frame":"circle|card|none","enter":"blur|rise|pop"}
- {"template":"screen","seconds":3-7,"image":"a screenshot ref (S1...)","box":[x, y, width, height],"label":"what to do or see there, up to 10 words","sub":"optional, up to 10 words","device":"phone" | "laptop" | "none"}
Palette may also have "second": a supporting colour for shapes (the sun, a picture's circle).
Rules:
- "overlay" is only for a lower third shown over the user's footage: then exactly one lower-third scene and nothing else. Everything else is "full" and never uses lower-third.
- 1 to 5 scenes, 6 to 20 seconds in all unless asked otherwise. Open with a hook; a promo ends with an end-card.
- Short, punchy, exact words. Spell names, prices and numbers exactly as given. No emoji, no hashtags, no quotes around words.
- Use the brand's colours: one dominant background, high-contrast text, the accent for one thing that matters. Never light text on a light background.
- Only use picture refs, product names, prices, websites and handles you were given; never invent facts or numbers. If a number isn't given, don't use a stat.
- Plan like a director, not a list: each scene has one job, the strongest moment comes first or last, and the words are the exact ones to show.
- An explainer ("explain how X works"): a hook headline, then one idea per scene (kinetic-headline, stat, compare or points), then the takeaway or an end-card.
- Numbers given (a table, a list, results, a CSV): use bars for 2 to 8 values, compare for a before and after, stat for one number. Only the numbers given; never invent one.
- A post, article or notes given: pull out the 3 to 5 points that matter most, in the order they appear, in short words (points), with a headline first and an end-card last.
- Story cards are for motion quotes and kinetic stories: small connecting words (size s or m) around one or two key words (l or xl, accent), stacked and offset left and right, one thought per card. Backdrops: dots (soft floating circles), hill (a big accent hill rises from the bottom; words on it with place "bottom"), sunrise (a sun in the second colour rises behind the hill). A picture shows in a circle (frame circle), a card, or as it is (none); a poster or any picture with words on it (its title says so) goes in a card, never a circle, which would crop its words.
- Screenshots given (an app or website walkthrough, a tutorial, "how it works", "what this button does"): one "screen" scene per step, in the order of the steps, using up to 6 scenes plus an optional opening kinetic-headline and a closing end-card (up to 8 scenes, 30 s). "box" is the rectangle around the exact button, field or area that step is about, in PIXELS of that screenshot (its size is given): look at it carefully and make the box fit the element snugly. The label is an instruction or the benefit, e.g. "Tap Generate to make your poster". "phone" for tall screenshots, "laptop" for wide ones.`;

export function motionUserPrompt(b: MotionBrief) {
  return [
    `Brand: ${b.brandName}${b.industry ? ` (${b.industry})` : ""}`,
    `Shape: ${b.shape}`,
    `Brand colours: ${b.colours.length ? b.colours.join(", ") : "none set"}${b.font ? ` · font: ${b.font}` : ""} · logo: ${b.hasLogo ? "yes" : "none"}`,
    b.website ? `Website: ${b.website}` : "",
    b.handle ? `Handle: ${b.handle}` : "",
    b.look ? `How this industry's best posts look: ${b.look}` : "",
    b.products.length ? `Products (picture ref: name · price): ${b.products.map((p) => `${p.ref}: ${p.name}${p.price ? ` · ${p.price}` : ""}`).join("; ")}` : "",
    b.pictures.length ? `Other pictures (ref: title): ${b.pictures.map((p) => `${p.ref}: ${p.title}`).join("; ")}` : "",
    b.screens?.length ? `Screenshots, attached above in this order (ref: width x height px): ${b.screens.map((x) => `${x.ref}: ${x.width} x ${x.height}`).join("; ")}` : "",
    `What they want: ${b.prompt}`,
    b.source ? `Material they gave (use its words and numbers; nothing else):\n"""\n${b.source}\n"""` : "",
  ].filter(Boolean).join("\n");
}

/**
 * A new scene for "+ Scene" in the studio (2026-10-23): a ready-to-edit default for each template
 * (a walkthrough step needs a screenshot and a lower third its own clip, so those aren't offered).
 */
export const ADDABLE_TEMPLATES: MotionTemplate[] = ["kinetic-headline", "story", "points", "stat", "bars", "compare", "product-reveal", "logo-sting", "end-card"];
export function blankScene(template: MotionTemplate, brandName = "your brand"): MotionScene {
  switch (template) {
    case "stat": return { template, seconds: 3.5, value: 100, decimals: 0, suffix: "%", label: "of customers come back" };
    case "bars": return { template, seconds: 5, title: "This year", bars: [{ label: "Q1", value: 40 }, { label: "Q2", value: 65 }, { label: "Q3", value: 90 }], decimals: 0 };
    case "compare": return { template, seconds: 4, label: "Orders a week", from: 120, to: 480, decimals: 0, fromLabel: "Before", toLabel: "Now" };
    case "points": return { template, seconds: 6, title: `Why ${brandName}`, points: ["Fast delivery", "Fair prices", "Made with care"] };
    case "product-reveal": return { template, seconds: 4, name: "Your product", tagline: "Made for you" };
    case "logo-sting": return { template, seconds: 3, tagline: brandName };
    case "end-card": return { template, seconds: 3.5, cta: "Shop now", logo: true };
    case "story": return { template, seconds: 4, lines: [{ text: "Big idea", size: "xl", accent: true, align: "center" }, { text: "in a few words", size: "m", accent: false, align: "center" }], place: "center", backdrop: "dots", frame: "none", enter: "rise" };
    default: return { template: "kinetic-headline", seconds: 3, words: "Your headline here", enter: "word" };
  }
}
