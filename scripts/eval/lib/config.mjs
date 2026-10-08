/**
 * Eval harness configuration. Everything that decides WHAT is evaluated and
 * HOW MUCH it may cost lives here, so a budget change is a one-line diff.
 */

/** Allowlisted non-customer client. Evals never generate against a real account. */
export const EVAL_CLIENT = "1c51553f-7abc-4ab8-ba92-4b130b05df64";

/**
 * Golden brands. `sourceId` brands are cloned read-only onto the eval client
 * (clone-brands.mjs); `existingId` brands already live there; `empty` is created
 * with only a name to test the "user has almost nothing" case.
 */
export const GOLDEN_BRANDS = [
  // ORDER MATTERS for the subset: brand i gets intent i mod 5, so index 4 gets
  // the inspiration intent and must be a brand WITH reference images (Nuf Farms
  // has 6). Zap has none; placing it at index 4 silently skipped that intent.
  { key: "zap", existingId: "25e0b981-5967-4801-85f5-35b2a24f211d" },
  { key: "mama-njeri", sourceId: "d635aa66-f965-4af1-b148-49e353fd01de" },
  { key: "lup-space", sourceId: "5d3bb7d6-6727-4e28-bfaf-7a93d2e0278f" },
  { key: "gasless-cash", existingId: "3d66c707-d774-4bf9-9812-dcae15954202" },
  { key: "nuf-farms", sourceId: "0d482cc8-690b-422c-8ce4-0d77464f3186" },
  { key: "empty-brand", empty: { brand_name: "Bluewave Laundry", industry: "Local Services" } },
];

/**
 * Intents are written the way a real, non-expert user would type them. The
 * product's job is to turn this into a strong asset; the eval measures that.
 * `style` must be one the Smart Router allowlists; only `poster` permits text.
 */
export const INTENTS = [
  { key: "product", text: "Showcase our best-selling product", style: "studio", mode: "standard", expectsText: false },
  { key: "announcement", text: "Announce that we are now open on Sundays", style: "poster", mode: "standard", expectsText: true },
  { key: "lifestyle", text: "Show a customer enjoying our product in everyday life", style: "lifestyle", mode: "standard", expectsText: false },
  { key: "promotion", text: "20% off everything this weekend only", style: "poster", mode: "standard", expectsText: true },
  { key: "inspiration", text: "Make something in the style of these references for our brand", style: "poster", mode: "organic_blend", expectsText: false, needsReferences: true },
];

export const ASPECT_RATIO = "4:5";
export const IMAGE_ENGINE = "nano-banana-2";

/** Credits per nano-banana-2 1K image, mirrored from the live n8n cost map. */
export const IMAGE_COST = 8;

/** Budgets agreed with Kezie 2026-09-29 (launch-loop-plan.md §5.3); daily/total raised 2026-10-08
 *  for the KYRA website build ("use more credits to make that website work"). */
export const BUDGET = Object.freeze({
  perRunDefault: 60,
  perRunHard: 240,
  daily: 1500,
  total: 6000,
});

/** Judge model. Chosen by W2's A/B; gpt-4o is the baseline. */
export const JUDGE_MODEL = "gpt-4o";
