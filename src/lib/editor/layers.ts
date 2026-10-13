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
    const text = str(x.text, 400).replace(/\\n/g, "\n");
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
export const CLEAN_PLATE_PROMPT = "Remove every word, letter, number and logo from this image. Fill those areas so they match the surrounding background, texture and lighting exactly. Change nothing else: keep the photo, objects, layout, colours and framing identical.";
