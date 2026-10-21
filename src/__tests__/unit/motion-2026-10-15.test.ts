import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from: vi.fn() } }));
import {
  MAX_MOTION_SECONDS, MOTION_SYSTEM, contrast, motionTitle, motionUserPrompt, paletteFor, sizeFor, totalFrames, totalSeconds, validateMotionSpec,
} from "@/lib/motion/spec";
import { overlayFilter, overlayStep, webmDecoder } from "@/lib/editor/export-graph";
import { runAssistantTool } from "@/lib/assistant/tools";

/** Motion graphics (2026-10-15): Claude's plan checked, palettes readable, overlays in the export. */
const ctx = { shape: "9:16" as const, brand: { primary: "#6BBD51", secondary: "#231F20" }, images: ["img1", "img2"] };

describe("motion spec", () => {
  it("keeps a good plan and clamps lengths to each template", () => {
    const spec = validateMotionSpec({
      kind: "full",
      scenes: [
        { template: "kinetic-headline", seconds: 12, words: "Pay gas in USDT", enter: "slam" },
        { template: "stat", seconds: 3, value: 12.5, prefix: "$", label: "saved a month on fees" },
        { template: "product-reveal", seconds: 4, image: "img1", name: "Gasless Card", price: "$0" },
        { template: "end-card", seconds: 1, cta: "Try Gasless today", website: "gasless.cash" },
      ],
    }, ctx)!;
    expect(spec.kind).toBe("full");
    expect(spec.scenes.map((s) => s.seconds)).toEqual([6, 3, 4, 3]);
    expect(spec.scenes[0]).toMatchObject({ enter: "slam" });
    expect(spec.scenes[1]).toMatchObject({ value: 12.5, decimals: 2, prefix: "$" });
    expect(spec.scenes[2]).toMatchObject({ image: "img1" });
    expect(spec.scenes[3]).toMatchObject({ logo: true });
    expect(totalSeconds(spec)).toBe(16);
    expect(totalFrames(spec)).toBe(480);
    expect(motionTitle(spec)).toBe("Motion · Pay gas in USDT");
  });

  it("drops unknown templates, empty words, invented pictures and bad numbers", () => {
    const spec = validateMotionSpec({
      scenes: [
        { template: "explosion", seconds: 3 },
        { template: "kinetic-headline", words: "   " },
        { template: "stat", value: "lots", label: "x" },
        { template: "product-reveal", name: "Card", image: "https://evil.example/x.png" },
        { template: "logo-sting" },
      ],
    }, ctx)!;
    expect(spec.scenes.map((s) => s.template)).toEqual(["product-reveal", "logo-sting"]);
    expect(spec.scenes[0]).not.toHaveProperty("image", "https://evil.example/x.png");
    expect(validateMotionSpec({ scenes: [] }, ctx)).toBeNull();
    expect(validateMotionSpec("nope", ctx)).toBeNull();
  });

  it("trims long words and stops at 30 seconds", () => {
    const long = validateMotionSpec({ scenes: Array.from({ length: 8 }, () => ({ template: "kinetic-headline", seconds: 6, words: "one two three four five six seven eight nine ten eleven twelve" })) }, ctx)!;
    expect(long.scenes[0].template === "kinetic-headline" && long.scenes[0].words.split(" ")).toHaveLength(10);
    expect(totalSeconds(long)).toBeLessThanOrEqual(MAX_MOTION_SECONDS);
    expect(long.scenes).toHaveLength(5);
  });

  it("a number is money or a percentage, never both", () => {
    const s = validateMotionSpec({ scenes: [{ template: "stat", value: 200, prefix: "$", suffix: "%", label: "pairs only" }] }, ctx)!;
    expect(s.scenes[0]).toMatchObject({ value: 200, suffix: "%" });
    expect(s.scenes[0]).not.toHaveProperty("prefix", "$");
    expect(MOTION_SYSTEM).toMatch(/a plain count like 200 pairs has neither/);
  });

  it("a lower third is see-through and travels alone", () => {
    const over = validateMotionSpec({ kind: "overlay", scenes: [{ template: "lower-third", title: "Amina Wanjiru", subtitle: "Head chef" }, { template: "end-card", cta: "Book now" }] }, ctx)!;
    expect(over.kind).toBe("overlay");
    expect(over.scenes).toEqual([{ template: "lower-third", seconds: 5.5, title: "Amina Wanjiru", subtitle: "Head chef" }]);
    const full = validateMotionSpec({ kind: "full", scenes: [{ template: "lower-third", title: "X" }, { template: "logo-sting" }] }, ctx)!;
    expect(full.scenes.map((s) => s.template)).toEqual(["logo-sting"]);
  });

  it("keeps text readable on the background", () => {
    const p = paletteFor({ background: "#FFFFFF", text: "#F5F5F5", accent: "#FFFFFF" }, ctx.brand);
    expect(p.background).toBe("#FFFFFF");
    expect(p.text).toBe("#111111");
    expect(p.accent).toBe("#111111");
    const d = paletteFor({}, ctx.brand);
    expect(d).toMatchObject({ background: "#231F20", text: "#FFFFFF", accent: "#6BBD51" });
    // The supporting colour (2026-10-21): a lighter accent when the brand has no third colour.
    expect(d.second).toMatch(/^#[0-9A-F]{6}$/);
    expect(d.second).not.toBe(d.background);
    expect(contrast(d.text, d.background)).toBeGreaterThan(4.5);
    expect(paletteFor({ background: "red" }, { primary: null, secondary: null }).background).toBe("#111111");
  });

  it("sizes and the prompt", () => {
    expect(sizeFor("9:16")).toEqual({ width: 1080, height: 1920 });
    expect(sizeFor("16:9")).toEqual({ width: 1920, height: 1080 });
    expect(MOTION_SYSTEM).toMatch(/never write code/);
    const p = motionUserPrompt({ brandName: "Gasless", prompt: "An intro", shape: "1:1", colours: ["#6BBD51"], hasLogo: true, products: [{ ref: "img1", name: "Card", price: "$0" }], pictures: [], website: "gasless.cash" });
    expect(p).toContain("Products (picture ref: name · price): img1: Card · $0");
    expect(p).toContain("Website: gasless.cash");
    expect(p).toContain("What they want: An intro");
  });
});

describe("export overlays", () => {
  it("fits a layer with a see-through surround and places it in time", () => {
    expect(overlayFilter(3, 1080, 1920, "fit", 2.5)).toBe("[3:v]format=yuva420p,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1,fps=30,setpts=PTS-STARTPTS+2.5/TB[ov3]");
    expect(overlayFilter(1, 1920, 1080, "fill", 0, 50)).toContain("crop=1920:1080,setsar=1,fps=30,colorchannelmixer=aa=0.50,setpts=PTS-STARTPTS+0/TB[ov1]");
    expect(overlayStep("[outv]", 3, 2.5, 8, "lay0")).toBe("[outv][ov3]overlay=0:0:enable='between(t,2.5,8)':eof_action=pass[lay0]");
  });

  it("reads VP8 or VP9 from a WebM so transparency is decoded", () => {
    const webm = (codec: string) => new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...Array.from(`....webm....${codec}....`).map((c) => c.charCodeAt(0))]);
    expect(webmDecoder(webm("V_VP8"))).toBe("libvpx");
    expect(webmDecoder(webm("V_VP9"))).toBe("libvpx-vp9");
    expect(webmDecoder(webm("V_AV1"))).toBeNull();
    expect(webmDecoder(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]))).toBeNull();
  });
});

describe("Ask BlinkSpot make_motion", () => {
  it("opens the Motion graphics page with the brief (2026-10-21), and the editor's Motion only from the editor", async () => {
    const r = await runAssistantTool("make_motion", { brief: "  A 6 second intro:\n Drop 01 this Friday " }, { clientId: "c1", brandId: "b1" });
    const url = new URL(r.action!.href!, "https://x");
    expect(url.pathname).toBe("/studio/motion");
    expect(url.searchParams.get("brief")).toBe("A 6 second intro: Drop 01 this Friday");
    expect(url.searchParams.get("shape")).toBe("9:16");
    const timeline = { clips: [], audio: [], text: [], length: 0 } as unknown as NonNullable<Parameters<typeof runAssistantTool>[2]["timeline"]>;
    const inEditor = new URL((await runAssistantTool("make_motion", { brief: "An end card" }, { clientId: "c1", brandId: "b1", timeline })).action!.href!, "https://x");
    expect(inEditor.pathname).toBe("/studio/video");
    expect(inEditor.searchParams.get("rail")).toBe("motion");
    expect(inEditor.searchParams.get("motion")).toBe("An end card");
    expect((await runAssistantTool("make_motion", { brief: "" }, { clientId: "c1", brandId: "b1" })).action).toBeUndefined();
  });
});

