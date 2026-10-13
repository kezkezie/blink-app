/**
 * "Split into layers" (Kezie, 2026-10-13): a flat poster becomes editable layers. Claude reads the
 * design (words, where, how big, colour, weight, the font it looks like), the logo is traced from
 * its own small area, and the photo underneath has the old words and logo removed. This checks what
 * Claude sends back (pure, unit tested).
 */
export type Box = [number, number, number, number]; // x, y, w, h as fractions of the image
export type TextPart = {
  text: string; box: Box; sizePct: number; color: string; weight: number; italic: boolean;
  align: "left" | "center" | "right"; spacing: number; font: string; freeFont: string; category: string;
};
export type LogoPart = { box: Box; label: string };
export type DesignLayers = { texts: TextPart[]; logos: LogoPart[]; background: string };

const clamp = (n: unknown, min: number, max: number, d: number) => { const v = Number(n); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d; };
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function box(v: unknown): Box | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [x, y, w, h] = v.map((n) => Number(n));
  if (![x, y, w, h].every(Number.isFinite)) return null;
  const bx = Math.min(1, Math.max(0, x)), by = Math.min(1, Math.max(0, y));
  const bw = Math.min(1 - bx, Math.max(0.005, w)), bh = Math.min(1 - by, Math.max(0.005, h));
  return [bx, by, bw, bh];
}

export function validateLayers(raw: unknown, freeFonts: readonly string[]): DesignLayers | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fallback = (category: string) => (category === "serif" ? "Playfair Display" : category === "display" ? "Bebas Neue" : category === "script" ? "Pacifico" : category === "mono" ? "JetBrains Mono" : "Inter");
  const texts = (Array.isArray(o.texts) ? o.texts : []).slice(0, 30).map((t): TextPart | null => {
    if (!t || typeof t !== "object") return null;
    const x = t as Record<string, unknown>;
    // Long enough for a paragraph (a 560-character one was cut at 400, 2026-10-13).
    const text = str(x.text, 2000).replace(/\\n/g, "\n");
    const b = box(x.box);
    if (!text || !b) return null;
    const category = ["sans", "serif", "display", "script", "mono"].includes(String(x.category)) ? String(x.category) : "sans";
    const font = str(x.font, 60) || fallback(category);
    const wantedFree = str(x.freeFont, 60);
    const freeFont = freeFonts.find((f) => f.toLowerCase() === wantedFree.toLowerCase())
      ?? freeFonts.find((f) => f.toLowerCase() === font.toLowerCase())
      ?? (/^[A-Za-z0-9 ]{2,40}$/.test(wantedFree) ? wantedFree : fallback(category));
    const color = /^#[0-9a-f]{6}$/i.test(String(x.color)) ? String(x.color).toUpperCase() : "#111111";
    const align = x.align === "center" || x.align === "right" ? x.align : "left";
    return {
      text, box: b, sizePct: clamp(x.sizePct, 0.4, 40, 4), color, weight: Math.round(clamp(x.weight, 100, 900, 400) / 100) * 100,
      italic: x.italic === true, align, spacing: clamp(x.spacing, -0.1, 0.6, 0), font, freeFont, category,
    };
  }).filter((t): t is TextPart => !!t);
  const logos = (Array.isArray(o.logos) ? o.logos : []).slice(0, 4).map((l): LogoPart | null => {
    if (!l || typeof l !== "object") return null;
    const b = box((l as Record<string, unknown>).box);
    return b ? { box: b, label: str((l as Record<string, unknown>).label, 60) || "Logo" } : null;
  }).filter((l): l is LogoPart => !!l);
  if (!texts.length && !logos.length) return null;
  return { texts, logos, background: str(o.background, 200) };
}

/** The clean-plate instruction: the same picture with no words and no logo. */
/**
 * The photo without its words. Sent as a plain edit: no brand rules, nothing that tells the model to
 * keep text, and never the word "logo", because the n8n image router adds the brand's logo whenever
 * a prompt mentions one (2026-10-13: "remove every word, letter, number and logo" got Mama Njeri
 * Kitchen's name painted onto a NUF FARMS mushroom, and a sneaker poster back in a test).
 */
export const CLEAN_PLATE_TOPIC = "Clean plate: erase all the writing";
export const CLEAN_PLATE_PROMPT = "Erase every piece of writing from this image: all words, letters, numbers, emblems and printed graphic marks. Fill those areas so they match the surrounding background, texture and lighting exactly. Do not add anything: no new writing, names, signs or marks anywhere. Change nothing else: keep the photo, objects, layout, colours and framing identical.";

/** The n8n router's own test for "this prompt asks for the logo" (Build Payload Router, before 2026-10-13). */
export const N8N_LOGO_MENTION = /\b(logos?|brand ?marks?)\b/;

// ── Measuring text in pixels (2026-10-13: sizes from the AI's boxes came out too big or too small,
// "Mushroom" at half its width). The original's ink is found from its colour; the new text's ink
// from its own render; the font is then sized and spaced so the two match. ──

type Rgb = [number, number, number];
function hexRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const dist = (p: Uint8ClampedArray, i: number, c: Rgb) => Math.hypot(p[i] - c[0], p[i + 1] - c[1], p[i + 2] - c[2]);

/** Runs of indexes whose count passes `min`, split where there are more than `gap` empty ones. */
function runs(counts: number[], min: number, gap: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = -1, last = -1;
  counts.forEach((c, i) => {
    if (c < min) return;
    if (start < 0) start = i;
    else if (i - last > gap + 1) { out.push([start, last]); start = i; }
    last = i;
  });
  if (start >= 0) out.push([start, last]);
  return out;
}

/**
 * Where a text's letters really are, from RGBA pixels: the pixels close to the text colour (and
 * further from the background) around the AI's box. Neighbouring words of the same colour are left
 * out (only ink runs centred inside the AI's box count). Fractions of the image, or null when the
 * text can't be told apart from what's behind it.
 */
export function measureInk(px: Uint8ClampedArray, imgW: number, imgH: number, b: Box, color: string): Box | null {
  const text = hexRgb(color);
  if (!text || imgW < 2 || imgH < 2) return null;
  const pad = (v: number, total: number) => Math.round(v * total * 0.06) + 3;
  const x0 = Math.max(0, Math.floor(b[0] * imgW) - pad(b[2], imgW)), x1 = Math.min(imgW - 1, Math.ceil((b[0] + b[2]) * imgW) + pad(b[2], imgW));
  const y0 = Math.max(0, Math.floor(b[1] * imgH) - pad(b[3], imgH)), y1 = Math.min(imgH - 1, Math.ceil((b[1] + b[3]) * imgH) + pad(b[3], imgH));
  if (x1 - x0 < 3 || y1 - y0 < 3) return null;
  // The background: the average of the edge of the area that isn't text-coloured.
  let br = 0, bg = 0, bb = 0, bn = 0;
  const edge = (x: number, y: number) => { const i = (y * imgW + x) * 4; if (dist(px, i, text) > 60) { br += px[i]; bg += px[i + 1]; bb += px[i + 2]; bn++; } };
  for (let x = x0; x <= x1; x++) { edge(x, y0); edge(x, y1); }
  for (let y = y0; y <= y1; y++) { edge(x0, y); edge(x1, y); }
  if (!bn) return null;
  const back: Rgb = [br / bn, bg / bn, bb / bn];
  const contrast = Math.hypot(text[0] - back[0], text[1] - back[1], text[2] - back[2]);
  if (contrast < 50) return null;
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const ink = new Uint8Array(W * H);
  const rows = new Array<number>(H).fill(0);
  let total = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = ((y0 + y) * imgW + x0 + x) * 4;
    const dt = dist(px, i, text);
    if (dt < Math.min(120, contrast * 0.55) && dt < dist(px, i, back) * 0.8) { ink[y * W + x] = 1; rows[y]++; total++; }
  }
  if (total < 12) return null;
  const inside = (a: number, z: number, lo: number, hi: number) => (a + z) / 2 >= lo && (a + z) / 2 <= hi;
  // Split at any real gap (two empty rows or columns): each line, letter or dot is its own run and
  // stays when it is centred inside the AI's box; a neighbour poking into the margin doesn't.
  const keepRows = runs(rows, 2, 1).filter(([a, z]) => inside(y0 + a, y0 + z, b[1] * imgH, (b[1] + b[3]) * imgH));
  if (!keepRows.length) return null;
  const ry0 = keepRows[0][0], ry1 = keepRows[keepRows.length - 1][1];
  const cols = new Array<number>(W).fill(0);
  for (let y = ry0; y <= ry1; y++) for (let x = 0; x < W; x++) cols[x] += ink[y * W + x];
  const keepCols = runs(cols, 1, 1).filter(([a, z]) => inside(x0 + a, x0 + z, b[0] * imgW, (b[0] + b[2]) * imgW));
  if (!keepCols.length) return null;
  const rx0 = keepCols[0][0], rx1 = keepCols[keepCols.length - 1][1];
  const out: Box = [(x0 + rx0) / imgW, (y0 + ry0) / imgH, (rx1 - rx0 + 1) / imgW, (ry1 - ry0 + 1) / imgH];
  // Far from the AI's box means something else was measured: don't trust it.
  const area = (out[2] * out[3]) / Math.max(1e-6, b[2] * b[3]);
  return area > 0.12 && area < 3 ? out : null;
}

/** The drawn part of a rendered layer (alpha above a threshold), in its own pixels. */
export function alphaBounds(px: Uint8ClampedArray, w: number, h: number, min = 40): [number, number, number, number] | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > min) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

/**
 * The letter spacing (fabric units, 1/1000 em) that makes text as wide as the original once its
 * height matches: a substitute font is often wider or narrower than the real one.
 */
export function spacingToMatch(currentSpacing: number, inkWidth: number, targetWidth: number, chars: number, fontSize: number) {
  if (chars < 2 || fontSize <= 0) return currentSpacing;
  const perGap = (targetWidth - inkWidth) / (chars - 1);
  return Math.round(Math.max(-80, Math.min(300, currentSpacing + (perGap / fontSize) * 1000)));
}

/**
 * Whether an edited picture is still the same picture (greyscale thumbnails of the same size):
 * correlation and mean difference. A clean plate scored 0.42 / 11, a different poster -0.11 / 28.
 */
export function samePicture(a: ArrayLike<number>, b: ArrayLike<number>) {
  const n = Math.min(a.length, b.length);
  if (!n) return true;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let c = 0, va = 0, vb = 0, d = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; c += x * y; va += x * x; vb += y * y; d += Math.abs(a[i] - b[i]); }
  const corr = va && vb ? c / Math.sqrt(va * vb) : 1;
  return !(corr < 0.2 && d / n > 18);
}
