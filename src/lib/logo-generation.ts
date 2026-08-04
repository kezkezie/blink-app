/**
 * Logo generation from brand context (deterministic core).
 *
 * When a brand has no logo, BlinkSpot can generate one from the brand's context
 * using Ideogram v3 Turbo (best-in-class at typography/wordmarks). This module is
 * the PURE, testable core: it turns brand context into a high-quality logo prompt.
 * The live provider call + billing + brand_profiles write are a separate, GATED
 * integration (they spend credits and hit a live provider) — see LOGO_ENGINE in
 * `image-engine-pricing.ts` for the 6-credit cost.
 */

export interface LogoBrandInput {
  /** Brand/company name — rendered as the wordmark. Required. */
  name: string;
  industry?: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  /** Optional aesthetic steer, e.g. "minimalist", "playful", "luxury". */
  styleHint?: string;
}

export interface LogoPrompt {
  prompt: string;
  /** Logos are square; Ideogram takes an aspect_ratio string. */
  aspectRatio: "1:1";
}

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const isColor = (value: unknown): value is string =>
  typeof value === "string" && /^#?[0-9a-fA-F]{3,8}$|^[a-zA-Z ]{3,24}$/.test(value.trim());

/**
 * Build a deterministic, high-quality logo prompt from brand context. Empty/missing
 * fields degrade gracefully. Ideogram renders the NAME as clean text, so the name is
 * always quoted; colors and industry steer the mark when present.
 */
export function buildLogoPrompt(input: LogoBrandInput): LogoPrompt | null {
  const name = clean(input.name, 60);
  if (!name) return null;

  const industry = clean(input.industry, 60);
  const style = clean(input.styleHint, 40) || "modern minimalist";
  const colors = [input.primaryColor, input.secondaryColor].filter(isColor).map((c) => clean(c, 24));

  const parts = [
    `A ${style}, professional brand logo for "${name}"`,
    industry ? `a ${industry} brand` : "",
    // Ideogram excels at text — ask for a legible wordmark + a simple icon.
    `clean vector wordmark rendering the text "${name}" exactly, paired with one simple memorable icon`,
    colors.length ? `brand colors ${colors.join(" and ")}` : "balanced, confident color palette",
    "flat design, high contrast, crisp edges, generous negative space, centered composition",
    "on a solid white background, suitable as a scalable brand mark",
    // Steer away from the usual logo-generation failure modes.
    "no photorealism, no gradients-heavy clutter, no stock-photo imagery, no watermark, no lorem-ipsum text, spell the brand name correctly",
  ].filter(Boolean);

  return { prompt: parts.join(". ") + ".", aspectRatio: "1:1" };
}
