import { describe, expect, it } from "vitest";
import {
  IMAGE_ENGINE_REGISTRY,
  LOGO_ENGINE,
  N8N_IMAGE_COST_MAP,
  N8N_IMAGE_DEFAULT_COST,
  SQL_COST_ALLOWLIST,
  n8nResolvedCost,
  resolveImageEngine,
  supportedImageEngines,
} from "@/lib/image-engine-pricing";

describe("image-engine pricing registry — verified mappings", () => {
  it("maps every supported engine to its canonical model and verified cost", () => {
    // Provenance (verified 2026-08-01 from the operator's kie.ai model pages):
    // nano-banana-2 = 8cr (1K); GPT Image 2 T2I/I2I = 6cr (1K).
    expect(resolveImageEngine("nb2")).toMatchObject({ engine: "nb2", model: "nano-banana-2", creditCost: 8, referenceCapable: true });
    expect(resolveImageEngine("gpt-image-2-text-to-image")).toMatchObject({ model: "gpt-image-2-text-to-image", creditCost: 6, referenceCapable: false });
    expect(resolveImageEngine("gpt-image-2-image-to-image")).toMatchObject({ model: "gpt-image-2-image-to-image", creditCost: 6, referenceCapable: true });
    // z-image: kie.ai flat 0.8cr rounded up to 1 (integer credits); text-only.
    expect(resolveImageEngine("z-image")).toMatchObject({ model: "z-image", creditCost: 1, referenceCapable: false });
  });

  it("prices the logo engine (Ideogram v3 Turbo) at the Replicate-derived cost", () => {
    expect(LOGO_ENGINE).toMatchObject({ engine: "ideogram-v3-turbo", provider: "replicate", model: "ideogram-ai/ideogram-v3-turbo", creditCost: 6 });
    expect(SQL_COST_ALLOWLIST).toContain(LOGO_ENGINE.creditCost);
    // The logo engine is NOT part of the general image-generation picker.
    expect(supportedImageEngines()).not.toContain("ideogram-v3-turbo");
  });

  it("exposes exactly the supported engine aliases", () => {
    expect(supportedImageEngines().sort()).toEqual(["gpt-image-2-image-to-image", "gpt-image-2-text-to-image", "nb2", "z-image"]);
  });

  it("rejects unknown / unsupported / non-string engines with null (no default price)", () => {
    for (const bad of ["midjourney", "nano-banana-pro", "flux-schnell", "", "nb2 ", "NB2", undefined, null, 8, {}]) {
      expect(resolveImageEngine(bad as unknown)).toBeNull();
    }
  });

  it("never returns a numeric price accepted from a caller — cost comes only from the registry", () => {
    // The resolver takes an alias, not a price; there is no path to inject a cost.
    const pricing = resolveImageEngine("nb2");
    expect(pricing?.creditCost).toBe(8);
    expect(typeof pricing?.creditCost).toBe("number");
  });
});

describe("pricing drift detection (registry ⇄ n8n cost map ⇄ SQL allowlist)", () => {
  it("every registry engine's cost equals what the n8n Parse node would charge for its model", () => {
    for (const [alias, pricing] of Object.entries(IMAGE_ENGINE_REGISTRY)) {
      // n8n resolves cost by model via costMap[model] || default.
      expect(pricing.creditCost, `drift for engine ${alias} (model ${pricing.model})`).toBe(n8nResolvedCost(pricing.model));
    }
  });

  it("mirrors the intended n8n cost map (GPT Image 2 now explicit 6, not defaulted)", () => {
    expect(N8N_IMAGE_COST_MAP).toEqual({
      "nano-banana-2": 8, "nano-banana-pro": 15, "flux-schnell": 2, "qwen-image-edit": 5,
      "gpt-image-2-text-to-image": 6, "gpt-image-2-image-to-image": 6, "z-image": 1,
    });
    expect(N8N_IMAGE_DEFAULT_COST).toBe(8);
    // GPT Image 2 now has explicit 6cr entries (the prepared n8n costMap patch).
    expect(n8nResolvedCost("gpt-image-2-text-to-image")).toBe(6);
    expect(n8nResolvedCost("gpt-image-2-image-to-image")).toBe(6);
    // An unmapped model still falls to the default.
    expect(n8nResolvedCost("some-future-model")).toBe(8);
  });

  it("every registry cost is contained in the SQL billing allowlist", () => {
    for (const pricing of Object.values(IMAGE_ENGINE_REGISTRY)) {
      expect(SQL_COST_ALLOWLIST, `cost ${pricing.creditCost} must be an accepted SQL amount`).toContain(pricing.creditCost);
    }
  });

  it("the SQL allowlist is a superset of the n8n cost map values (no chargeable cost is rejected by SQL)", () => {
    for (const cost of Object.values(N8N_IMAGE_COST_MAP)) {
      expect(SQL_COST_ALLOWLIST).toContain(cost);
    }
    expect(SQL_COST_ALLOWLIST).toContain(N8N_IMAGE_DEFAULT_COST);
  });
});
