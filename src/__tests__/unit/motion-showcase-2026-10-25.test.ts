import { describe, expect, it } from "vitest";
import { blankScene, motionTitle, placeScreens, sceneFrames, validateMotionSpec, type MotionScene, type MotionSpec } from "@/lib/motion/spec";
import { settleFrame } from "@/components/motion/MotionVideo";

const shot = "https://abc.supabase.co/storage/v1/object/public/assets/images/x/screen_1_0.webp";
const ctx = { shape: "9:16" as const, brand: { primary: "#C6F432", secondary: "#0C0D0F" }, images: ["P1", "P2", shot] };
const palette = { background: "#0C0D0F", text: "#FFFFFF", accent: "#C6F432" };
const plan = (scenes: unknown[]) => validateMotionSpec({ kind: "full", palette, scenes }, ctx);

describe("showcase and the highlighter (2026-10-25)", () => {
  it("a highlight is kept only when it's words from the headline", () => {
    const kept = plan([{ template: "kinetic-headline", seconds: 3, words: "Your first post in one sentence", enter: "word", mark: "one sentence." }])!;
    expect(kept.scenes[0]).toMatchObject({ mark: "one sentence" });
    const stray = plan([{ template: "kinetic-headline", seconds: 3, words: "Your first post in one sentence", enter: "word", mark: "free forever" }])!;
    expect((stray.scenes[0] as { mark?: string }).mark).toBeUndefined();
    // Part of a word isn't a highlight ("post" is not in "posting").
    const partial = plan([{ template: "kinetic-headline", seconds: 3, words: "Keep posting daily", enter: "word", mark: "post" }])!;
    expect((partial.scenes[0] as { mark?: string }).mark).toBeUndefined();
  });

  it("a showcase only floats pictures it was offered, up to five, no repeats", () => {
    const spec = plan([{ template: "showcase", seconds: 5, images: ["P1", "P1", "https://evil.example/x.png", shot, "P2"], title: "Made with BlinkSpot", label: "BLINKSPOT" }])!;
    expect(spec.scenes[0]).toMatchObject({ template: "showcase", images: ["P1", shot, "P2"], title: "Made with BlinkSpot", label: "BLINKSPOT" });
    // Nothing usable to float: the scene is dropped, not left empty.
    expect(plan([{ template: "showcase", seconds: 5, images: ["https://evil.example/x.png"] }])).toBeNull();
  });

  it("screenshot refs in a showcase become our own URLs", () => {
    const raw = placeScreens({ scenes: [{ template: "showcase", images: ["S1", "P1"] }] }, [{ ref: "S1", url: shot, width: 2880, height: 1800 }]) as { scenes: Array<{ images: string[] }> };
    expect(raw.scenes[0].images).toEqual([shot, "P1"]);
  });

  it("edits a showcase after the last picture has landed", () => {
    const s = { template: "showcase", seconds: 5, images: [shot, shot, shot] } as MotionScene;
    expect(settleFrame(s)).toBe(26 + 2 * 5 + 16);
    expect(settleFrame(s)).toBeLessThan(sceneFrames(s));
  });

  it("a new showcase starts from the pictures you have, and is named by its title", () => {
    const s = blankScene("showcase", "BlinkSpot", ["a", "b", "c", "d", "e", "f"]);
    expect(s).toMatchObject({ template: "showcase", images: ["a", "b", "c", "d"], title: "BlinkSpot" });
    expect(motionTitle({ kind: "full", palette, scenes: [s] } as MotionSpec)).toBe("Motion · BlinkSpot");
  });
});
