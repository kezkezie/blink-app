import { describe, expect, it } from "vitest";
import { MOTION_SYSTEM, motionTitle, motionUserPrompt, validateMotionSpec } from "@/lib/motion/spec";

/** Motion use cases from Claude's own motion graphics (2026-10-21): bars, before-and-after, key points. */
const ctx = { shape: "16:9" as const, brand: { primary: "#2E1A6E", secondary: "#F5C542" } };

describe("bars, compare and points", () => {
  it("keeps good scenes, with labels and numbers cleaned", () => {
    const spec = validateMotionSpec({ scenes: [
      { template: "bars", seconds: 6, title: "Our year, stacked up", bars: [{ label: "Q1", value: 120 }, { label: "Q2", value: 180 }, { label: "Q3", value: 260 }, { label: "bad", value: "x" }], suffix: "k", highlight: 2 },
      { template: "compare", seconds: 4, label: "Churn, down to", from: 8.4, to: 0.9, suffix: "%", prefix: "$" },
      { template: "points", seconds: 7, title: "Work moves up", points: ["Data entry goes to AI", "People handle judgement", "", "Managers coach more"] },
    ] }, ctx)!;
    const [bars, compare, points] = spec.scenes;
    expect(bars).toMatchObject({ template: "bars", bars: [{ label: "Q1", value: 120 }, { label: "Q2", value: 180 }, { label: "Q3", value: 260 }], suffix: "k", highlight: 2, decimals: 0 });
    expect(compare).toMatchObject({ template: "compare", from: 8.4, to: 0.9, suffix: "%", decimals: 1 });
    expect((compare as { prefix?: string }).prefix).toBeUndefined(); // never "$0.9%"
    expect(points).toMatchObject({ template: "points", points: ["Data entry goes to AI", "People handle judgement", "Managers coach more"] });
    expect(motionTitle(spec)).toBe("Motion · Our year, stacked up");
  });

  it("drops scenes that can't be drawn", () => {
    expect(validateMotionSpec({ scenes: [{ template: "bars", seconds: 5, title: "One bar", bars: [{ label: "A", value: 1 }] }] }, ctx)).toBeNull();
    expect(validateMotionSpec({ scenes: [{ template: "compare", seconds: 4, label: "Same", from: 3, to: 3 }] }, ctx)).toBeNull();
    expect(validateMotionSpec({ scenes: [{ template: "points", seconds: 5, title: "Lonely", points: ["Only one"] }] }, ctx)).toBeNull();
  });

  it("asks Claude to plan like a director and to use only the material's numbers", () => {
    expect(MOTION_SYSTEM).toMatch(/Plan like a director/);
    expect(MOTION_SYSTEM).toMatch(/never invent one/);
    expect(MOTION_SYSTEM).toMatch(/"template":"bars"/);
    const text = motionUserPrompt({ brandName: "Brightline", prompt: "Our results", shape: "16:9", colours: [], hasLogo: false, products: [], pictures: [], source: "Jan 120\nFeb 180" });
    expect(text).toContain('Material they gave (use its words and numbers; nothing else):\n"""\nJan 120\nFeb 180\n"""');
  });
});
