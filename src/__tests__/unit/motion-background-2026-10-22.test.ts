import { describe, expect, it } from "vitest";
import { overlayOnPicture, validateMotionSpec } from "@/lib/motion/spec";

const PIC = "https://cdn.example.com/frame.jpg";
const brand = { primary: "#E4572E", secondary: "#14141A" };

describe("motion over a picture (Kezie, 2026-10-22: animate vectors over a real frame)", () => {
  it("overlayOnPicture builds a full clip with the picture as background and readable scenes", () => {
    const spec = overlayOnPicture({ picture: PIC, shape: "9:16", brand, headline: "Drop 01", cta: "Shop the drop", handle: "@kasikicks" });
    expect(spec.kind).toBe("full");
    expect(spec.background).toBe(PIC);
    expect(spec.scenes[0]).toMatchObject({ template: "kinetic-headline", words: "Drop 01" });
    expect(spec.scenes.some((s) => s.template === "end-card")).toBe(true);
    expect(spec.scenes.every((s) => s.template !== "lower-third")).toBe(true);
  });

  it("falls back to a headline when none is given, and skips the end card without a CTA", () => {
    const spec = overlayOnPicture({ picture: PIC, shape: "1:1", brand, headline: "" });
    expect((spec.scenes[0] as { words: string }).words.length).toBeGreaterThan(0);
    expect(spec.scenes.some((s) => s.template === "end-card")).toBe(false);
  });

  it("validateMotionSpec keeps only an offered https background", () => {
    const base = { kind: "full", palette: {}, scenes: [{ template: "kinetic-headline", seconds: 3, words: "Hi", enter: "word" }] };
    const ctx = { shape: "9:16" as const, brand, images: [PIC] };
    expect(validateMotionSpec({ ...base, background: PIC }, ctx)?.background).toBe(PIC);
    expect(validateMotionSpec({ ...base, background: "https://evil.example/x.jpg" }, ctx)?.background).toBeUndefined();
    expect(validateMotionSpec({ ...base, background: "javascript:alert(1)" }, ctx)?.background).toBeUndefined();
    // No image list: nothing was offered, so no background is accepted (the model can't invent one).
    expect(validateMotionSpec({ ...base, background: PIC }, { ...ctx, images: [] })?.background).toBeUndefined();
  });

  it("never puts a background under a see-through lower third (overlay)", () => {
    const spec = validateMotionSpec(
      { kind: "overlay", palette: {}, background: PIC, scenes: [{ template: "lower-third", seconds: 3, title: "Name" }] },
      { shape: "16:9", brand, images: [PIC] },
    );
    expect(spec?.kind).toBe("overlay");
    expect(spec?.background).toBeUndefined();
  });
});
