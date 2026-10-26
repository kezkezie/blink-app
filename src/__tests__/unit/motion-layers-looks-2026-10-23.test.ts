import { describe, expect, it } from "vitest";
import { arrival, cleanLayers, duplicateLayer, newLayer, reorderLayer, LAYER_LIMIT } from "@/lib/motion/layers";
import { LOOKS, applyLook, lookById } from "@/lib/motion/looks";
import { contrast, validateMotionSpec, type MotionSpec } from "@/lib/motion/spec";

const PIC = "https://cdn.example.com/p.jpg";
const brand = { primary: "#E4572E", secondary: "#14141A" };

describe("free layers on motion scenes (2026-10-23)", () => {
  it("new layers start centred and sized for what they are", () => {
    const img = newLayer("image", { src: PIC, aspect: 2 });
    expect(img).toMatchObject({ kind: "image", x: 0.5, y: 0.5, fit: "cover" });
    expect(img.w / img.h).toBeCloseTo(2, 1);
    expect(newLayer("text")).toMatchObject({ kind: "text", text: "Your words", enter: "rise" });
    expect(newLayer("shape", { shape: "pill" })).toMatchObject({ kind: "shape", shape: "pill" });
  });
  it("cleanLayers keeps offered pictures only, caps words and clamps numbers", () => {
    const out = cleanLayers([
      { kind: "image", src: PIC, x: 9, y: -9, w: 0, h: 5, rotate: 999, opacity: 2, enter: "zoom" },
      { kind: "image", src: "https://evil.example/x.jpg", x: 0.5, y: 0.5, w: 0.3, h: 0.3 },
      { kind: "text", text: "x".repeat(400), color: "red", weight: 1234 },
      { kind: "text", text: "   " },
      { kind: "shape", shape: "star", fill: "#ABCDEF" },
    ], new Set([PIC]));
    expect(out.map((l) => l.kind)).toEqual(["image", "text", "shape"]);
    expect(out[0]).toMatchObject({ x: 1.5, y: -0.5, w: 0.02, h: 2, rotate: 180, opacity: 1, enter: "fade" });
    expect(out[1]).toMatchObject({ color: "#FFFFFF", weight: 900 });
    expect((out[1] as { text: string }).text.length).toBe(200);
    expect(out[2]).toMatchObject({ shape: "rect", fill: "#ABCDEF" });
    expect(cleanLayers(Array.from({ length: 40 }, () => ({ kind: "shape" })), new Set()).length).toBe(LAYER_LIMIT);
  });
  it("reorders, duplicates and times arrivals", () => {
    const a = newLayer("shape"), b = newLayer("text"), c = newLayer("shape");
    expect(reorderLayer([a, b, c], a.id, 1).map((l) => l.id)).toEqual([b.id, a.id, c.id]);
    expect(reorderLayer([a, b, c], c.id, 5).map((l) => l.id)).toEqual([a.id, b.id, c.id]);
    const d = duplicateLayer({ ...a, locked: true });
    expect(d.id).not.toBe(a.id); expect(d.locked).toBeUndefined(); expect(d.x).toBeCloseTo(a.x + 0.04);
    expect(arrival(0, 30, 0.5)).toBe(0); expect(arrival(30, 30, 0.5)).toBe(1); expect(arrival(24, 30, 0.5)).toBeCloseTo(0.6);
  });
  it("validateMotionSpec carries layers, a look and a font through", () => {
    const raw = { kind: "full", look: "swiss", font: "Archivo", palette: {}, scenes: [{ template: "kinetic-headline", seconds: 3, words: "Hi", enter: "word", layers: [{ kind: "image", src: PIC, x: 0.3, y: 0.3, w: 0.2, h: 0.2 }, { kind: "image", src: "https://nope.example/y.jpg" }] }] };
    const spec = validateMotionSpec(raw, { shape: "9:16", brand, images: [PIC] })!;
    expect(spec.look).toBe("swiss"); expect(spec.font).toBe("Archivo");
    expect(spec.scenes[0].layers).toHaveLength(1);
    expect(validateMotionSpec({ ...raw, look: "<script>", font: "x;y" }, { shape: "9:16", brand, images: [PIC] })).not.toHaveProperty("look");
  });
});

describe("looks adapted from Lemo-Opuscar (2026-10-23)", () => {
  const spec: MotionSpec = { kind: "full", shape: "9:16", palette: { background: "#111111", text: "#FFFFFF", accent: "#E4572E" }, scenes: [{ template: "kinetic-headline", seconds: 3, words: "Hi", enter: "word" }] };
  it("has thirteen looks (twelve from Lemo-Opuscar, plus Launch Film), each with readable ink on its page", () => {
    expect(LOOKS.length).toBe(13);
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(13);
    for (const l of LOOKS) expect(contrast(l.palette.text, l.palette.background), l.id).toBeGreaterThanOrEqual(4.5);
  });
  it("applies a look's page, ink and font, with the brand colour as the accent", () => {
    const out = applyLook(spec, "swiss", brand);
    expect(out).toMatchObject({ look: "swiss", font: "Archivo" });
    expect(out.palette).toMatchObject({ background: "#EAE9E5", text: "#111111", accent: "#E4572E" });
    expect(applyLook(spec, "swiss", brand, false).palette.accent).toBe("#E30613");
  });
  it("falls back to the look's accent when the brand colour would vanish on its page", () => {
    expect(applyLook(spec, "keynote", { primary: "#0D0F14" }).palette.accent).toBe(lookById("keynote")!.palette.accent);
  });
  it("taking the look off returns to brand colours", () => {
    const off = applyLook(applyLook(spec, "deco", brand), null, brand);
    expect(off.look).toBeUndefined(); expect(off.font).toBeUndefined();
  });
});
