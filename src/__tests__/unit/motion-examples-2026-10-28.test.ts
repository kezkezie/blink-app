import { describe, expect, it } from "vitest";
import { CATEGORIES, EXAMPLES, exampleSpec, lookSample } from "@/lib/motion/examples";
import { LOOKS } from "@/lib/motion/looks";
import { totalSeconds, validateMotionSpec, MAX_MOTION_SECONDS, type MotionShape } from "@/lib/motion/spec";

/** The Motion page's examples and looks (2026-10-28): each one a valid plan, in the brand's name and colour. */
describe("motion examples", () => {
  const brand = { brand: "Nuf Farms", primary: "#3FA34D", secondary: "#F2C14E" };

  it("every example is a plan our checks accept, in every shape, with the brand in it", () => {
    for (const shape of ["9:16", "1:1", "16:9"] as MotionShape[]) {
      for (const ex of EXAMPLES) {
        const spec = exampleSpec(ex, { shape, ...brand });
        const checked = validateMotionSpec(spec, { shape, brand: { primary: brand.primary, secondary: brand.secondary } });
        expect(checked, `${ex.id} ${shape}`).not.toBeNull();
        expect(checked!.scenes.length, ex.id).toBe(spec.scenes.length);
        expect(checked!.look, ex.id).toBe(ex.look);
        expect(totalSeconds(spec), ex.id).toBeLessThanOrEqual(MAX_MOTION_SECONDS);
        expect(LOOKS.some((l) => l.id === ex.look), ex.id).toBe(true);
      }
    }
    expect(JSON.stringify(exampleSpec(EXAMPLES.find((e) => e.id === "product-drop")!, { shape: "9:16", ...brand }))).toContain("Nuf Farms Signature");
  });

  it("a loop survives the checks, and a see-through name bar never loops", () => {
    const loop = exampleSpec(EXAMPLES.find((e) => e.id === "loop-backdrop")!, { shape: "16:9", ...brand });
    expect(validateMotionSpec(loop, { shape: "16:9", brand })?.loop).toBe(true);
    const bar = exampleSpec(EXAMPLES.find((e) => e.id === "lower-third")!, { shape: "16:9", ...brand });
    expect(validateMotionSpec({ ...bar, loop: true }, { shape: "16:9", brand })?.loop).toBeUndefined();
  });

  it("the brand's colour is the accent wherever it shows, and every category's example exists", () => {
    expect(lookSample("glass", { shape: "9:16", brand: "Nuf Farms", primary: "#3FA34D" }).palette.accent).toBe("#3FA34D");
    expect(lookSample(null, { shape: "9:16", brand: "Nuf Farms", primary: "#3FA34D" }).look).toBeUndefined();
    for (const c of CATEGORIES) if (c.example) expect(EXAMPLES.some((e) => e.id === c.example), c.id).toBe(true);
  });
});
