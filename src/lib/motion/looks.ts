import { contrast, paletteFor, type MotionSpec, type Palette } from "./spec";
import type { LayerEnter } from "./layers";

/**
 * Looks for motion graphics (Kezie, 2026-10-23: "pick up these visual styles that lemo-opuscar has
 * as templates"). Each look is a design grammar adapted from a style sheet in Lemo-Opuscar
 * (github.com/lemomo-ai/lemo-opuscar, MIT, LemoLab 2026): the page and ink colours, one typeface,
 * a texture, and how new elements arrive. Our templates keep drawing the words and numbers; the
 * look changes how they're dressed. The brand's colour goes in as the accent by default, so every
 * look stays on brand.
 */
export type Texture = "grid" | "glow" | "paper" | "grain" | "halftone" | "scanlines" | "deco";
export type Look = {
  id: string; name: string; from: string; line: string;
  palette: Required<Palette>; font: string; textures: Texture[]; enter: LayerEnter;
  /** Lines and grids are drawn in this colour (light on dark, dark on light). */
  lineColor: string;
};

export const LOOKS: Look[] = [
  { id: "swiss", name: "Swiss Motion", from: "Swiss Motion Graphics", line: "A strict grid, one typeface, one signal colour. Exact, no bounce.",
    palette: { background: "#EAE9E5", text: "#111111", accent: "#E30613", second: "#B9B7B1" }, font: "Archivo", textures: ["grid"], enter: "wipe", lineColor: "#111111" },
  { id: "keynote", name: "Dark Keynote", from: "Dark Tech Keynote", line: "A launch-event stage: near-black, a soft glow, one luminous accent.",
    palette: { background: "#0B0D12", text: "#F2F4F8", accent: "#B7F34A", second: "#8B93A7" }, font: "Inter Tight", textures: ["glow", "grid"], enter: "rise", lineColor: "#FFFFFF" },
  { id: "risograph", name: "Risograph", from: "Risograph Print", line: "Two spot inks on warm paper, halftone dots and grain, like a print.",
    palette: { background: "#F4EEE2", text: "#3D5588", accent: "#FF665E", second: "#FFB511" }, font: "Rubik", textures: ["paper", "halftone", "grain"], enter: "pop", lineColor: "#3D5588" },
  { id: "whiteboard", name: "Whiteboard", from: "Whiteboard Explainer", line: "Handwriting on a clean board, written on as it appears.",
    palette: { background: "#FBFBF8", text: "#23262C", accent: "#2A5CB3", second: "#C8363A" }, font: "Kalam", textures: [], enter: "draw", lineColor: "#23262C" },
  { id: "spy", name: "60s Spy Titles", from: "60s Spy Title Sequence", line: "Cut-paper colour blocks and tall condensed type, cut to the beat.",
    palette: { background: "#1B1714", text: "#EFE4C9", accent: "#D23A22", second: "#E2A52A" }, font: "League Gothic", textures: ["paper", "grain"], enter: "wipe", lineColor: "#EFE4C9" },
  { id: "deco", name: "Art Deco", from: "Art Deco", line: "Black lacquer and gold line, centred and elegant.",
    palette: { background: "#0F0E0C", text: "#EAD9A8", accent: "#C9A24A", second: "#6E5A2E" }, font: "Limelight", textures: ["deco"], enter: "fade", lineColor: "#C9A24A" },
  { id: "blueprint", name: "Blueprint", from: "Blueprint", line: "White line work on Prussian blue, drawn as it arrives.",
    palette: { background: "#18336B", text: "#E7F0F9", accent: "#7FB2E5", second: "#3A6DA8" }, font: "Architects Daughter", textures: ["grid"], enter: "draw", lineColor: "#E7F0F9" },
  { id: "dossier", name: "Halftone Dossier", from: "Halftone Dossier", line: "A retro case file: cream paper, halftone, typewriter type, a red stamp.",
    palette: { background: "#EFE6D2", text: "#1E1B18", accent: "#C8363A", second: "#8A7F6A" }, font: "Special Elite", textures: ["paper", "halftone"], enter: "pop", lineColor: "#1E1B18" },
  { id: "news", name: "Broadcast News", from: "Broadcast News Package", line: "On-air graphics: dark set, a bright strap colour, bars that slide in.",
    palette: { background: "#121417", text: "#FFFFFF", accent: "#F2CF1D", second: "#22262C" }, font: "Oswald", textures: [], enter: "wipe", lineColor: "#FFFFFF" },
  { id: "crt", name: "CRT Terminal", from: "ASCII / CRT Terminal", line: "Amber phosphor on dark glass, scanlines, typed out.",
    palette: { background: "#0A0A06", text: "#FFB000", accent: "#FFD27A", second: "#7A5200" }, font: "VT323", textures: ["glow", "scanlines"], enter: "draw", lineColor: "#FFB000" },
  { id: "silkscreen", name: "Silkscreen Poster", from: "Silkscreen Travel Poster", line: "Flat, opaque inks in bold bands, like a travel poster.",
    palette: { background: "#FBE6B4", text: "#1E3B3F", accent: "#EE9A73", second: "#3E7079" }, font: "Bebas Neue", textures: ["grain"], enter: "rise", lineColor: "#1E3B3F" },
  { id: "midcentury", name: "Mid-century Cartoon", from: "Mid-century Cartoon", line: "1950s flat colour and friendly round shapes that pop.",
    palette: { background: "#F6E7C1", text: "#2B2B2B", accent: "#E4572E", second: "#4EA5A0" }, font: "Fredoka", textures: [], enter: "pop", lineColor: "#2B2B2B" },
];

export const lookById = (id: string | null | undefined) => LOOKS.find((l) => l.id === id) ?? null;

/**
 * Dress a spec in a look: its page, ink, font and texture. With `brandAccent` (the default) the
 * brand's main colour becomes the accent, so the look stays on brand; contrast is checked the
 * usual way. A see-through lower third keeps its own bar colour (it plays over footage).
 */
export function applyLook(spec: MotionSpec, lookId: string | null, brand: { primary?: string | null; secondary?: string | null }, brandAccent = true): MotionSpec {
  const look = lookById(lookId);
  if (!look) { const { look: _l, font: _f, ...rest } = spec; void _l; void _f; return { ...rest, palette: paletteFor(null, brand) }; }
  // The brand colour as the accent, unless it would disappear on this look's page (a dark brand
  // colour on the Keynote stage): then the look's own accent.
  const brandColour = brandAccent && brand.primary && /^#[0-9a-f]{6}$/i.test(brand.primary) ? brand.primary.toUpperCase() : null;
  const accent = brandColour && contrast(brandColour, look.palette.background) >= 1.8 ? brandColour : look.palette.accent;
  const raw = spec.kind === "overlay" ? { ...spec.palette, accent } : { ...look.palette, accent };
  return { ...spec, look: look.id, font: look.font, palette: paletteFor(raw, brand) };
}
