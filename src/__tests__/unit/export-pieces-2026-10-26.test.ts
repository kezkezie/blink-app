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

import { realSpeech } from "@/lib/editor/highlights";

describe("captions only from real speech (2026-10-26)", () => {
  it("drops Whisper's invented lines over music or silence, keeps real words", () => {
    const heard = [
      { start: 30, end: 32, text: "Thanks for watching!", no_speech_prob: 0.86, avg_logprob: -0.94 },
      { start: 0, end: 11.8, text: "in a very natural area like this, it's all the best foods", no_speech_prob: 0.11, avg_logprob: -0.61 },
      { start: 1.5, end: 3.5, text: "Don't cry, baby.", no_speech_prob: 0.7, avg_logprob: -0.78 },
      { start: 4, end: 5, text: "la la", no_speech_prob: 0.9, avg_logprob: -1.4 },
      { start: 6, end: 7, text: "Thank you for watching", no_speech_prob: 0.2, avg_logprob: -0.3 },
    ];
    expect(realSpeech(heard).map((s) => s.text)).toEqual(["in a very natural area like this, it's all the best foods", "Don't cry, baby.", "Thank you for watching"]);
    expect(realSpeech(heard)[0]).toEqual({ start: 0, end: 11.8, text: "in a very natural area like this, it's all the best foods" });
  });
});
