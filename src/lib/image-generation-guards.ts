// Deterministic, pure guards for Image Studio generation requests.
// Kept out of the page component so the engine/reference matrix is unit-testable.

// Engines that can actually ingest a reference/logo image.
// - nb2 (nano-banana-2): reference_image_urls, up to 14 refs
// - gpt-image-2-image-to-image: input_urls
// gpt-image-2-text-to-image is text-only: it cannot use a logo/reference, and
// attaching one only wastes a paid provider call.
export const REFERENCE_CAPABLE_ENGINES = new Set<string>([
  "nb2",
  "gpt-image-2-image-to-image",
]);

export function isReferenceCapableEngine(engine: string): boolean {
  return REFERENCE_CAPABLE_ENGINES.has(engine);
}

// Mirrors how the generate handler assembles reference_image_urls:
// Brand Integrated prepends the canonical brand logo; uploads and library
// picks are references for every style.
export function willAttachReference(input: {
  style: string;
  hasBrandLogo: boolean;
  uploadCount: number;
  libraryCount: number;
}): boolean {
  const brandLogo = input.style === "brand" && input.hasBrandLogo;
  return brandLogo || input.uploadCount > 0 || input.libraryCount > 0;
}

export type EngineCompatibilityResult = { ok: true } | { ok: false; reason: string };

// Reject an incompatible engine/reference combination BEFORE the workflow
// charges credits. Prevents the Brand-Integrated-on-text-to-image failure that
// otherwise deducts, fails at the provider, and needs a refund.
export function checkReferenceEngineCompatibility(input: {
  engine: string;
  willAttachReference: boolean;
}): EngineCompatibilityResult {
  if (input.willAttachReference && !isReferenceCapableEngine(input.engine)) {
    return {
      ok: false,
      reason:
        "This uses a logo or reference image, which needs a reference-capable engine. Switch to Nano Banana 2 or GPT Image 2 · I2I and try again.",
    };
  }
  return { ok: true };
}
