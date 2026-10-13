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

// ── 2026-10-13: text sized from its pixels, and a clean plate that stays the same picture ──
import { CLEAN_PLATE_PROMPT, CLEAN_PLATE_TOPIC, N8N_LOGO_MENTION, alphaBounds, measureInk, samePicture, spacingToMatch } from "@/lib/editor/layers";

/** An RGBA image of one colour with filled rectangles on it. */
function picture(w: number, h: number, bg: [number, number, number], rects: Array<[number, number, number, number, [number, number, number]]>) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = 255; }
  for (const [x, y, rw, rh, c] of rects) for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) { const i = (yy * w + xx) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; }
  return px;
}
const WHITE: [number, number, number] = [255, 255, 255];
const BLUE: [number, number, number] = [30, 140, 190];

describe("measureInk: where a text's letters really are", () => {
  it("finds a white word on blue even when the AI's box is loose", () => {
    // "Word" 100..300 x 50..90 (two letters with a gap); the AI said 90..320 x 40..100.
    const px = picture(400, 200, BLUE, [[100, 50, 80, 40, WHITE], [200, 50, 100, 40, WHITE]]);
    const ink = measureInk(px, 400, 200, [90 / 400, 40 / 200, 230 / 400, 60 / 200], "#FFFFFF")!;
    expect(ink.map((v, i) => Math.round(v * (i % 2 ? 200 : 400)))).toEqual([100, 50, 200, 40]);
  });

  it("leaves out a neighbouring word of the same colour that falls in the margin", () => {
    // "Container" sits just above "Mushroom"; only Mushroom's own box is measured.
    const px = picture(400, 200, BLUE, [[120, 20, 160, 22, WHITE], [60, 48, 280, 70, WHITE]]);
    const ink = measureInk(px, 400, 200, [55 / 400, 46 / 200, 290 / 400, 74 / 200], "#FFFFFF")!;
    expect(Math.round(ink[1] * 200)).toBe(48);
    expect(Math.round(ink[3] * 200)).toBe(70);
  });

  it("gives up when the text can't be told from its background", () => {
    const px = picture(200, 100, [240, 240, 240], [[50, 30, 100, 30, WHITE]]);
    expect(measureInk(px, 200, 100, [0.2, 0.25, 0.6, 0.4], "#FFFFFF")).toBeNull();
    expect(measureInk(px, 200, 100, [0.2, 0.25, 0.6, 0.4], "not a colour")).toBeNull();
  });
});

describe("matching the new text to the old", () => {
  it("alphaBounds finds what a layer drew", () => {
    const px = new Uint8ClampedArray(10 * 10 * 4);
    for (const [x, y] of [[2, 3], [7, 3], [4, 8]]) px[(y * 10 + x) * 4 + 3] = 255;
    expect(alphaBounds(px, 10, 10)).toEqual([2, 3, 6, 6]);
    expect(alphaBounds(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });

  it("letter spacing makes up a substitute font's width, within limits", () => {
    // 9 letters, 20 px too narrow at 100 px: 2.5 px a gap = 25/1000 em.
    expect(spacingToMatch(0, 480, 500, 9, 100)).toBe(25);
    expect(spacingToMatch(0, 500, 480, 9, 100)).toBe(-25);
    expect(spacingToMatch(0, 100, 900, 3, 20)).toBe(300);
    expect(spacingToMatch(40, 100, 200, 1, 20)).toBe(40);
  });

  it("an edit that came back as a different picture is caught; a clean plate is not", () => {
    const base = Array.from({ length: 1280 }, (_, i) => (i % 32 < 16 ? 60 : 200) + (i % 7));
    const cleaned = base.map((v, i) => (i > 200 && i < 400 ? 60 : v)); // text areas filled in
    const other = base.map((v) => 255 - v);
    expect(samePicture(base, cleaned)).toBe(true);
    expect(samePicture(base, other)).toBe(false);
  });

  it("the clean-plate prompt never asks n8n for the logo", () => {
    expect(N8N_LOGO_MENTION.test(CLEAN_PLATE_PROMPT.toLowerCase())).toBe(false);
    expect(N8N_LOGO_MENTION.test(CLEAN_PLATE_TOPIC.toLowerCase())).toBe(false);
    expect(CLEAN_PLATE_PROMPT).not.toMatch(/keep[^.]*text/i);
  });
});
