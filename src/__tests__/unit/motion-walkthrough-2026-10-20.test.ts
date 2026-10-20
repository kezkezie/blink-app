import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from: vi.fn() } }));
import { MOTION_SYSTEM, motionTitle, motionUserPrompt, placeScreens, validateMotionSpec } from "@/lib/motion/spec";

/** App walkthroughs (2026-10-20): screenshot steps that zoom to a button, a tap and a label. */
const url1 = "https://x.supabase.co/storage/v1/object/public/assets/images/c1/screen_1.webp";
const url2 = "https://x.supabase.co/storage/v1/object/public/assets/images/c1/screen_2.webp";
const screens = [
  { ref: "S1", url: url1, width: 724, height: 1568 },
  { ref: "S2", url: url2, width: 1568, height: 980 },
];
const ctx = { shape: "9:16" as const, brand: { primary: "#6BBD51", secondary: "#231F20" }, images: [url1, url2] };

describe("app walkthrough steps", () => {
  it("turns pixel boxes into fractions of each screenshot and keeps the steps in order", () => {
    const raw = placeScreens({
      kind: "full",
      scenes: [
        { template: "kinetic-headline", seconds: 3, words: "Make a poster in 3 taps" },
        { template: "screen", seconds: 4, image: "S1", box: [72, 1300, 580, 120], label: "Tap Generate to make your poster" },
        { template: "screen", seconds: 4, image: "S2", box: [1176, 49, 314, 98], label: "Post it from here", device: "laptop" },
        { template: "end-card", seconds: 3, cta: "Try BlinkSpot free" },
      ],
    }, screens);
    const spec = validateMotionSpec(raw, ctx)!;
    expect(spec.scenes.map((s) => s.template)).toEqual(["kinetic-headline", "screen", "screen", "end-card"]);
    const [a, b] = spec.scenes.filter((s) => s.template === "screen");
    if (a.template !== "screen" || b.template !== "screen") throw new Error("not screens");
    expect(a.image).toBe(url1);
    expect(a.box[0]).toBeCloseTo(72 / 724); expect(a.box[1]).toBeCloseTo(1300 / 1568);
    expect(a.box[2]).toBeCloseTo(580 / 724); expect(a.box[3]).toBeCloseTo(120 / 1568);
    expect(a.device).toBe("phone"); // tall screenshot
    expect(b.device).toBe("laptop");
    expect(b.aspect).toBeCloseTo(1568 / 980);
  });

  it("drops a step that points at a screenshot we didn't send, or at an outside URL", () => {
    const raw = placeScreens({ scenes: [
      { template: "screen", seconds: 4, image: "S9", box: [0, 0, 10, 10], label: "Tap here" },
      { template: "screen", seconds: 4, image: "https://evil.example/x.png", box: [0, 0, 10, 10], label: "Tap here" },
      { template: "screen", seconds: 4, image: "S1", box: [0, 0, 100, 100], label: "Tap here" },
    ] }, screens);
    const spec = validateMotionSpec(raw, ctx)!;
    expect(spec.scenes).toHaveLength(1);
    expect(spec.scenes[0]).toMatchObject({ image: url1 });
  });

  it("keeps a box inside the screenshot and never vanishingly small", () => {
    const spec = validateMotionSpec(placeScreens({ scenes: [
      { template: "screen", seconds: 20, image: "S1", box: [700, 1560, 400, 1], label: "The menu" },
    ] }, screens), ctx)!;
    const s = spec.scenes[0];
    if (s.template !== "screen") throw new Error("not a screen");
    const [x, y, w, h] = s.box;
    expect(x + w).toBeLessThanOrEqual(1.0000001); expect(y + h).toBeLessThanOrEqual(1.0000001);
    expect(w).toBeGreaterThanOrEqual(0.02); expect(h).toBeGreaterThanOrEqual(0.02);
    expect(s.seconds).toBe(7);
    expect(motionTitle(spec)).toBe("Motion · The menu");
  });

  it("tells Claude about the screenshots and asks for pixel boxes", () => {
    expect(MOTION_SYSTEM).toMatch(/PIXELS of that screenshot/);
    const text = motionUserPrompt({ brandName: "BlinkSpot", prompt: "how to make a poster", shape: "9:16", colours: [], hasLogo: false, products: [], pictures: [], screens: [{ ref: "S1", width: 724, height: 1568 }] });
    expect(text).toContain("S1: 724 x 1568");
  });
});

describe("Ask BlinkSpot makes walkthroughs from attached screenshots", () => {
  it("opens Motion with the screenshots, the steps and the shape", async () => {
    const { runAssistantTool } = await import("@/lib/assistant/tools");
    const pics = ["https://x.supabase.co/storage/v1/object/public/assets/images/c1/ask_1.png", "https://x.supabase.co/storage/v1/object/public/assets/images/c1/ask_2.png"];
    const out = await runAssistantTool("make_motion", { brief: "1. Tap Generate. 2. Click Schedule post.", walkthrough_from_attached_screenshots: true, shape: "16:9" }, { clientId: "c1", brandId: "b1", pictures: pics });
    expect(out.action?.label).toBe("Make this walkthrough");
    const href = new URL(out.action!.href!, "https://www.blinkspot.io");
    expect(href.pathname).toBe("/studio/motion");
    expect(href.searchParams.get("shape")).toBe("16:9");
    expect(href.searchParams.get("brief")).toContain("Schedule post");
    expect(JSON.parse(href.searchParams.get("screens")!)).toEqual(pics);
    const none = await runAssistantTool("make_motion", { brief: "A tutorial", walkthrough_from_attached_screenshots: true }, { clientId: "c1", brandId: "b1", pictures: [] });
    expect(none.action).toBeUndefined();
    expect(none.content).toMatch(/attach/i);
  });
});
