/**
 * Carousels (Kezie, 2026-10-16: "a long image... divide it into three", "a normal carousel where
 * you upload three images at once", one Library card you swipe, each slide editable; references:
 * a seamless Canva carousel, 4 x 1080 = 4320 x 1350 with zero-gap guides and pictures across the
 * lines, and Canva's "Carousel Studio": topic, number of slides, theme, outline, designed slides).
 * Three ways in: seamless (one wide picture cut into slides), from a topic (Claude writes the
 * outline, our templates draw exact text), from pictures. A carousel is one post with its slides
 * in image_urls (publishing already sends them all, which Instagram posts as a carousel).
 */

export type SlideShape = "4:5" | "1:1";
export const SLIDE_SIZE: Record<SlideShape, { w: number; h: number }> = { "4:5": { w: 1080, h: 1350 }, "1:1": { w: 1080, h: 1080 } };
export const MAX_SLIDES = 10;
export const PLAN_CREDITS = 4;

/** The image shapes the generator can make, as width/height. */
const WIDE: Array<{ aspect: string; r: number }> = [{ aspect: "16:9", r: 16 / 9 }, { aspect: "21:9", r: 21 / 9 }];

/**
 * For a seamless carousel: which wide picture to ask for, and how much of it survives the exact
 * crop. 3 portrait slides (2.4:1) come from 21:9 with 3% cropped; 2 square slides (2:1) from 21:9
 * or 16:9 with about 11%. More than 3 slides would lose too much, so seamless stops at 3.
 */
export function seamlessPlan(slides: number, shape: SlideShape) {
  const n = Math.min(3, Math.max(2, Math.round(slides)));
  const { w, h } = SLIDE_SIZE[shape];
  const target = (n * w) / h;
  const best = WIDE.reduce((a, b) => (Math.abs(Math.log(b.r / target)) < Math.abs(Math.log(a.r / target)) ? b : a));
  const kept = best.r > target ? target / best.r : best.r / target;
  return { slides: n, aspect: best.aspect, target, kept: Math.round(kept * 100) / 100, width: n * w, height: h };
}

/** Where each slide comes from in a picture: first cropped (centred) to the exact total ratio, then cut in equal parts. */
export function sliceRects(imgW: number, imgH: number, slides: number, shape: SlideShape) {
  const { w, h } = SLIDE_SIZE[shape];
  const target = (slides * w) / h;
  let cw = imgW, ch = imgH;
  if (imgW / imgH > target) cw = Math.round(imgH * target); else ch = Math.round(imgW / target);
  const x0 = Math.round((imgW - cw) / 2), y0 = Math.round((imgH - ch) / 2);
  const sw = cw / slides;
  return Array.from({ length: slides }, (_, i) => ({ sx: Math.round(x0 + i * sw), sy: y0, sw: Math.round(sw), sh: ch, out: { w, h } }));
}

/** The part of a picture that fills a w×h slide (cropped, centred). */
export function coverRect(imgW: number, imgH: number, w: number, h: number) {
  const s = Math.max(w / imgW, h / imgH);
  const sw = Math.round(w / s), sh = Math.round(h / s);
  return { sx: Math.round((imgW - sw) / 2), sy: Math.round((imgH - sh) / 2), sw, sh };
}

/** Where a whole picture sits on a w×h slide (fitted inside it, centred), when it isn't cropped. */
export function wholeRect(imgW: number, imgH: number, w: number, h: number) {
  const s = Math.min(w / imgW, h / imgH);
  const dw = Math.round(imgW * s), dh = Math.round(imgH * s);
  return { dx: Math.round((w - dw) / 2), dy: Math.round((h - dh) / 2), dw, dh };
}

/** The slide size that matches a carousel's cover (1080 wide, kept between 16:9 and 9:16). */
export function slideSizeLike(coverW: number, coverH: number) {
  const ratio = Math.min(16 / 9, Math.max(9 / 16, coverW / coverH));
  return { w: 1080, h: Math.round(1080 / ratio) };
}

/**
 * The seamless brief. Telling the model the picture "will be cut into slides" made it draw three
 * separate panels (the skyline repeated in each; judged 3/10). Asking for one continuous panorama
 * with the subjects spread out, and no words (type goes on per slide in the Editor), judged 8/10.
 */
export function seamlessPrompt(brief: string, slides: number) {
  return `${brief.trim()}
ONE single continuous panoramic photograph, extra wide: one wide-angle shot from a single camera position, one moment, one place. The background (sky, horizon, buildings or walls), the ground and the light are the same continuous scene from the far left edge to the far right edge. Not a triptych, not a collage, no panels, no borders, no dividing lines, no repeated or mirrored elements. Long elements (a ledge, a road, a horizon, a stripe of colour) run unbroken across the whole width, and the ${slides === 3 ? "subjects are spread out along it from left to right" : "subject and the scene stretch across it"}, with open space between them. No words or text anywhere.`;
}

export type TopicSlide =
  | { kind: "cover"; title: string; sub?: string; image?: string }
  | { kind: "point"; number?: number; title: string; body?: string; image?: string }
  | { kind: "stat"; value: string; label: string; image?: string }
  | { kind: "quote"; quote: string; by?: string }
  | { kind: "end"; title: string; cta?: string; handle?: string };
export type TopicCarousel = { slides: TopicSlide[]; caption?: string };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const opt = (v: unknown, max: number) => text(v, max) || undefined;
const words = (s: string, n: number) => s.split(" ").slice(0, n).join(" ");

/**
 * Claude's outline, checked: 3 to 10 slides, short words, a cover first and an end card last.
 * Pictures only from the ones offered (refs from the server, or URLs once the browser has them).
 */
export function validateTopicCarousel(raw: unknown, pictures: string[] = []): TopicCarousel | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const list = Array.isArray(r.slides) ? r.slides : [];
  const allowed = new Set(pictures);
  const pic = (v: unknown) => (typeof v === "string" && allowed.has(v) ? { image: v } : {});
  let n = 0;
  const slides: TopicSlide[] = list.slice(0, MAX_SLIDES).flatMap((s): TopicSlide[] => {
    if (!s || typeof s !== "object") return [];
    const x = s as Record<string, unknown>;
    switch (x.kind) {
      case "cover": { const title = words(text(x.title, 80), 9); return title ? [{ kind: "cover", title, sub: opt(x.sub, 90), ...pic(x.image) }] : []; }
      case "point": { const title = words(text(x.title, 80), 10); if (!title) return []; n++; return [{ kind: "point", number: n, title, body: opt(x.body, 220), ...pic(x.image) }]; }
      case "stat": { const value = text(x.value, 14), label = words(text(x.label, 70), 10); return value && label ? [{ kind: "stat", value, label, ...pic(x.image) }] : []; }
      case "quote": { const quote = text(x.quote, 200); return quote ? [{ kind: "quote", quote, by: opt(x.by, 40) }] : []; }
      case "end": { const title = words(text(x.title, 60), 8); return title ? [{ kind: "end", title, cta: opt(x.cta, 40), handle: opt(x.handle, 40) }] : []; }
      default: return [];
    }
  });
  if (slides.length < 3 || slides[0].kind !== "cover") return null;
  if (slides[slides.length - 1].kind !== "end") slides.splice(Math.min(slides.length, MAX_SLIDES - 1), 0, { kind: "end", title: "Follow for more" });
  return { slides: slides.slice(0, MAX_SLIDES), ...(opt(r.caption, 600) ? { caption: opt(r.caption, 600) } : {}) };
}

export const TOPIC_SYSTEM = `You write swipeable Instagram carousels for a brand: a cover that hooks, one idea per slide, and an end card. Reply with JSON only:
{"slides":[{"kind":"cover","title":"hook, up to 9 words","sub":"optional, up to 12 words","image":"optional picture ref"},{"kind":"point","title":"up to 10 words","body":"optional, one or two short sentences","image":"optional picture ref"},{"kind":"stat","value":"e.g. 72%","label":"what it means, up to 10 words","image":"optional picture ref"},{"kind":"quote","quote":"short","by":"optional"},{"kind":"end","title":"up to 8 words","cta":"optional call to action","handle":"optional @handle"}],"caption":"the post caption, 1-3 short paragraphs and up to 5 hashtags"}
Pictures: if the brand's pictures are listed, put one on the cover and on the point slides where it shows what the slide says (a product for a product tip); never invent a ref, and leave "image" out when none fits. Slides with a picture keep their words shorter.
Rules: exactly the number of slides asked for (the cover and end card included). The first slide is the cover, the last is the end card. Mostly "point" slides; a "stat" only with a real number you were given; a "quote" only if it is real. Plain, specific, useful words for this brand's audience; no filler, no emoji. Spell names exactly.`;

export function topicPrompt(i: { brandName: string; industry?: string | null; topic: string; slides: number; audience?: string | null; handle?: string | null; look?: string | null; pictures?: Array<{ ref: string; title: string }> }) {
  return [
    `Brand: ${i.brandName}${i.industry ? ` (${i.industry})` : ""}`,
    i.pictures?.length ? `The brand's pictures (ref: what it shows): ${i.pictures.map((p) => `${p.ref}: ${p.title}`).join("; ")}` : "",
    i.audience ? `Audience: ${i.audience}` : "",
    i.handle ? `Handle: ${i.handle}` : "",
    i.look ? `How the best posts in this industry look: ${i.look}` : "",
    `Slides: ${i.slides} (cover and end card included)`,
    `Topic: ${i.topic}`,
  ].filter(Boolean).join("\n");
}

/** A carousel post's slides. */
export function slidesOf(imageUrls: unknown): string[] {
  if (Array.isArray(imageUrls)) return imageUrls.filter((u): u is string => typeof u === "string" && !!u);
  if (typeof imageUrls === "string") { try { const p = JSON.parse(imageUrls); return Array.isArray(p) ? p.filter((u) => typeof u === "string") : [imageUrls]; } catch { return [imageUrls]; } }
  return [];
}
