import { describe, expect, it } from "vitest";
import {
  AUDIO_SURCHARGE_PER_SECOND,
  AUTO_VIDEO_MODEL,
  DEFAULT_CREDITS_PER_SECOND,
  GEMINI_CREDITS_PER_SECOND,
  VIDEO_MODEL_REGISTRY,
  allVideoAspectRatios,
  allVideoDurations,
  allowedDurationsFor,
  estimateVideoCredits,
  isDurationAllowedFor,
  modelSupportsEndFrame,
  n8nPerSecondCost,
  resolveAutoModel,
  resolveEffectiveVideoModel,
  resolveVideoModel,
  validateVideoModelOptions,
  videoModelFamily,
  videoModelIds,
} from "@/lib/video-model-registry";
import { VIDEO_ASPECT_RATIOS, VIDEO_DURATIONS, VIDEO_MODELS } from "@/lib/video-execution";

const SPECS = Object.values(VIDEO_MODEL_REGISTRY);

describe("registry shape", () => {
  it("every entry is internally consistent", () => {
    for (const spec of SPECS) {
      expect(spec.id, "id must match its registry key").toBe(
        Object.keys(VIDEO_MODEL_REGISTRY).find((k) => VIDEO_MODEL_REGISTRY[k] === spec),
      );
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.creditsPerSecond).toBeGreaterThan(0);
      expect(spec.durations.length).toBeGreaterThan(0);
      expect(spec.aspectRatios.length).toBeGreaterThan(0);
      expect(spec.referenceSlots).toBeGreaterThanOrEqual(0);
      // A model must declare a provider substring n8n can price on.
      expect(spec.id.includes(spec.providerMatch) || spec.family === "gemini").toBe(true);
    }
  });

  it("does not register the auto sentinel as a provider model", () => {
    expect(VIDEO_MODEL_REGISTRY[AUTO_VIDEO_MODEL]).toBeUndefined();
    expect(resolveVideoModel(AUTO_VIDEO_MODEL)).toBeNull();
  });
});

describe("DRIFT: registry prices must equal the n8n cost rules", () => {
  // This is the guard that makes adding a model safe: if someone registers a
  // price the workflow would not actually charge, this fails.
  it("every model prices identically under the mirrored n8n switch", () => {
    for (const spec of SPECS) {
      expect(
        spec.creditsPerSecond,
        `${spec.id}: registry says ${spec.creditsPerSecond}/sec but n8n would charge ${n8nPerSecondCost(spec.id)}/sec`,
      ).toBe(n8nPerSecondCost(spec.id));
    }
  });

  it("pins the verified n8n rates so a silent edit is caught", () => {
    expect(n8nPerSecondCost("bytedance/seedance-2")).toBe(20);
    expect(n8nPerSecondCost("kling-3.0/video")).toBe(12);
    expect(n8nPerSecondCost("replicate:openai/sora-2")).toBe(12);
    expect(n8nPerSecondCost("replicate:prunaai/p-video")).toBe(4);
    // Gemini has its OWN branch in the live workflow (`includes('gemini') -> 20`).
    // This assertion previously pinned DEFAULT_CREDITS_PER_SECOND (12), which was
    // wrong AND kept the suite green while the workflow charged 20/sec — the test
    // was actively hiding the drift. Corrected 2026-08-06.
    expect(n8nPerSecondCost("gemini-omni-video")).toBe(GEMINI_CREDITS_PER_SECOND);
    expect(GEMINI_CREDITS_PER_SECOND).toBe(20);
    // The default must remain distinct from Gemini's rate, or this test would
    // pass again if the branch were dropped.
    expect(GEMINI_CREDITS_PER_SECOND).not.toBe(DEFAULT_CREDITS_PER_SECOND);
  });

  it("prices the app's fully-qualified id the same as n8n's short id", () => {
    // n8n matches by substring, so both forms must land on the same rate.
    expect(n8nPerSecondCost("replicate:prunaai/p-video")).toBe(n8nPerSecondCost("prunaai/p-video"));
    expect(n8nPerSecondCost("bytedance/seedance-2")).toBe(n8nPerSecondCost("seedance-2"));
  });

  it("mirrors n8n auto-selection", () => {
    expect(resolveAutoModel("ugc")).toBe("kling-3.0/video");
    expect(resolveAutoModel("clothing")).toBe("replicate:prunaai/p-video");
    expect(resolveAutoModel("showcase")).toBe("bytedance/seedance-2");
    expect(resolveAutoModel(null)).toBe("bytedance/seedance-2");
    // Whatever auto resolves to must itself be a registered model.
    for (const mode of ["ugc", "clothing", "showcase", null]) {
      expect(resolveVideoModel(resolveAutoModel(mode))).not.toBeNull();
    }
  });
});

describe("DRIFT: execution allowlists are derived from the registry", () => {
  it("every registered model is accepted at the execution boundary", () => {
    for (const spec of SPECS) expect(VIDEO_MODELS.has(spec.id)).toBe(true);
    expect(VIDEO_MODELS.has(AUTO_VIDEO_MODEL)).toBe(true);
    expect(VIDEO_MODELS.size).toBe(videoModelIds().length);
  });

  it("an unregistered model is rejected", () => {
    expect(VIDEO_MODELS.has("totally-made-up")).toBe(false);
  });

  it("every duration and aspect any model allows is accepted", () => {
    for (const spec of SPECS) {
      for (const d of spec.durations) expect(VIDEO_DURATIONS.has(d)).toBe(true);
      for (const a of spec.aspectRatios) expect(VIDEO_ASPECT_RATIOS.has(a)).toBe(true);
    }
  });

  it("keeps the values the shipped UI actually emits", () => {
    // Regression guard: these were the hard-coded allowlists before the registry.
    // "300" was deliberately DROPPED on 2026-08-06: no provider can render it, and
    // offering it billed 300s while asking the provider for 15s. Re-adding it here
    // to keep this assertion green would restore a 3585-credit over-charge.
    for (const d of ["4", "5", "6", "8", "10", "15"]) expect(allVideoDurations()).toContain(d);
    expect(allVideoDurations()).not.toContain("300");
    for (const a of ["1:1", "9:16", "16:9", "21:9"]) expect(allVideoAspectRatios()).toContain(a);
  });
});

describe("capabilities", () => {
  it("reports end-frame support per model, treating auto as capable", () => {
    expect(modelSupportsEndFrame("kling-3.0/video")).toBe(true);
    expect(modelSupportsEndFrame("replicate:openai/sora-2")).toBe(true);
    expect(modelSupportsEndFrame("replicate:prunaai/p-video")).toBe(true);
    expect(modelSupportsEndFrame("bytedance/seedance-2")).toBe(false);
    expect(modelSupportsEndFrame("gemini-omni-video")).toBe(false);
    // Matches the previous hard-coded behaviour: default scenes start as auto.
    expect(modelSupportsEndFrame("auto")).toBe(true);
    expect(modelSupportsEndFrame(undefined)).toBe(true);
    expect(modelSupportsEndFrame("unknown-model")).toBe(false);
  });

  it("maps prompt-dialect families exactly as the old helper did", () => {
    expect(videoModelFamily("kling-3.0/video")).toBe("kling");
    expect(videoModelFamily("bytedance/seedance-2-fast")).toBe("seedance");
    expect(videoModelFamily("replicate:prunaai/p-video")).toBe("pruna");
    expect(videoModelFamily("replicate:openai/sora-2")).toBe("sora");
    expect(videoModelFamily("gemini-omni-video")).toBe("gemini");
    expect(videoModelFamily("auto")).toBe("auto");
    expect(videoModelFamily(undefined)).toBe("auto");
  });

  it("gates durations per model, and unions them for auto", () => {
    expect(allowedDurationsFor("gemini-omni-video")).toEqual(["4", "6", "8", "10"]);
    expect(allowedDurationsFor("replicate:prunaai/p-video")).toEqual(["5", "10"]);
    // Kling's real provider maximum is 15s (Kie docs). The previous assertion
    // required "300", which no provider supports — corrected 2026-08-06.
    expect(allowedDurationsFor("kling-3.0/video")).toEqual(["5", "10", "15"]);
    expect(allowedDurationsFor("kling-3.0/video")).not.toContain("300");
    expect(allowedDurationsFor(AUTO_VIDEO_MODEL)).toEqual(expect.arrayContaining(["4", "5", "15"]));
    expect(allowedDurationsFor(AUTO_VIDEO_MODEL)).not.toContain("300");
  });
});

describe("estimateVideoCredits (display only — n8n is the billing authority)", () => {
  it("multiplies the per-second rate by duration", () => {
    expect(estimateVideoCredits("bytedance/seedance-2", "5")).toBe(100); // 20 * 5
    expect(estimateVideoCredits("kling-3.0/video", 10)).toBe(120); // 12 * 10
    expect(estimateVideoCredits("replicate:prunaai/p-video", "5")).toBe(20); // 4 * 5
  });

  it("adds the audio surcharge exactly as n8n does", () => {
    expect(estimateVideoCredits("kling-3.0/video", "5", { hasAudio: true }))
      .toBe((12 + AUDIO_SURCHARGE_PER_SECOND) * 5);
  });

  it("prices auto via the resolved auto model, and rejects a nonsense duration", () => {
    expect(estimateVideoCredits(AUTO_VIDEO_MODEL, "5")).toBe(100); // auto → seedance-2 (20/sec)
    expect(estimateVideoCredits("kling-3.0/video", "0")).toBeNull();
    expect(estimateVideoCredits("kling-3.0/video", "abc")).toBeNull();
  });

  it("falls back to the n8n default rate for an unregistered model", () => {
    expect(estimateVideoCredits("unknown-model", "5")).toBe(DEFAULT_CREDITS_PER_SECOND * 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BILLING INTEGRITY (2026-08-06)
//
// Invariant: the duration used for UI display, validation, credit calculation,
// deduction and the provider payload is ONE validated duration. Unsupported
// values are rejected before deduction — never silently clamped.
// ─────────────────────────────────────────────────────────────────────────────

/** The duration rules embedded in the live n8n `Parse Inputs & Calculate Cost`
 *  node. Kept here so a change on either side fails this suite. */
const N8N_DURATION_RULES: Record<string, { min?: number; max?: number; values?: number[] }> = {
  kling: { min: 3, max: 15 },
  seedance: { min: 4, max: 15 },
  sora: { min: 4, max: 12 },
  pruna: { min: 1, max: 10 },
  gemini: { values: [4, 6, 8, 10] },
};

describe("DRIFT: UI options, provider capability and n8n rules must agree", () => {
  it("every offered duration is renderable by that model", () => {
    for (const spec of SPECS) {
      for (const offered of spec.durations) {
        expect(
          isDurationAllowedFor(spec.id, offered),
          `${spec.id} offers ${offered}s in the UI but the provider cannot render it`,
        ).toBe(true);
      }
    }
  });

  it("every model declares its provider duration capability", () => {
    for (const spec of SPECS) {
      expect(
        Boolean(spec.providerDurationRange) || Boolean(spec.providerDurationValues),
        `${spec.id} has no provider duration capability, so nothing can reject an unrenderable value`,
      ).toBe(true);
    }
  });

  it("registry capability matches the rules embedded in the live workflow", () => {
    for (const spec of SPECS) {
      const key = Object.keys(N8N_DURATION_RULES).find((k) => spec.id.includes(k));
      expect(key, `${spec.id} has no matching n8n duration rule`).toBeTruthy();
      const rule = N8N_DURATION_RULES[key!];
      if (rule.values) {
        expect(spec.providerDurationValues, `${spec.id} discrete durations`).toEqual(rule.values);
      } else {
        expect(spec.providerDurationRange, `${spec.id} duration range`).toEqual([rule.min, rule.max]);
      }
    }
  });

  it("the removed fictional options stay removed", () => {
    // Kling "5 Min Premium" (300s) was billed at 300s and clamped to 15s.
    expect(allVideoDurations()).not.toContain("300");
    expect(isDurationAllowedFor("kling-3.0/video", 300)).toBe(false);
    // Sora 15s was billed at 15s and clamped to 12s.
    expect(isDurationAllowedFor("replicate:openai/sora-2", 15)).toBe(false);
    expect(VIDEO_MODEL_REGISTRY["replicate:openai/sora-2"].durations).not.toContain("15");
  });
});

describe("REJECTION: unsupported combinations are refused, not clamped", () => {
  it("rejects Kling at 300s", () => {
    const r = validateVideoModelOptions({ model: "kling-3.0/video", duration: "300" });
    expect(r?.field).toBe("duration");
    expect(r?.reason).toContain("cannot render 300s");
  });

  it("rejects Sora above its 12s provider maximum", () => {
    expect(validateVideoModelOptions({ model: "replicate:openai/sora-2", duration: "15" })?.field).toBe("duration");
    expect(validateVideoModelOptions({ model: "replicate:openai/sora-2", duration: "13" })?.field).toBe("duration");
    // 12 is the documented maximum and must still be accepted.
    expect(validateVideoModelOptions({ model: "replicate:openai/sora-2", duration: "12" })).toBeNull();
  });

  it("rejects Pruna at 300s and above its 10s maximum", () => {
    expect(validateVideoModelOptions({ model: "replicate:prunaai/p-video", duration: "300" })?.field).toBe("duration");
    expect(validateVideoModelOptions({ model: "replicate:prunaai/p-video", duration: "11" })?.field).toBe("duration");
    expect(validateVideoModelOptions({ model: "replicate:prunaai/p-video", duration: "10" })).toBeNull();
  });

  it("rejects Gemini durations outside its discrete set", () => {
    for (const bad of ["5", "7", "12", "300"]) {
      expect(validateVideoModelOptions({ model: "gemini-omni-video", duration: bad })?.field, bad).toBe("duration");
    }
    for (const good of ["4", "6", "8", "10"]) {
      expect(validateVideoModelOptions({ model: "gemini-omni-video", duration: good }), good).toBeNull();
    }
  });

  it("rejects unsupported aspect ratios where registry rules exist", () => {
    expect(validateVideoModelOptions({ model: "gemini-omni-video", duration: "4", aspectRatio: "21:9" })?.field)
      .toBe("aspect_ratio");
    expect(validateVideoModelOptions({ model: "gemini-omni-video", duration: "4", aspectRatio: "16:9" })).toBeNull();
  });

  it("rejects unsupported resolutions where the model exposes a choice", () => {
    expect(validateVideoModelOptions({ model: "gemini-omni-video", duration: "4", videoResolution: "8k" })?.field)
      .toBe("video_resolution");
    expect(validateVideoModelOptions({ model: "gemini-omni-video", duration: "4", videoResolution: "1080p" })).toBeNull();
  });

  it("rejects an unknown model rather than defaulting it", () => {
    expect(validateVideoModelOptions({ model: "totally-made-up", duration: "5" })?.field).toBe("model");
  });

  it("resolves auto to a concrete model BEFORE validating duration", () => {
    // auto + clothing resolves to Pruna (max 10s), so 15s must be rejected even
    // though other models allow it.
    expect(resolveEffectiveVideoModel("auto", "clothing")).toBe("replicate:prunaai/p-video");
    expect(validateVideoModelOptions({ model: "auto", videoMode: "clothing", duration: "15" })?.field).toBe("duration");
    // auto + ugc resolves to Kling, where 15s IS renderable.
    expect(validateVideoModelOptions({ model: "auto", videoMode: "ugc", duration: "15" })).toBeNull();
    // auto with no mode resolves to Seedance.
    expect(validateVideoModelOptions({ model: "auto", duration: "15" })).toBeNull();
  });

  it("accepts in-range durations the UI does not offer as buttons", () => {
    // The Director and storyboard scenes legitimately request these; rejecting
    // them would break working flows. Only unrenderable values must fail.
    expect(validateVideoModelOptions({ model: "bytedance/seedance-2", duration: "8" })).toBeNull();
    expect(validateVideoModelOptions({ model: "kling-3.0/video", duration: "7" })).toBeNull();
    expect(VIDEO_MODEL_REGISTRY["bytedance/seedance-2"].durations).not.toContain("8");
  });
});

describe("COST: one validated duration drives display, validation and billing", () => {
  it("UI estimate equals the mirrored n8n deduction for every offered duration", () => {
    for (const spec of SPECS) {
      for (const secs of spec.durations) {
        const estimate = estimateVideoCredits(spec.id, secs);
        const n8nWouldCharge = Number(secs) * n8nPerSecondCost(spec.id);
        expect(estimate, `${spec.id} @ ${secs}s`).toBe(n8nWouldCharge);
      }
    }
  });

  it("applies the audio surcharge identically to n8n", () => {
    for (const spec of SPECS) {
      const withAudio = estimateVideoCredits(spec.id, "5", { hasAudio: true });
      expect(withAudio).toBe(5 * (n8nPerSecondCost(spec.id) + AUDIO_SURCHARGE_PER_SECOND));
    }
  });

  it("quotes Gemini at the canonical rate", () => {
    expect(estimateVideoCredits("gemini-omni-video", "10")).toBe(10 * GEMINI_CREDITS_PER_SECOND);
    expect(estimateVideoCredits("gemini-omni-video", "10")).toBe(200);
    // The pre-fix behaviour under-quoted by 80 credits on a 10s clip.
    expect(estimateVideoCredits("gemini-omni-video", "10")).not.toBe(10 * DEFAULT_CREDITS_PER_SECOND);
  });

  it("estimates `auto` using the model n8n will actually pick", () => {
    // ugc -> Kling (12/sec), not the default Seedance (20/sec).
    expect(estimateVideoCredits("auto", "5", { videoMode: "ugc" })).toBe(60);
    expect(estimateVideoCredits("auto", "5", { videoMode: "clothing" })).toBe(20);
    expect(estimateVideoCredits("auto", "5", { videoMode: "showcase" })).toBe(100);
  });
});
