import { describe, expect, it } from "vitest";
import {
  AUDIO_SURCHARGE_PER_SECOND,
  AUTO_VIDEO_MODEL,
  DEFAULT_CREDITS_PER_SECOND,
  VIDEO_MODEL_REGISTRY,
  allVideoAspectRatios,
  allVideoDurations,
  allowedDurationsFor,
  estimateVideoCredits,
  modelSupportsEndFrame,
  n8nPerSecondCost,
  resolveAutoModel,
  resolveVideoModel,
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
    // Unmatched models fall to the workflow default.
    expect(n8nPerSecondCost("gemini-omni-video")).toBe(DEFAULT_CREDITS_PER_SECOND);
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
    for (const d of ["4", "5", "6", "8", "10", "15", "300"]) expect(allVideoDurations()).toContain(d);
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
    expect(allowedDurationsFor("kling-3.0/video")).toContain("300");
    expect(allowedDurationsFor(AUTO_VIDEO_MODEL)).toEqual(expect.arrayContaining(["4", "5", "300"]));
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
