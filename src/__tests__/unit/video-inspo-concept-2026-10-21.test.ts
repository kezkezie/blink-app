import { describe, expect, it } from "vitest";
import { validatePlan } from "@/lib/video-inspo/plan";
import { frameRange } from "@/lib/video-inspo/cuts";

/** Video Inspo keeps the reference's concept, one cast, and knows motion graphics (2026-10-21). */
const scene = { shots: [1], seconds: 3, what: "The farmer lifts a tray", prompt: "The same farmer, a Kenyan woman in her 30s with short natural hair and a green apron, lifts a tray of button mushrooms, slow push in, soft daylight", text: "Picked today", mode: "kling_keyframe" };

describe("Video Inspo plans", () => {
  it("keeps kind, concept and cast", () => {
    const p = validatePlan({ title: "Waiting is the problem", kind: "motion", concept: "A quote told in kinetic type; ours says fresh can't wait.", cast: "a Kenyan woman in her 30s with short natural hair and a green apron", scenes: [scene] }, 3);
    expect(p).toMatchObject({ kind: "motion", concept: "A quote told in kinetic type; ours says fresh can't wait.", cast: "a Kenyan woman in her 30s with short natural hair and a green apron" });
  });
  it("defaults to footage with no concept or cast", () => {
    expect(validatePlan({ scenes: [scene] }, 1)).toMatchObject({ kind: "footage", concept: "", cast: "" });
  });
});

describe("blank frames", () => {
  it("a frame with no picture has no range", () => {
    expect(frameRange(new Uint8ClampedArray(64 * 36))).toBe(0);
    const f = new Uint8ClampedArray(64 * 36); f[10] = 200; f[20] = 20;
    expect(frameRange(f)).toBe(200);
  });
});
