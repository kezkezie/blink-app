import { INTENTS } from "./config.mjs";

/**
 * Build the case matrix. Deterministic ordering so run-to-run comparison is
 * like-for-like.
 *
 * The subset is one case per brand, rotating the intent (brand i gets intent
 * i mod 5), so 6 cases still cover every brand and every intent.
 */
export function buildCases(brands, { subset = false, intents = INTENTS } = {}) {
  const all = [];
  brands.forEach((brand, i) => {
    intents.forEach((intent, j) => {
      if (subset && j !== i % intents.length) return;
      all.push({ id: `${brand.key}__${intent.key}`, brand, intent });
    });
  });
  return all;
}

/** References for inspiration cases come from the brand's own uploaded assets. */
export function referencesFor(brand, max = 2) {
  const assets = Array.isArray(brand.uploaded_assets) ? brand.uploaded_assets : [];
  return assets.filter((u) => typeof u === "string" && /^https:\/\//.test(u)).slice(0, max);
}
