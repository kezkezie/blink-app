/**
 * The design pass (Kezie, 2026-10-14: "the images don't look like something you would post... you
 * need some design knowledge to make really nice posters. Once I click Generate on Best, first
 * execute it using our skill vault, then create the image, instead of a random lazy image").
 * Before Best or Fast renders, Claude turns the brief into a designed prompt for that look, using
 * BlinkSpot's poster and photography playbook (from the poster-designer skill in Kezie-OS:
 * three-zone layout, text-first, named light/lens/materials, safe zones, the AI-slop blacklist)
 * and the brand's industry research. Pure parts here; the call is in /api/generate/design.
 */
import type { GenerateLook } from "@/lib/generate-prompt";

export const DESIGN_PLAYBOOK = `BLINKSPOT DESIGN PLAYBOOK (follow it; it is why posts look designed, not generated)
HIERARCHY: one dominant focal point, never two heroes. Visual weight: hero 50-60%, supporting 30%, logo and small print 5-10%. F-pattern: most important element top-left, then top-right or centre.
POSTERS AND ADS: a GRAPHIC DESIGN POSTER, not a photo with text on it. Three zones that fill the frame together: ZONE 1 (upper third) the headline and any subline; ZONE 2 (centre, the largest) the product or key visual as a standalone object, about 55% of the frame, soft drop shadow, gentle rim light; ZONE 3 (lower strip) the logo, handle or call to action, small. Clean solid or softly lit background in a brand-colour tint, warm white or a deep neutral. Text never overlaps the hero.
ONE VISUAL SYSTEM: the type treatment and the picture share one style (flat with flat, glossy 3D with crisp modern type); never retro type on a sleek render.
TEXT-FIRST: write every word on the image as a quoted render instruction BEFORE describing the picture, with weight, size and place, e.g. render "PAY GAS IN USDT" in bold condensed sans-serif, upper-left, 8% of frame height. 3-5 words per text element; one headline, at most one short subline and one call to action; no paragraphs or bullet lists. Headline at least 1.5x the subline. Logo small in a lower corner.
SPACE: 10% safe zone from every edge, nothing important near borders; 20% calm space around the headline and hero so they breathe, but never a dead empty third: scale the hero up or let it bleed off an edge instead. Do not cram the corners.
COLOUR: neutral or brand-tint background, the product next, ONE accent colour for the CTA or key callout. Text contrast high; on a photo, put text on a clean area or a soft scrim.
NAME EVERYTHING: lighting by name (three-point softbox, golden hour backlight, chiaroscuro), camera and lens (macro f/8, 35mm f/1.8, overhead 90 degrees), and materials concretely (matte frosted acrylic, warm walnut, brushed aluminium).
STYLE BLUEPRINTS:
- poster: the three zones above.
- studio (product shot): infinite backdrop, three-point softbox, macro sharp detail, product 60% of frame, breathing room on two sides, no text unless asked.
- lifestyle: the product in a real, specific place, soft window light or golden hour, 35mm with slight film grain, candid, product still clear.
- cinematic: chiaroscuro or motivated light, anamorphic 35mm f/1.8, restrained teal-and-amber grade, one frame from a film.
- flatlay: directly overhead, knolling grid, soft diffused light, deep focus, 20% negative space.
- abstract (3D): one sculptural form, studio HDRI, physically based materials, restraint.
AVOID (AI slop): purple-to-blue gradients, text over busy photo areas, cards inside cards, more than one message, generic stock scenes, vague materials, crammed edges, filling every space, fake UI full of tiny unreadable text, invented logos or brand names.
Describe what you want in positive terms. Start with a strong verb.`;

export type DesignInput = {
  look: Exclude<GenerateLook, "plain">;
  requirements: string; // what Generate would send: brief, research format, colours, words, logo and product roles
  brandName: string;
  industry?: string | null;
};

export const DESIGN_SYSTEM = `${DESIGN_PLAYBOOK}

You are BlinkSpot's art director. Turn the requirements into ONE image prompt for an image model, designed for the given look, following the playbook. Keep every requirement: the exact quoted words (spelled exactly, nothing added), which attached image is the logo and which are products, the brand's colours and font, and the researched layout when there is one. Before you answer, check every text colour against the colour behind it: light text on a dark ground or dark text on a light one, never white on off-white. 90-170 words. Reply with JSON only: {"prompt":"the image prompt","notes":"one short line telling the user how you designed it, e.g. Three-zone poster: headline top-left, fee receipt card centre, logo lower-right"}.`;

export function designUserPrompt(i: DesignInput) {
  return `Brand: ${i.brandName}${i.industry ? ` (${i.industry})` : ""}\nLook: ${i.look}\nRequirements:\n${i.requirements}`;
}

/** The designed prompt, checked; null if it isn't usable (Generate then sends the requirements as they are). */
export function validateDesign(raw: unknown): { prompt: string; notes: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
  const notes = typeof o.notes === "string" ? o.notes.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  const words = prompt.split(/\s+/).length;
  if (words < 40 || prompt.length > 3200) return null;
  return { prompt, notes };
}

/**
 * The lines that must reach the image model word for word, whatever the design pass wrote: the exact
 * words, the logo's and products' image roles. Taken from the requirements and appended.
 */
export function mustKeep(requirements: string) {
  return requirements.split("\n").filter((l) => /^(Write exactly this text|Image \d+ is our|Images \d+ to \d+ are our)/.test(l)).join("\n");
}
