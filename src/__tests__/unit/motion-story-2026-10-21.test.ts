import { describe, expect, it } from "vitest";
import { MOTION_SYSTEM, motionTitle, paletteFor, validateMotionSpec } from "@/lib/motion/spec";

/** Story cards (2026-10-21, Motion Inspo): stacked mixed-size words, soft shapes, a picture or a placeholder. */
const ctx = { shape: "9:16" as const, brand: { primary: "#1F1D1B", secondary: "#9C9A96" }, images: ["img1", "img2"] };

describe("story cards", () => {
  it("keeps lines, shapes, a picture ref and the layout", () => {
    const spec = validateMotionSpec({ kind: "full", palette: { background: "#FFFFFF" }, scenes: [
      { template: "story", seconds: 3.5, lines: [{ text: "but this", size: "s", align: "left" }, { text: "harvest", size: "xl", accent: true, align: "right" }, "won't wait"], place: "top", backdrop: "hill", picture: "img2", frame: "circle", enter: "blur" },
    ] }, ctx);
    expect(spec?.scenes[0]).toEqual({ template: "story", seconds: 3.5, lines: [
      { text: "but this", size: "s", accent: false, align: "left" },
      { text: "harvest", size: "xl", accent: true, align: "right" },
      { text: "won't wait", size: "m", accent: false, align: "center" },
    ], place: "top", backdrop: "hill", picture: "img2", frame: "circle", enter: "blur" });
    expect(motionTitle(spec!)).toBe("Motion · but this harvest won't wait");
  });
  it("a picture we didn't offer becomes nothing; a placeholder says what to add", () => {
    const spec = validateMotionSpec({ scenes: [
      { template: "story", lines: [{ text: "Fresh" }], picture: "https://elsewhere.example/x.jpg" },
      { template: "story", lines: [], placeholder: "the farmer holding a tray", backdrop: "sunrise" },
    ] }, ctx);
    expect(spec?.scenes[0]).not.toHaveProperty("picture");
    expect(spec?.scenes[1]).toMatchObject({ placeholder: "the farmer holding a tray", backdrop: "sunrise", frame: "circle" });
  });
  it("drops an empty card and clamps sizes and lengths", () => {
    const spec = validateMotionSpec({ scenes: [
      { template: "story", lines: [] },
      { template: "story", seconds: 40, lines: [{ text: "one two three four five six seven", size: "huge", align: "up" }], backdrop: "stars" },
    ] }, ctx);
    expect(spec?.scenes).toHaveLength(1);
    expect(spec?.scenes[0]).toMatchObject({ seconds: 7, lines: [{ text: "one two three four five", size: "m", align: "center" }], backdrop: "plain", place: "center", enter: "blur" });
  });
  it("the planner knows the template and the supporting colour", () => {
    expect(MOTION_SYSTEM).toContain('"template":"story"');
    const p = paletteFor({ background: "#FFFFFF", accent: "#1F1D1B" }, ctx.brand);
    expect(p).toMatchObject({ background: "#FFFFFF", accent: "#1F1D1B", second: "#9C9A96" });
  });
});
