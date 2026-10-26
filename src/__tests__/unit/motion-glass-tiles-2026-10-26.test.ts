import { describe, expect, it } from "vitest";
import { ADDABLE_TEMPLATES, MOTION_SYSTEM, PART_NAMES, blankScene, motionTitle, sceneFrames, validateMotionSpec, type MotionScene } from "@/lib/motion/spec";
import { applyLook, lookById } from "@/lib/motion/looks";
import { settleFrame } from "@/components/motion/MotionVideo";

/**
 * The Neon Glass look and feature tiles (Kezie, 2026-10-26: "the Apple style where there's this
 * neon-like color and this glossy glass effect where the glasses are translucent but you can see through").
 */
const brand = { primary: "#C6F432", secondary: "#0C0D0F" };
const ctx = { shape: "9:16" as const, brand };

describe("Neon Glass look", () => {
  it("is glass with neon lights, and keeps the brand colour as the accent", () => {
    const look = lookById("glass")!;
    expect(look).toMatchObject({ glass: true, textures: ["neon"], ours: true });
    expect(look.neon).toHaveLength(3);
    const spec = validateMotionSpec({ scenes: [{ template: "kinetic-headline", seconds: 3, words: "Hi there", enter: "word" }] }, ctx)!;
    const out = applyLook(spec, "glass", brand);
    expect(out).toMatchObject({ look: "glass", font: "Inter Tight" });
    expect(out.palette.accent).toBe("#C6F432");
    expect(out.palette.background).toBe("#05050B");
  });
});

describe("feature tiles", () => {
  it("keeps 2 to 6 tiles with short words, and drops a scene with fewer than two", () => {
    const raw = { scenes: [{ template: "tiles", seconds: 5, title: "Everything your brand needs in one place today", tiles: [
      { title: "Connect your Claude subscription today please", line: "Use BlinkSpot from your own Claude chats, with no key to copy anywhere at all", value: "No key" },
      { title: "Stop any time", value: "Fair refunds for everything" },
      "Upscale to 4K",
      { title: "" },
      { title: "Captions" }, { title: "Voiceover" }, { title: "Shorts" }, { title: "Seventh" },
    ] }] };
    const s = validateMotionSpec(raw, ctx)!.scenes[0] as Extract<MotionScene, { template: "tiles" }>;
    expect(s.title).toBe("Everything your brand needs in one place today");
    expect(s.tiles).toHaveLength(5); // six offered (one empty), cut at six before the empty one went
    expect(s.tiles[0]).toEqual({ title: "Connect your Claude subscription today", line: "Use BlinkSpot from your own Claude chats, with no key to copy", value: "No key" });
    expect(s.tiles[1]).toEqual({ title: "Stop any time" }); // a long "value" isn't one
    expect(s.tiles[2]).toEqual({ title: "Upscale to 4K" });
    expect(validateMotionSpec({ scenes: [{ template: "tiles", tiles: [{ title: "One" }] }] }, ctx)).toBeNull();
  });

  it("can be added, named and moved in the studio, and Claude knows it", () => {
    expect(ADDABLE_TEMPLATES).toContain("tiles");
    expect(PART_NAMES.tiles).toEqual({ title: "Title", tiles: "Tiles" });
    const s = blankScene("tiles", "Nuf Farms");
    expect(s.template === "tiles" && s.tiles.length).toBe(4);
    expect(motionTitle({ kind: "full", shape: "9:16", palette: { background: "#000000", text: "#FFFFFF", accent: "#C6F432" }, scenes: [s] })).toBe("Motion · Why Nuf Farms");
    expect(MOTION_SYSTEM).toContain('"template":"tiles"');
  });

  it("settles once the last tile is in, before the scene leaves", () => {
    const s = blankScene("tiles") as Extract<MotionScene, { template: "tiles" }>;
    const per = Math.max(4, Math.min(9, (sceneFrames(s) * 0.4) / 4));
    expect(settleFrame(s)).toBe(Math.round(10 + 3 * per + 18));
    expect(settleFrame(s)).toBeLessThan(sceneFrames(s) - 8);
  });
});
