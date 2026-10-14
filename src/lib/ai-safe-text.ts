/**
 * Medical and intimate brands (2026-10-14: Blush Implants, a breast-reconstruction implant). The
 * brand description is added to every image and script prompt automatically, and its anatomy
 * words ("integrated nipple") made GPT Image refuse every picture (Kie reports it as "500 Internal
 * Error") and the script writer say it can't help. Wording the app adds by itself is softened to
 * clinical, product-first language; the user's own words are never changed.
 */
const SOFTEN: Array<[RegExp, string]> = [
  [/\bnipple[- ]sparing\b/gi, "tissue-sparing"],
  [/\b(?:integrated|built[- ]in)\s+nipples?\b/gi, "integrated natural-looking detail"],
  [/\bnipples?\b/gi, "natural-looking detail"],
  [/\bareolae?s?\b/gi, "natural-looking detail"],
  [/\bbreast implants?\b/gi, "reconstruction implant"],
  [/\bbreast reconstruction\b/gi, "post-mastectomy reconstruction"],
  [/\bbreasts\b/gi, "chest"],
  [/\bbreast\b(?!\s+cancer)/gi, "chest"],
  [/\b(?:genitals?|genitalia|vagina[sl]?|penis(?:es)?)(?:\s+health)?\b/gi, "intimate health"],
  [/\b(?:nude|naked)\b/gi, "unclothed"],
];

/** Words that make image and text models refuse, even for real medical brands. */
export const SENSITIVE = /\b(nipples?|areolae?|breasts?|implants?|mastectomy|genitals?|genitalia|vagina[sl]?|penis(?:es)?|sexual|sex toys?|lingerie|nude|naked|erotic|intimate)\b/i;

export function softenForAi<T extends string | null | undefined>(text: T): T {
  if (!text || !SENSITIVE.test(text)) return text;
  return SOFTEN.reduce((t, [re, to]) => t.replace(re, to), text as string) as T;
}

/** When a picture of a sensitive subject fails, say why and what to try. */
export const SENSITIVE_FAILURE =
  "Image models often refuse medical and intimate subjects, even for real medical brands. Your credits were refunded. Retry in clinical wording (body words swapped for neutral ones), or show the product as an object, on a plinth or in its packaging.";

/**
 * For a planner model (the Storyboard's director) writing scenes about a sensitive subject
 * (2026-10-15, Chelsea: "the AI says it cannot assist"): say it's a real medical brand and keep the
 * scenes clinical and product-first, so it plans instead of refusing and its image prompts pass.
 */
export const CLINICAL_DIRECTION =
  "Context: this is a legitimate medical or health brand making professional marketing. Plan tasteful, clinical, product-first scenes: the product as an object (in hand, on a plinth, in its packaging), clinicians and consultations, recovery, confidence and everyday life, fully clothed people. Never nudity, anatomy close-ups or intimate framing.";

/** A model's reply that is a refusal rather than an answer. */
export const REFUSAL = /\b(i (?:can(?:'|’)?t|cannot|am unable to|won(?:'|’)?t) (?:help|assist|create|do|provide)|i(?:'|’)?m (?:sorry|unable)|not able to (?:help|assist))\b/i;
