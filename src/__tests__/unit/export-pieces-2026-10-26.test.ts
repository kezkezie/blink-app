import { describe, expect, it } from "vitest";
import { atempoChain, pieceAudioFilter, pieceSilence } from "@/lib/editor/export-graph";

describe("export piece by piece, with the clips' own sound (2026-10-26)", () => {
  it("keeps the sound in step with the clip's speed (atempo takes 0.5 to 2 per step)", () => {
    expect(atempoChain(1)).toBe("");
    expect(atempoChain(0.5)).toBe("atempo=0.5000");
    expect(atempoChain(0.25)).toBe("atempo=0.5,atempo=0.5000");
    expect(atempoChain(2)).toBe("atempo=2.0000");
    expect(atempoChain(1.5)).toBe("atempo=1.5000");
  });

  it("gives every piece the same sound format, at the clip's volume", () => {
    expect(pieceAudioFilter(1, 100)).toBe("[0:a]volume=1.00,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]");
    expect(pieceAudioFilter(0.5, 40)).toBe("[0:a]atempo=0.5000,volume=0.40,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]");
    expect(pieceAudioFilter(1, 250)).toContain("volume=1.00");
  });

  it("fills a photo or a silent clip with silence of its length", () => {
    expect(pieceSilence(3)).toBe("anullsrc=r=44100:cl=stereo,atrim=duration=3.000[a]");
  });
});
