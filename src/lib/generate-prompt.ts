import { MARKETING_STYLES } from "@/lib/marketing-styles";
import type { BrandResearch } from "@/lib/brand-research";
import { directionFor, type VisualRefs } from "@/lib/visual-refs";

/**
 * Generate's prompt (2026-10-14). Kezie and a friend testing Gasless Cash: "the planning, the ideas,
 * it's okay, but the image itself that comes out is very off" (snow-white USDT blocks for a crypto
 * app). The image prompt now comes from what the brand is and how its industry posts (researched),
 * with its own colours, font, words, products and logo, instead of generic art direction.
 * "Plain" sends the words as they are.
 */
export type GenerateLook = "plain" | "poster" | "studio" | "lifestyle" | "cinematic" | "flatlay" | "abstract";

export const GENERATE_LOOKS: Array<{ id: GenerateLook; label: string; line: string }> = [
  { id: "plain", label: "Plain", line: "Your words exactly, no style added" },
  { id: "poster", label: "Ad / poster", line: "Bold graphic post with a headline" },
  { id: "studio", label: "Product shot", line: "Your product, studio-lit" },
  { id: "lifestyle", label: "Lifestyle", line: "Real moments, natural light" },
  { id: "cinematic", label: "Cinematic", line: "A frame from a film" },
  { id: "flatlay", label: "Flat lay", line: "Arranged from above" },
  { id: "abstract", label: "3D / abstract", line: "One striking 3D form" },
];

/** The Brand page's photo vibes → the look Generate starts on. */
const VIBE_LOOK: Record<string, GenerateLook> = {
  "Bright & clean": "studio", "Warm & natural": "lifestyle", "Dark & moody": "cinematic", "Bold & colourful": "poster",
  "Minimal studio": "studio", "Real people": "lifestyle", "Street & urban": "cinematic", "Luxury": "studio",
};
export function lookForVibes(vibes?: string[] | null): GenerateLook {
  for (const v of vibes ?? []) if (VIBE_LOOK[v]) return VIBE_LOOK[v];
  return "poster";
}

/** A look's art direction; its "NO TEXT, NO LOGOS" line goes when the picture carries words or the logo. */
export function lookDirection(look: GenerateLook, carriesText: boolean) {
  if (look === "plain") return "";
  const addon = MARKETING_STYLES.find((s) => s.id === look)?.promptAddon ?? "";
  return carriesText ? addon.replace(/\s*NO TEXT, NO TYPOGRAPHY, NO LOGOS anywhere in the image\.?/i, "").trim() : addon;
}

export type PromptInput = {
  brief: string;
  look: GenerateLook;
  colours?: Array<string | null | undefined>;
  font?: string | null;
  /** Exact words to put on the image. */
  words?: string;
  /** The logo is attached as image 1. */
  logo: boolean;
  /** Product photos attached after the logo. */
  products: number;
  research?: BrandResearch | null;
  /** The researched format the chosen idea follows. */
  basedOn?: string | null;
  /** Art direction from reference pictures in the brand's category (2026-10-16). */
  visual?: VisualRefs | null;
};

const firstSentences = (text: string, n: number) => (text.match(/[^.!?]+[.!?]+/g) ?? [text]).slice(0, n).join(" ").trim();

export function buildGeneratePrompt(i: PromptInput): string {
  const lines: string[] = [i.brief.trim()];
  const words = i.words?.trim();
  const plain = i.look === "plain";
  if (!plain) {
    const format = i.basedOn ? i.research?.formats.find((f) => f.name.toLowerCase() === i.basedOn!.toLowerCase()) : undefined;
    if (format) lines.push(`Layout to follow: ${format.layout}${format.imagery ? ` In the picture: ${format.imagery}` : ""}`);
    if (i.research?.visualLanguage) lines.push(`Make it look like the best posts in this industry: ${firstSentences(i.research.visualLanguage, 2)}`);
    const fromRefs = directionFor(i.visual, i.look);
    if (fromRefs) lines.push(fromRefs);
    const colours = (i.colours ?? []).filter((c): c is string => !!c && /^#?[0-9a-f]{6}$/i.test(c));
    // Codes are for painting: a draft model wrote "#E4572E" on a poster (2026-10-21).
    if (colours.length) lines.push(`Use the brand's colours as the palette: ${colours.join(", ")} (colours to paint with; never write colour codes or swatches on the image).`);
    if (i.font && (words || i.look === "poster")) lines.push(`Set headlines in a typeface like ${i.font}.`);
  }
  if (words) lines.push(`Write exactly this text on the image, spelled exactly as given, and no other words: "${words}".`);
  else if (i.look === "poster") lines.push("Keep any words to one short headline, spelled correctly; no filler or fake text.");
  const first = i.logo ? 2 : 1;
  if (i.products === 1) lines.push(`Image ${first} is our product: show it exactly as photographed (shape, label, colours and any writing on it), placed naturally in the scene.`);
  else if (i.products > 1) lines.push(`Images ${first} to ${first + i.products - 1} are our products: show all of them together, each exactly as photographed, arranged naturally in one scene.`);
  if (i.logo) lines.push("Image 1 is our logo: place it exactly as given (same shapes and colours), small and clean in a corner. Do not redraw it and do not add any other logo.");
  const direction = lookDirection(i.look, !!words || i.logo || i.look === "poster");
  if (direction) lines.push(direction);
  if (!plain) lines.push("Show no other company's logo, badge or trademark on any product (no swooshes, stripes or famous marks).");
  if (!plain && i.research?.avoid.length) lines.push(`Avoid: ${i.research.avoid.slice(0, 3).join("; ")}.`);
  return lines.join("\n");
}

/** The short prompt the image router sees: no words that make it stamp the logo in on its own. */
export function routerTopic(brief: string) {
  return brief.replace(/\b(logos?|brand ?marks?)\b/gi, "emblem").slice(0, 3900);
}
