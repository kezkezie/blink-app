import { describe, expect, it } from "vitest";
import { detectCuts, frameDiff, sampleTimes, shotsFrom, toGrey } from "@/lib/video-inspo/cuts";
import { inspoPattern, validatePlan, validateRecipe } from "@/lib/video-inspo/plan";

/** Video Inspo (2026-10-12): finding the shots of a reference video, and checking Claude's plan. */
describe("finding the shots", () => {
  const times = sampleTimes(12); // every 0.25 s
  /** Steady motion noise with hard cuts at the given seconds. */
  const diffsWithCuts = (cuts: number[], noise = 0.03) => times.map((t, i) => (i === 0 ? 0 : cuts.some((c) => Math.abs(c - t) < 0.01) ? 0.45 : noise + ((i * 7919) % 13) / 1000));

  it("samples about 4 a second, fewer for long videos", () => {
    expect(times.length).toBe(48);
    expect(sampleTimes(90).length).toBeLessThanOrEqual(240);
    expect(sampleTimes(90)[1]).toBeCloseTo(0.375, 3);
  });
  it("finds hard cuts above the video's usual motion", () => {
    expect(detectCuts(diffsWithCuts([2, 5.5, 9]), times)).toEqual([2, 5.5, 9]);
  });
  it("ignores a flash right after a cut (minimum shot length) and a calm video has no cuts", () => {
    expect(detectCuts(diffsWithCuts([2, 2.25, 6]), times)).toEqual([2, 6]);
    expect(detectCuts(diffsWithCuts([]), times)).toEqual([]);
  });
  it("a busy handheld video needs a bigger jump to count as a cut", () => {
    const busy = diffsWithCuts([4], 0.2);
    expect(detectCuts(busy, times)).toEqual([4]);
  });
  it("turns cuts into shots and merges the shortest when there are too many", () => {
    expect(shotsFrom([2, 5.5], 8)).toEqual([{ start: 0, end: 2 }, { start: 2, end: 5.5 }, { start: 5.5, end: 8 }]);
    const many = shotsFrom(Array.from({ length: 29 }, (_, i) => i + 1), 30, 16);
    expect(many).toHaveLength(16);
    expect(many[0].start).toBe(0);
    expect(many[15].end).toBe(30);
    for (let i = 1; i < many.length; i++) expect(many[i].start).toBe(many[i - 1].end);
  });
  it("compares thumbnails in grey", () => {
    const black = new Uint8ClampedArray(16).fill(0);
    const white = toGrey(new Uint8ClampedArray(64).fill(255));
    expect(frameDiff(black, white)).toBe(1);
    expect(frameDiff(white, white)).toBe(0);
  });
});

describe("checking the plan", () => {
  it("keeps good scenes, drops empty ones, clamps numbers and modes", () => {
    const plan = validatePlan({
      title: "Morning rush", why: ["Hook in one second", "Cuts on the beat"], hook: "Steam rising off chai",
      style: { look: "warm film", pace: "fast", camera: "handheld", music: "afrobeats", text: "big bold captions" },
      scenes: [
        { shot: 1, seconds: 1.2, what: "Close on the cup", prompt: "Steam rises from a chai cup on a wooden counter, slow push in, warm window light, cosy", text: "MORNING SORTED", mode: "showcase" },
        { shot: 9, seconds: 99, what: "x", prompt: "too short" },
        { shot: 2, seconds: 3, prompt: "A barista slides a mandazi plate across the counter, quick whip pan, bright and busy", mode: "laser_show" },
      ],
      caption: "Your morning, sorted.",
    }, 3);
    expect(plan?.scenes).toHaveLength(2);
    expect(plan?.scenes[0]).toMatchObject({ shot: 1, seconds: 1.2, text: "MORNING SORTED", mode: "showcase" });
    expect(plan?.scenes[1].mode).toBe("showcase");
    expect(validatePlan({ scenes: [] }, 3)).toBeNull();
    expect(validatePlan("nope", 3)).toBeNull();
  });
  it("an edit recipe keeps cut lengths and on-screen words inside the video", () => {
    const r = validateRecipe({ cuts: [1, 1.5, 0.1, 40], texts: [{ at: 0, duration: 1.2, text: "WAIT FOR IT", y: 20, size: "big" }, { at: 99, text: "" }], aspect: "4:3" }, 10);
    expect(r?.cuts).toEqual([1, 1.5, 0.3, 15]);
    expect(r?.texts).toEqual([{ at: 0, duration: 1.2, text: "WAIT FOR IT", y: 20, size: "big", style: "caption" }]);
    expect(r?.aspect).toBe("9:16");
    expect(validateRecipe({ cuts: [] }, 10)).toBeNull();
  });
});

describe("one render per setup, cut into the inspo's rhythm", () => {
  it("a scene can cover several shots; the pattern alternates scenes like the inspo did", () => {
    const plan = validatePlan({
      title: "Flip-flop", scenes: [
        { shots: [1, 3, 5], seconds: 3, prompt: "A calm cream poster with the cook holding a steaming platter, slow push in", text: "MAMA NJERI" },
        { shots: [2, 4], seconds: 2, prompt: "A busy family table full of platters, steam rising, warm golden light", text: "20% OFF" },
      ],
    }, 6)!;
    expect(plan.scenes.map((s) => s.shots)).toEqual([[1, 3, 5], [2, 4]]);
    const shots = [0, 1, 2, 3, 4, 5].map((t) => ({ start: t, end: t + 1 }));
    const p = inspoPattern(plan, shots);
    expect(p.cuts.map((c) => c.scene)).toEqual([0, 1, 0, 1, 0, 0]); // shot 6 goes to the nearest (shot 5's scene)
    expect(p.texts).toEqual([{ at: 0, duration: 1.2, text: "MAMA NJERI" }, { at: 1, duration: 1.2, text: "20% OFF" }]);
    expect(p.scenes).toBe(2);
  });
});

