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
  generalReferenceSlotsFor,
  isDurationAllowedFor,
  isEndFrameAllowedFor,
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
      expect(spec.generalReferenceSlots).toBeGreaterThanOrEqual(0);
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
  it("reports end-frame support per model", () => {
    // Documented support only. Kling: image_urls[1] is the last frame (Kie docs).
    // Pruna: last_frame_image (Replicate schema), now actually sent by Video V3.
    expect(modelSupportsEndFrame("kling-3.0/video")).toBe(true);
    expect(modelSupportsEndFrame("replicate:prunaai/p-video")).toBe(true);
    // Sora was `true` until 2026-08-07. Its schema has NO end-frame input, and
    // because the UI auto-enabled from this flag it generated a paid image the
    // provider never received. Corrected — do not restore this to true.
    expect(modelSupportsEndFrame("replicate:openai/sora-2")).toBe(false);
    expect(modelSupportsEndFrame("bytedance/seedance-2")).toBe(false);
    expect(modelSupportsEndFrame("gemini-omni-video")).toBe(false);
    // `auto`/undefined still report capable so the option can be OFFERED before a
    // concrete model is chosen; it never switches the option ON, and the resolved
    // model is re-checked at the point of spend.
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
  sora: { values: [4, 8, 12] }, // schema enum openai/sora-2 763a9321…; proved by a live 422 on 5s
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
    // 5 and 10 were the post-2026-08-06 replacements and were ALSO invalid.
    expect(isDurationAllowedFor("replicate:openai/sora-2", 5)).toBe(false);
    expect(isDurationAllowedFor("replicate:openai/sora-2", 10)).toBe(false);
    expect(VIDEO_MODEL_REGISTRY["replicate:openai/sora-2"].durations).toEqual(["4", "8", "12"]);
    expect(VIDEO_MODEL_REGISTRY["replicate:openai/sora-2"].providerDurationRange).toBeUndefined();
    expect(VIDEO_MODEL_REGISTRY["replicate:openai/sora-2"].providerDurationValues).toEqual([4, 8, 12]);
  });
});

describe("REJECTION: unsupported combinations are refused, not clamped", () => {
  it("rejects Kling at 300s", () => {
    const r = validateVideoModelOptions({ model: "kling-3.0/video", duration: "300" });
    expect(r?.field).toBe("duration");
    expect(r?.reason).toContain("cannot render 300s");
  });

  it("rejects every Sora duration outside the discrete schema enum {4,8,12}", () => {
    // Sora publishes components.schemas.seconds.enum = [4,8,12]. It is NOT a
    // 4-12 range: a live 422 on 5s proved that on 2026-08-07, after the UI had
    // been offering 5 and 10 and charging then refunding on every attempt.
    for (const bad of ["5", "10", "13", "15", "6", "11"]) {
      expect(validateVideoModelOptions({ model: "replicate:openai/sora-2", duration: bad })?.field, bad).toBe("duration");
    }
    for (const good of ["4", "8", "12"]) {
      expect(validateVideoModelOptions({ model: "replicate:openai/sora-2", duration: good }), good).toBeNull();
    }
  });

  it("withholds Sora aspect ratios the builder would map to a rejected value", () => {
    // The shared builder maps 1:1 -> "square", but Sora's provider enum is only
    // ['portrait','landscape'], so 1:1 is withheld in the registry rather than
    // changing the builder for one model.
    expect(validateVideoModelOptions({ model: "replicate:openai/sora-2", duration: "4", aspectRatio: "1:1" })?.field)
      .toBe("aspect_ratio");
    for (const ok of ["16:9", "9:16", "21:9"]) {
      expect(validateVideoModelOptions({ model: "replicate:openai/sora-2", duration: "4", aspectRatio: ok }), ok).toBeNull();
    }
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

  it("quotes Sora at 48/96/144 for its three valid durations", () => {
    expect(estimateVideoCredits("replicate:openai/sora-2", "4")).toBe(48);
    expect(estimateVideoCredits("replicate:openai/sora-2", "8")).toBe(96);
    expect(estimateVideoCredits("replicate:openai/sora-2", "12")).toBe(144);
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

// ─────────────────────────────────────────────────────────────────────────────
// END-FRAME BILLING INTEGRITY (2026-08-07)
//
// An enabled end frame triggers a SECOND PAID IMAGE generation. Until this slice,
// `supportsEndFrame: true` AUTO-ENABLED it, so Sora (which has no end-frame input
// at all) and Pruna (whose end frame the workflow never sent) both burned an image
// generation the provider never received.
//
// Invariant: capability decides AVAILABILITY, never INTENT.
// ─────────────────────────────────────────────────────────────────────────────

describe("END FRAME: capability is availability, never intent", () => {
  it("Sora declares NO end-frame support (its schema has no such input)", () => {
    expect(VIDEO_MODEL_REGISTRY["replicate:openai/sora-2"].supportsEndFrame).toBe(false);
    expect(isEndFrameAllowedFor("replicate:openai/sora-2")).toBe(false);
  });

  it("only models with a documented end-frame input may offer it", () => {
    // Kling: image_urls[1] is the last frame (Kie docs). Pruna: last_frame_image
    // (Replicate schema), now actually sent by Video V3.
    expect(isEndFrameAllowedFor("kling-3.0/video")).toBe(true);
    expect(isEndFrameAllowedFor("replicate:prunaai/p-video")).toBe(true);
    // Seedance has only `return_last_frame` (an OUTPUT flag) and Gemini none.
    expect(isEndFrameAllowedFor("bytedance/seedance-2")).toBe(false);
    expect(isEndFrameAllowedFor("bytedance/seedance-2-fast")).toBe(false);
    expect(isEndFrameAllowedFor("gemini-omni-video")).toBe(false);
    expect(isEndFrameAllowedFor("unknown-model")).toBe(false);
  });

  it("NO model may generate an end-frame image merely because supportsEndFrame is true", () => {
    // The regression this whole slice exists to prevent. `isEndFrameAllowedFor`
    // answers "may the option be offered?" — it must never be read as "is it on?".
    // There is deliberately no registry function that returns an ENABLED end frame:
    // intent lives only in the user's `useEndFrame` selection.
    for (const spec of SPECS) {
      const allowed = isEndFrameAllowedFor(spec.id);
      expect(allowed).toBe(spec.supportsEndFrame);
      // A capability of `true` must NOT by itself make a request valid: the
      // request still has to carry an end frame for the guard to apply at all.
      expect(validateVideoModelOptions({ model: spec.id, duration: spec.durations[0] })).toBeNull();
    }
  });

  it("rejects an end frame on every unsupported model, before any spend", () => {
    for (const id of ["replicate:openai/sora-2", "bytedance/seedance-2", "bytedance/seedance-2-fast", "gemini-omni-video"]) {
      const spec = VIDEO_MODEL_REGISTRY[id];
      const r = validateVideoModelOptions({ model: id, duration: spec.durations[0], hasEndFrame: true });
      expect(r?.field, id).toBe("end_frame");
      expect(r?.reason, id).toContain("does not support an end frame");
    }
  });

  it("allows an end frame on supported models", () => {
    expect(validateVideoModelOptions({ model: "kling-3.0/video", duration: "5", hasEndFrame: true })).toBeNull();
    expect(validateVideoModelOptions({ model: "replicate:prunaai/p-video", duration: "5", hasEndFrame: true })).toBeNull();
  });

  it("resolves auto before deciding end-frame availability", () => {
    // auto + clothing -> Pruna (supported); auto with no mode -> Seedance (not).
    expect(isEndFrameAllowedFor("auto", "clothing")).toBe(true);
    expect(isEndFrameAllowedFor("auto", null)).toBe(false);
    expect(validateVideoModelOptions({ model: "auto", videoMode: null, duration: "5", hasEndFrame: true })?.field)
      .toBe("end_frame");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE-SLOT SEMANTICS (2026-08-07)
//
// Four distinct things, never to be conflated (see the taxonomy on VideoModelSpec):
// general reference · start/first frame · end/last frame · provider output flag.
// A first or last frame is NOT a general reference slot.
// ─────────────────────────────────────────────────────────────────────────────

describe("REFERENCE SLOTS: frames are not general references", () => {
  it("records the payload field for each temporal frame", () => {
    // Kling's image_urls is first/last frame per Kie docs — NOT three general refs.
    expect(VIDEO_MODEL_REGISTRY["kling-3.0/video"].startFrameField).toBe("image_urls[0]");
    expect(VIDEO_MODEL_REGISTRY["kling-3.0/video"].endFrameField).toBe("image_urls[1]");
    expect(VIDEO_MODEL_REGISTRY["replicate:openai/sora-2"].startFrameField).toBe("input_reference");
    expect(VIDEO_MODEL_REGISTRY["replicate:openai/sora-2"].endFrameField).toBeNull();
    expect(VIDEO_MODEL_REGISTRY["replicate:prunaai/p-video"].startFrameField).toBe("image");
    expect(VIDEO_MODEL_REGISTRY["replicate:prunaai/p-video"].endFrameField).toBe("last_frame_image");
    // Reference-based models have no temporal frame semantics at all.
    expect(VIDEO_MODEL_REGISTRY["bytedance/seedance-2"].startFrameField).toBeNull();
    expect(VIDEO_MODEL_REGISTRY["bytedance/seedance-2"].endFrameField).toBeNull();
    expect(VIDEO_MODEL_REGISTRY["gemini-omni-video"].startFrameField).toBeNull();
  });

  it("advertises general reference slots conservatively, excluding frames", () => {
    // Kling: 0. Its image_urls entries are first/last frame, and `ref_image_url` is
    // NOT in Kie's documented parameter list, so it is not advertised as a slot.
    expect(generalReferenceSlotsFor("kling-3.0/video")).toBe(0);
    // Sora/Pruna: their schemas expose only frame inputs.
    expect(generalReferenceSlotsFor("replicate:openai/sora-2")).toBe(0);
    expect(generalReferenceSlotsFor("replicate:prunaai/p-video")).toBe(0);
    // Seedance: 3, the number verified reachable end-to-end (was advertised as 4).
    expect(generalReferenceSlotsFor("bytedance/seedance-2")).toBe(3);
    expect(generalReferenceSlotsFor("bytedance/seedance-2-fast")).toBe(3);
    // Gemini: conservative 1 — Kie publishes no documented limit and it is unexercised.
    expect(generalReferenceSlotsFor("gemini-omni-video")).toBe(1);
    expect(generalReferenceSlotsFor("unknown-model")).toBe(0);
  });

  it("never advertises the old unverified numbers", () => {
    // Seedance was 4 with only 3 reachable; Kling was 1 while the builder could send
    // 3. Neither number was verified end-to-end.
    expect(generalReferenceSlotsFor("bytedance/seedance-2")).not.toBe(4);
    // An output flag is not a slot: Seedance's return_last_frame must never be
    // counted, and it has no end-frame INPUT.
    expect(VIDEO_MODEL_REGISTRY["bytedance/seedance-2"].supportsEndFrame).toBe(false);
  });

  it("rejects excess general references rather than dropping them", () => {
    expect(validateVideoModelOptions({ model: "gemini-omni-video", duration: "4", generalReferenceCount: 1 })).toBeNull();
    const r = validateVideoModelOptions({ model: "gemini-omni-video", duration: "4", generalReferenceCount: 2 });
    expect(r?.field).toBe("reference_images");
    expect(r?.reason).toContain("accepts 1 reference image(s), got 2");
    expect(validateVideoModelOptions({ model: "bytedance/seedance-2", duration: "5", generalReferenceCount: 3 })).toBeNull();
    expect(validateVideoModelOptions({ model: "bytedance/seedance-2", duration: "5", generalReferenceCount: 4 })?.field)
      .toBe("reference_images");
    // Models with zero general slots reject any general reference. Each uses a
    // duration that model actually supports, so the duration gate cannot mask the
    // reference-count assertion (Sora is 4/8/12, not 5).
    for (const [id, dur] of [
      ["kling-3.0/video", "5"],
      ["replicate:openai/sora-2", "4"],
      ["replicate:prunaai/p-video", "5"],
    ] as [string, string][]) {
      expect(validateVideoModelOptions({ model: id, duration: dur, generalReferenceCount: 0 }), id).toBeNull();
      expect(validateVideoModelOptions({ model: id, duration: dur, generalReferenceCount: 1 })?.field, id)
        .toBe("reference_images");
    }
  });

  it("end-frame availability stays governed separately", () => {
    // A model with zero general slots may still accept an end frame (Kling, Pruna),
    // and a model with three general slots may accept none (Seedance).
    expect(generalReferenceSlotsFor("kling-3.0/video")).toBe(0);
    expect(isEndFrameAllowedFor("kling-3.0/video")).toBe(true);
    expect(generalReferenceSlotsFor("bytedance/seedance-2")).toBe(3);
    expect(isEndFrameAllowedFor("bytedance/seedance-2")).toBe(false);
  });
});
