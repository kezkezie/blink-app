/**
 * Motion graphics (Kezie, 2026-10-15: "imagine if Claude could make motion graphics and put it
 * inside the video editor"; approved: Remotion, these 6 templates, straight through to clips on
 * the timeline). Claude writes a small spec, never code; our Remotion templates draw it in the
 * brand's colours, font and logo, so every letter is exact. Pure parts here (the spec, its checks,
 * timing, the prompt); the templates are in components/motion, the call in /api/editor/motion.
 */

export type MotionShape = "9:16" | "1:1" | "16:9";
export const MOTION_FPS = 30;
export const MOTION_CREDITS = 4;
export const MAX_MOTION_SECONDS = 30;

export type Palette = { background: string; text: string; accent: string };

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
export type MotionScene = KineticHeadline | Stat | ProductReveal | LogoSting | LowerThird | EndCard | ScreenStep;
export type MotionTemplate = MotionScene["template"];

/** "full": scenes fill the frame (intros, stats, end cards). "overlay": a see-through lower third over footage. */
export type MotionSpec = { kind: "full" | "overlay"; shape: MotionShape; palette: Palette; scenes: MotionScene[] };

export const MOTION_TEMPLATES: Array<{ id: MotionTemplate; label: string; line: string; seconds: [number, number] }> = [
  { id: "kinetic-headline", label: "Kinetic headline", line: "Words arrive one by one", seconds: [2.5, 6] },
  { id: "stat", label: "Number", line: "A number counts up", seconds: [2.5, 5] },
  { id: "product-reveal", label: "Product reveal", line: "Your product slides in on a card", seconds: [3, 6] },
  { id: "logo-sting", label: "Logo sting", line: "Your logo builds on", seconds: [2, 4] },
  { id: "lower-third", label: "Lower third", line: "A name or caption bar over footage", seconds: [3, 8] },
  { id: "end-card", label: "End card", line: "Call to action, handle, website", seconds: [3, 5] },
  { id: "screen", label: "App walkthrough step", line: "Your screenshot zooms to a button: a tap and a label", seconds: [3, 7] },
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
  return { background, text: fg, accent };
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
  const all = (Array.isArray(r.scenes) ? r.scenes : []).slice(0, 8).map((s) => scene(s, images)).filter((s): s is MotionScene => !!s);
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
  return { kind: overlay ? "overlay" : "full", shape: ctx.shape, palette: paletteFor(r.palette, ctx.brand), scenes: overlay ? kept.slice(0, 1) : kept };
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
  const words = s.template === "kinetic-headline" ? s.words : s.template === "stat" ? s.label : s.template === "product-reveal" ? s.name : s.template === "lower-third" ? s.title : s.template === "end-card" ? s.cta : s.template === "screen" ? s.label : s.tagline || "Logo";
  return `Motion · ${words}`.slice(0, 80);
}

export type MotionBrief = {
  brandName: string; industry?: string | null; prompt: string; shape: MotionShape;
  colours: string[]; font?: string | null; hasLogo: boolean;
  products: Array<{ ref: string; name: string; price?: string | null }>;
  pictures: Array<{ ref: string; title: string }>;
  look?: string | null; website?: string | null; handle?: string | null;
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
- {"template":"screen","seconds":3-7,"image":"a screenshot ref (S1...)","box":[x, y, width, height],"label":"what to do or see there, up to 10 words","sub":"optional, up to 10 words","device":"phone" | "laptop" | "none"}
Rules:
- "overlay" is only for a lower third shown over the user's footage: then exactly one lower-third scene and nothing else. Everything else is "full" and never uses lower-third.
- 1 to 5 scenes, 6 to 20 seconds in all unless asked otherwise. Open with a hook; a promo ends with an end-card.
- Short, punchy, exact words. Spell names, prices and numbers exactly as given. No emoji, no hashtags, no quotes around words.
- Use the brand's colours: one dominant background, high-contrast text, the accent for one thing that matters. Never light text on a light background.
- Only use picture refs, product names, prices, websites and handles you were given; never invent facts or numbers. If a number isn't given, don't use a stat.
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
  ].filter(Boolean).join("\n");
}
