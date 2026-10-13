import { describe, expect, it } from "vitest";
import { validateLayers } from "@/lib/editor/layers";

/** Split into layers (2026-10-13): what Claude reports about a flat design, checked. */
const FREE = ["Inter", "Montserrat", "Playfair Display", "Bebas Neue"];

describe("split into layers", () => {
  it("keeps text with its box, size, colour and fonts; clamps boxes into the image", () => {
    const r = validateLayers({
      texts: [
        { text: "CURATING\\nCOMFORT\\n& STYLE", box: [0.13, 0.22, 0.5, 0.22], sizePct: 7, color: "#f2e8d5", weight: 700, align: "left", spacing: 0.01, font: "Helvetica Neue", freeFont: "inter", category: "sans" },
        { text: "LUPSPACE.COM", box: [0.4, 0.95, 0.9, 0.2], sizePct: 1.6, color: "white", weight: 450, font: "Montserrat", freeFont: "Not A Font", category: "sans" },
        { text: "", box: [0, 0, 1, 1] },
      ],
      logos: [{ box: [0.13, 0.06, 0.22, 0.09], label: "Lup Space logo" }, { box: "nope" }],
      background: "dark blue wall",
    }, FREE)!;
    expect(r.texts).toHaveLength(2);
    expect(r.texts[0]).toMatchObject({ text: "CURATING\nCOMFORT\n& STYLE", color: "#F2E8D5", weight: 700, font: "Helvetica Neue", freeFont: "Inter" });
    expect(r.texts[1].box[2]).toBeCloseTo(0.6, 5); // can't run past the right edge
    expect(r.texts[1].box[3]).toBeCloseTo(0.05, 5);
    expect(r.texts[1]).toMatchObject({ color: "#111111", weight: 500, freeFont: "Montserrat", align: "left" });
    expect(r.logos).toEqual([{ box: [0.13, 0.06, 0.22, 0.09], label: "Lup Space logo" }]);
  });
  it("an unknown free font falls back by category; nothing found is null", () => {
    const r = validateLayers({ texts: [{ text: "Hi", box: [0.1, 0.1, 0.2, 0.1], font: "Some Script", freeFont: "", category: "serif" }] }, FREE)!;
    expect(r.texts[0].freeFont).toBe("Playfair Display");
    expect(validateLayers({ texts: [], logos: [] }, FREE)).toBeNull();
    expect(validateLayers("x", FREE)).toBeNull();
  });
});
