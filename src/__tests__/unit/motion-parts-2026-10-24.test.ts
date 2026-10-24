import { describe, expect, it } from "vitest";
import { PART_NAMES, cleanParts, sceneFrames, validateMotionSpec, type MotionScene } from "@/lib/motion/spec";
import { settleFrame } from "@/components/motion/MotionVideo";

const shot = "https://abc.supabase.co/storage/v1/object/public/assets/images/x/screen_1_0.webp";
const ctx = { shape: "16:9" as const, brand: { primary: "#E10600", secondary: "#0B0B0C" }, images: [shot] };

describe("moving what the AI made (2026-10-24)", () => {
  it("keeps only known parts, within reach, and drops moves that do nothing", () => {
    expect(cleanParts({ label: { dx: 0.2, dy: -0.1, scale: 1.4 } }, "screen")).toEqual({ label: { dx: 0.2, dy: -0.1, scale: 1.4 } });
    expect(cleanParts({ nope: { dx: 0.2, dy: 0, scale: 1 } }, "screen")).toBeUndefined();
    expect(cleanParts({ label: { dx: 0, dy: 0, scale: 1 } }, "screen")).toBeUndefined();
    expect(cleanParts({ device: { dx: 9, dy: -9, scale: 50 } }, "screen")).toEqual({ device: { dx: 1, dy: -1, scale: 4 } });
    expect(cleanParts({ device: { dx: "x", dy: 0, scale: 1 } }, "screen")).toBeUndefined();
    expect(cleanParts({ words: { dx: 0.123456, dy: 0, scale: 1 } }, "kinetic-headline")).toEqual({ words: { dx: 0.1235, dy: 0, scale: 1 } });
    expect(cleanParts("nope", "stat")).toBeUndefined();
  });

  it("every template names its parts", () => {
    for (const names of Object.values(PART_NAMES)) expect(Object.keys(names).length).toBeGreaterThan(0);
  });

  it("a checked plan keeps the moves, scene by scene", () => {
    const spec = validateMotionSpec({
      kind: "full", palette: { background: "#0B0B0C", text: "#FFFFFF", accent: "#E10600" },
      scenes: [
        { template: "kinetic-headline", seconds: 3.5, words: "Your KYRA tour in two steps", enter: "word", parts: { words: { dx: 0, dy: 0.05, scale: 1 }, bogus: { dx: 1, dy: 1, scale: 1 } } },
        { template: "screen", seconds: 5, image: shot, aspect: 1.5, box: [0.5, 0.5, 0.2, 0.1], label: "Pick your import", device: "laptop", parts: { device: { dx: -0.1, dy: 0, scale: 1.2 } } },
      ],
    }, ctx)!;
    expect(spec.scenes[0].parts).toEqual({ words: { dx: 0, dy: 0.05, scale: 1 } });
    expect(spec.scenes[1].parts).toEqual({ device: { dx: -0.1, dy: 0, scale: 1.2 } });
  });

  it("edits on the frame where everything has arrived, never while it's leaving", () => {
    const screen = { template: "screen", seconds: 5, image: shot, aspect: 1.5, box: [0.5, 0.5, 0.2, 0.1], label: "x", device: "phone" } as MotionScene;
    // The walkthrough's label arrives at about 2.2 s: the editing frame is after it (it was 1.4 s, before the label).
    expect(settleFrame(screen)).toBeGreaterThanOrEqual(66);
    const headline = { template: "kinetic-headline", seconds: 3.5, words: "Your KYRA tour in two steps", sub: "Here is what each part does", enter: "word" } as MotionScene;
    expect(settleFrame(headline)).toBe(5 * 4 + 14 + 20);
    const short = { template: "screen", seconds: 2, image: shot, aspect: 1, box: [0, 0, 0.5, 0.5], label: "x", device: "none" } as MotionScene;
    expect(settleFrame(short)).toBe(sceneFrames(short) - 10);
  });
});
