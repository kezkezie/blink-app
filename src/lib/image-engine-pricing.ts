/**
 * Server-owned Image Studio engine pricing registry (Slice 5, Gate 0).
 *
 * SINGLE SOURCE OF TRUTH for what an image generation costs. The browser sends
 * only an engine alias; the server resolves the canonical provider model and the
 * verified credit cost here, and persists that cost on the durable placeholder.
 * A numeric price is NEVER accepted from the browser.
 *
 * Provenance of the cost values (verified 2026-07-28, do not change without
 * re-verifying all three sources):
 *   - n8n "Blink - 3.3. Image Generator (Smart Router v2.2)" → node
 *     "Parse Inputs & Calculate Cost": costMap = { 'nano-banana-2': 8,
 *     'nano-banana-pro': 15, 'flux-schnell': 2, 'qwen-image-edit': 5,
 *     'default': 8 }, perImageCost = costMap[kie_model] || costMap['default'].
 *   - App engine contract (execution-security.ts IMAGE_ENGINES / IMAGE_MODELS):
 *     nb2, gpt-image-2-text-to-image, gpt-image-2-image-to-image.
 *   - UI mapping (generate/page.tsx): nb2 → nano-banana-2; the GPT engines pass
 *     through as their own kie_model, which is NOT in the n8n costMap and so
 *     resolves via the 'default' (8). Every currently-supported engine costs 8.
 *
 * The `{2,5,8,15}` SQL allowlist in the billing migration is a registry-derived
 * superset (nano-banana-pro=15, flux-schnell=2, qwen-image-edit=5 exist in the
 * n8n map but are NOT exposed in the Image Studio UI yet). Drift tests below tie
 * this registry to the n8n map and the SQL allowlist.
 */

import { isReferenceCapableEngine } from "@/lib/image-generation-guards";

export interface ImageEnginePricing {
  /** UI engine alias the browser selects (the only value it may send). */
  engine: string;
  /** Canonical provider model (kie_model) the workflow routes on. */
  model: string;
  /** Verified per-image credit cost. */
  creditCost: number;
  /** Whether this engine can ingest a reference/inspiration image. */
  referenceCapable: boolean;
}

/**
 * The engines Image Studio actually offers today. Adding an engine here is the
 * one place a new price is introduced — and it must be justified against the n8n
 * cost map (see `N8N_IMAGE_COST_MAP`) via the drift test.
 */
export const IMAGE_ENGINE_REGISTRY: Readonly<Record<string, ImageEnginePricing>> = Object.freeze({
  "nb2": {
    engine: "nb2",
    model: "nano-banana-2",
    creditCost: 8, // kie.ai nano-banana-2: 8cr 1K / 12cr 2K / 18cr 4K — flat 1K
    referenceCapable: isReferenceCapableEngine("nb2"),
  },
  "gpt-image-2-text-to-image": {
    engine: "gpt-image-2-text-to-image",
    model: "gpt-image-2-text-to-image",
    creditCost: 6, // kie.ai GPT Image 2: 6cr 1K / 10cr 2K / 16cr 4K — flat 1K (verified 2026-08-01)
    referenceCapable: isReferenceCapableEngine("gpt-image-2-text-to-image"),
  },
  "gpt-image-2-image-to-image": {
    engine: "gpt-image-2-image-to-image",
    model: "gpt-image-2-image-to-image",
    creditCost: 6, // kie.ai GPT Image 2: 6cr 1K / 10cr 2K / 16cr 4K — flat 1K (verified 2026-08-01)
    referenceCapable: isReferenceCapableEngine("gpt-image-2-image-to-image"),
  },
  "z-image": {
    engine: "z-image",
    model: "z-image",
    creditCost: 1, // kie.ai z-image flat 0.8cr → rounded up to 1 (integer credit system)
    referenceCapable: isReferenceCapableEngine("z-image"),
  },
});

/**
 * Logo generation engine (separate flow — "make a logo from brand context" when a
 * brand has none). Ideogram v3 Turbo is best-in-class at typography/text, ideal for
 * logos. Hosted on Replicate ($0.03/image → 6 credits at $0.005/credit). NOT part of
 * the general image-engine picker; used only by the logo-generation path.
 */
export const LOGO_ENGINE = Object.freeze({
  engine: "ideogram-v3-turbo",
  provider: "replicate" as const,
  model: "ideogram-ai/ideogram-v3-turbo",
  creditCost: 6, // Replicate $0.03/image; balanced=$0.06→12, quality=$0.09→18
});

/**
 * Verified mirror of the LIVE n8n cost map + default. Used by the drift test to
 * prove this registry stays in sync with the workflow that actually charges.
 * APPLIED 2026-08-03 to the live Smart Router (workflow LXINWLmOghHWzRgA): GPT
 * Image 2 T2I/I2I set to 6 (was 10 — the 2K price — while the workflow generates
 * 1K, i.e. over-charging), and z-image added at 1. Live sync path now matches the
 * durable registry cost.
 */
export const N8N_IMAGE_COST_MAP: Readonly<Record<string, number>> = Object.freeze({
  "nano-banana-2": 8,
  "nano-banana-pro": 15,
  "flux-schnell": 2,
  "qwen-image-edit": 5,
  "gpt-image-2-text-to-image": 6,
  "gpt-image-2-image-to-image": 6,
  "z-image": 1,
});
export const N8N_IMAGE_DEFAULT_COST = 8;

/** How n8n's Parse node resolves a model to a per-image cost. */
export function n8nResolvedCost(model: string): number {
  return N8N_IMAGE_COST_MAP[model] ?? N8N_IMAGE_DEFAULT_COST;
}

/** Costs the SQL billing allowlist (`is_valid_image_generation_cost`) must accept. */
export const SQL_COST_ALLOWLIST: readonly number[] = [1, 2, 5, 6, 8, 15];

/**
 * Resolve a browser-supplied engine alias to its canonical model + verified cost.
 * Returns null for an unknown/unsupported engine (the caller rejects the request).
 */
export function resolveImageEngine(engine: unknown): ImageEnginePricing | null {
  if (typeof engine !== "string") return null;
  return IMAGE_ENGINE_REGISTRY[engine] ?? null;
}

/** All supported engine aliases (for validation/tests). */
export function supportedImageEngines(): string[] {
  return Object.keys(IMAGE_ENGINE_REGISTRY);
}
