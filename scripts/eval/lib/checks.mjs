/**
 * Deterministic output checks. No model calls, no cost. The pixel functions are
 * pure (they take raw RGB) so they are unit-tested without images.
 */

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Collect a brand's palette from brand_profiles fields, deduplicated. */
export function brandPalette(brand) {
  const raw = [brand.primary_color, brand.secondary_color, brand.accent_color, ...(Array.isArray(brand.additional_colors) ? brand.additional_colors : [])];
  const seen = new Set();
  const out = [];
  for (const h of raw) {
    const rgb = hexToRgb(h);
    if (!rgb) continue;
    const k = rgb.join(",");
    if (!seen.has(k)) { seen.add(k); out.push(rgb); }
  }
  return out;
}

/**
 * Share of pixels within `threshold` RGB distance of any palette colour.
 * This is a PRESENCE signal: a product photo legitimately contains many
 * non-palette colours, so we only require the brand to be visibly present.
 */
export function paletteCoverage(rgbBytes, palette, threshold = 45) {
  if (!palette.length) return null;
  let near = 0;
  const px = rgbBytes.length / 3;
  for (let i = 0; i < rgbBytes.length; i += 3) {
    const p = [rgbBytes[i], rgbBytes[i + 1], rgbBytes[i + 2]];
    if (palette.some((c) => rgbDistance(p, c) <= threshold)) near += 1;
  }
  return near / px;
}

export function aspectMatches(width, height, ratio = "4:5", tolerance = 0.02) {
  const [w, h] = ratio.split(":").map(Number);
  const expected = w / h;
  return Math.abs(width / height - expected) / expected <= tolerance;
}

/**
 * The deterministic checks only need a small sample (palette uses 64x64, aspect
 * uses the ratio), so fetch a 512px Cloudinary rendition instead of the full PNG.
 * On a flaky link this is the difference between a download and a timeout.
 * Width-only scaling preserves the aspect ratio the check measures.
 */
export function checkRenditionUrl(url) {
  return /res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(url)
    ? url.replace("/image/upload/", "/image/upload/w_512/")
    : url;
}

/** Minimum brand-colour presence for a pass. Tuned after the baseline run. */
export const MIN_PALETTE_COVERAGE = 0.12;

/** Run every deterministic check against a downloaded image buffer. */
export async function runDeterministicChecks(buffer, brand, { ratio = "4:5" } = {}) {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(buffer).metadata();
  const small = await sharp(buffer).removeAlpha().resize(64, 64, { fit: "fill" }).raw().toBuffer();
  const palette = brandPalette(brand);
  const coverage = paletteCoverage(small, palette);
  return {
    width: meta.width,
    height: meta.height,
    aspect: { pass: aspectMatches(meta.width, meta.height, ratio), detail: `${meta.width}x${meta.height} vs ${ratio}` },
    palette: coverage === null
      ? { pass: null, detail: "brand has no palette to check against" }
      : { pass: coverage >= MIN_PALETTE_COVERAGE, detail: `${(coverage * 100).toFixed(1)}% of pixels near brand palette (min ${MIN_PALETTE_COVERAGE * 100}%)` },
  };
}
