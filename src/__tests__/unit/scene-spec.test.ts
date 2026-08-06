import { describe, expect, it } from "vitest";
import { parseSceneSpec, isSceneSpec, SCENE_SPEC_VERSION, SCENE_SPEC_LIMITS } from "@/lib/scene-spec";

const HTTPS = "https://cdn.example/frame.png";

function validSpec(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: SCENE_SPEC_VERSION,
    sceneId: "scene-1",
    sceneNumber: 1,
    ...overrides,
  };
}

describe("parseSceneSpec — valid input", () => {
  it("accepts a minimal spec and defaults the collections", () => {
    const result = parseSceneSpec(validSpec());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sceneId).toBe("scene-1");
    expect(result.value.castRefs).toEqual([]);
    expect(result.value.styleRefs).toEqual([]);
  });

  it("accepts a fully populated spec across every field group", () => {
    const result = parseSceneSpec(validSpec({
      sequenceId: "seq-1",
      sourceIdea: "two adults escape using our blanket",
      scenePurpose: "establish",
      narrativeBeat: "the ordinary evening",
      imagePrompt: "a warm living room at dusk",
      videoPrompt: "slow dolly in as the blanket is unfolded",
      endFramePrompt: "the blanket fully draped",
      dialogue: "It holds.",
      narration: "Strength you can feel.",
      audioDirection: "low ambient room tone",
      castRefs: [{ name: "Sam", actorId: "actor-1", sheetUrl: HTTPS, styleKey: "actor-1::anime", pinned: true }],
      wardrobe: "navy jumper throughout",
      locationLabel: "living room",
      environmentRef: HTTPS,
      startFrameRef: HTTPS,
      endFrameRef: HTTPS,
      styleRefs: [HTTPS],
      styleLabel: "Cinematic Realism",
      cameraFraming: "medium wide",
      cameraMovement: "dolly in",
      lens: "35mm",
      lighting: "warm practical",
      physicsNotes: "fabric falls with weight",
      durationSeconds: "10",
      aspectRatio: "16:9",
      videoResolution: "1080p",
      videoMode: "showcase",
      selectedModel: "kling-3.0/video",
      modelRequirements: { endFrame: true, nativeAudio: true, referenceSlots: 3 },
      generationState: "queued",
      billingState: "not_charged",
      retryState: "none",
      providerTaskId: "task-9",
      revisionParentId: "content-parent",
      contentId: "content-1",
      assetUrl: HTTPS,
      brandContextVersion: "ctx-v1",
      storyboardSheet: { sheetUrl: HTTPS, panelNumber: 2 },
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.castRefs[0]).toMatchObject({ name: "Sam", pinned: true });
    expect(result.value.modelRequirements).toEqual({ endFrame: true, nativeAudio: true, referenceSlots: 3 });
    expect(result.value.storyboardSheet).toEqual({ sheetUrl: HTTPS, panelNumber: 2 });
  });

  it("accepts a numeric Director duration coerced to the allowlisted string", () => {
    const result = parseSceneSpec(validSpec({ durationSeconds: 10 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.durationSeconds).toBe("10");
  });

  it("isSceneSpec is a convenience guard over the same rules", () => {
    expect(isSceneSpec(validSpec())).toBe(true);
    expect(isSceneSpec({ schemaVersion: 99 })).toBe(false);
  });
});

describe("parseSceneSpec — rejections", () => {
  it("rejects a non-object", () => {
    expect(parseSceneSpec(null).ok).toBe(false);
    expect(parseSceneSpec("scene").ok).toBe(false);
  });

  it("rejects an unsupported schema version", () => {
    const result = parseSceneSpec({ ...validSpec(), schemaVersion: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("schemaVersion");
  });

  it("rejects a missing sceneId", () => {
    const result = parseSceneSpec({ schemaVersion: SCENE_SPEC_VERSION, sceneNumber: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("sceneId");
  });

  it("rejects an invalid sceneNumber (zero, negative, non-integer, out of range)", () => {
    for (const sceneNumber of [0, -1, 1.5, SCENE_SPEC_LIMITS.maxSceneNumber + 1, "1"]) {
      const result = parseSceneSpec({ schemaVersion: SCENE_SPEC_VERSION, sceneId: "s", sceneNumber });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.field).toBe("sceneNumber");
    }
  });

  it("rejects an overlong prompt rather than truncating it", () => {
    const result = parseSceneSpec(validSpec({ videoPrompt: "x".repeat(SCENE_SPEC_LIMITS.prompt + 1) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("videoPrompt");
  });

  it("rejects overlong dialogue and narration", () => {
    expect(parseSceneSpec(validSpec({ dialogue: "x".repeat(SCENE_SPEC_LIMITS.dialogue + 1) })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ narration: "x".repeat(SCENE_SPEC_LIMITS.dialogue + 1) })).ok).toBe(false);
  });

  it("rejects a disallowed duration, aspect ratio, resolution, mode and model", () => {
    // 16s is beyond every model's provider maximum. ("7" used to stand in for
    // "invalid" but is renderable by Kling/Seedance — see 2026-08-06 billing slice.)
    expect(parseSceneSpec(validSpec({ durationSeconds: "16" })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ aspectRatio: "5:5" })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ videoResolution: "8K" })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ videoMode: "exfiltrate" })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ selectedModel: "secret-model" })).ok).toBe(false);
  });

  it("rejects an invalid generation/billing/retry state (shared vocabulary)", () => {
    expect(parseSceneSpec(validSpec({ generationState: "exploding" })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ billingState: "free" })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ retryState: "maybe" })).ok).toBe(false);
  });

  it("rejects excessive cast and style reference arrays", () => {
    const cast = Array.from({ length: SCENE_SPEC_LIMITS.castRefs + 1 }, (_, i) => ({ name: `Actor ${i}` }));
    expect(parseSceneSpec(validSpec({ castRefs: cast })).ok).toBe(false);
    const styles = Array.from({ length: SCENE_SPEC_LIMITS.styleRefs + 1 }, (_, i) => `https://cdn.example/${i}.png`);
    expect(parseSceneSpec(validSpec({ styleRefs: styles })).ok).toBe(false);
  });

  it("rejects unsafe URLs everywhere a URL is accepted", () => {
    expect(parseSceneSpec(validSpec({ startFrameRef: "http://cdn.example/x.png" })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ endFrameRef: "javascript:alert(1)" })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ environmentRef: "ftp://cdn.example/x" })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ styleRefs: ["http://cdn.example/x.png"] })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ castRefs: [{ name: "Sam", sheetUrl: "http://x/y.png" }] })).ok).toBe(false);
  });

  it("rejects a cast reference without a name and a malformed sheet provenance", () => {
    expect(parseSceneSpec(validSpec({ castRefs: [{ actorId: "a1" }] })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ storyboardSheet: { sheetUrl: HTTPS, panelNumber: 0 } })).ok).toBe(false);
    expect(parseSceneSpec(validSpec({ storyboardSheet: { panelNumber: 1 } })).ok).toBe(false);
  });
});

describe("parseSceneSpec — unknown-field quarantine", () => {
  it("quarantines unknown top-level keys instead of trusting or dropping them", () => {
    const result = parseSceneSpec(validSpec({ webhookUrl: "https://evil.example", legacyThing: 42 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.quarantinedFields).toEqual({ webhookUrl: "https://evil.example", legacyThing: 42 });
    // Quarantined data is never promoted to a spec field.
    expect((result.value as unknown as Record<string, unknown>).webhookUrl).toBeUndefined();
  });

  it("merges explicit quarantine with newly discovered unknown keys", () => {
    const result = parseSceneSpec(validSpec({ quarantinedFields: { a: 1 }, b: 2 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.quarantinedFields).toEqual({ a: 1, b: 2 });
  });

  it("omits quarantinedFields entirely when there is nothing to quarantine", () => {
    const result = parseSceneSpec(validSpec());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.quarantinedFields).toBeUndefined();
  });
});
