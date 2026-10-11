import { describe, expect, it } from "vitest";
import { beatCut, detectBeats, waveformPeaks } from "@/lib/editor/beats";
import { captionChunks, transcribeCredits, transcriptForModel, validateHighlights, type Segment } from "@/lib/editor/highlights";

/** A click track: a short decaying burst on every beat, over quiet noise. */
function clickTrack(bpm: number, seconds: number, sr = 22050, offset = 0.1) {
  const out = new Float32Array(Math.round(seconds * sr));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < out.length; i++) out[i] = rnd() * 0.01;
  for (let t = offset; t < seconds; t += 60 / bpm) {
    const s = Math.round(t * sr);
    for (let k = 0; k < 900 && s + k < out.length; k++) out[s + k] += rnd() * Math.exp(-k / 150);
  }
  return out;
}

describe("beat detection", () => {
  it.each([100, 120, 128])("finds %i BPM and beats on the clicks", (bpm) => {
    const r = detectBeats(clickTrack(bpm, 12), 22050);
    expect(Math.abs(r.bpm - bpm)).toBeLessThan(2.5);
    const gaps = r.beats.slice(1).map((b, i) => b - r.beats[i]);
    const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    expect(Math.abs(median - 60 / bpm)).toBeLessThan(0.03);
    // The first detected beat sits on the first click (0.1 s), not between clicks.
    const P = 60 / bpm, m = (((r.beats[0] - 0.1) % P) + P) % P;
    expect(Math.min(m, P - m)).toBeLessThan(0.03);
  });
  it("returns nothing for silence-length input and normalised peaks", () => {
    expect(detectBeats(new Float32Array(100), 22050).beats).toEqual([]);
    const p = waveformPeaks(clickTrack(120, 4), 50);
    expect(p).toHaveLength(50);
    expect(Math.max(...p)).toBe(1);
  });
});

describe("cut to the beat", () => {
  const beats = Array.from({ length: 21 }, (_, i) => i * 0.5); // 120 BPM from 0
  it("cuts on every 2nd beat and cycles through the clips", () => {
    const pieces = beatCut([{ id: "a", maxDuration: 10 }, { id: "b", maxDuration: 10 }], beats, { from: 0, to: 6, every: 2 });
    expect(pieces.map((p) => p.timelineStart)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(pieces.map((p) => p.sourceId)).toEqual(["a", "b", "a", "b", "a", "b"]);
    // A clip used again continues where it stopped.
    expect(pieces.filter((p) => p.sourceId === "a").map((p) => p.trimStart)).toEqual([0, 1, 2]);
    for (const p of pieces) expect(p.trimEnd - p.trimStart).toBeCloseTo(1, 3);
  });
  it("one long clip becomes a run of different moments; short clips wrap", () => {
    const one = beatCut([{ id: "long", maxDuration: 60 }], beats, { from: 0, to: 4, every: 4 });
    expect(one.map((p) => [p.timelineStart, p.trimStart])).toEqual([[0, 0], [2, 2]]);
    const short = beatCut([{ id: "s", maxDuration: 1.2 }], beats, { from: 0, to: 3, every: 2 });
    expect(short.every((p) => p.trimEnd <= 1.2)).toBe(true);
  });
});

describe("shorts and captions", () => {
  const segs: Segment[] = [
    { start: 0, end: 4, text: "Welcome back to the kitchen." },
    { start: 4, end: 11, text: "Today we're making the pilau everyone keeps asking about." },
    { start: 11, end: 30, text: "The secret is toasting the spices first until the whole room smells like home." },
    { start: 30, end: 62, text: "Then the rice goes in." },
  ];
  it("keeps only valid, non-overlapping moments, snapped to sentence edges", () => {
    const h = validateHighlights([
      { title: "The secret", start: 11.4, end: 29.2, hook: "Toast the spices first" },
      { title: "overlap", start: 12, end: 20 },
      { title: "too short", start: 0, end: 2 },
      { title: "too long", start: 0, end: 200 },
      { title: "out of range", start: 50, end: 120 },
    ], 62, segs);
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ title: "The secret", start: 11, end: 30 });
    expect(h[1].end).toBeLessThanOrEqual(62);
  });
  it("splits a range of the transcript into short timed captions", () => {
    const c = captionChunks(segs, 11, 30, 32);
    expect(c.every((x) => x.text.length <= 32)).toBe(true);
    expect(c[0].start).toBe(0);
    expect(c[c.length - 1].end).toBeCloseTo(19, 1);
    expect(c.map((x) => x.text).join(" ")).toContain("toasting the spices");
  });
  it("prices transcription at 2 credits per started minute and formats the transcript", () => {
    expect(transcribeCredits(10)).toBe(2);
    expect(transcribeCredits(61)).toBe(4);
    expect(transcribeCredits(30 * 60)).toBe(60);
    expect(transcriptForModel(segs)).toContain("[11.0-30.0] The secret");
  });
});

import { canvasSize, drawtextFilter, frameAt, normalizeFilter } from "@/lib/editor/export-graph";

describe("editor export settings", () => {
  it("sizes the canvas for the shape and fits or fills", () => {
    expect(canvasSize("9:16")).toEqual({ W: 1080, H: 1920 });
    expect(canvasSize("16:9")).toEqual({ W: 1920, H: 1080 });
    expect(normalizeFilter(0, 1920, 1080, "fit")).toBe("[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v0]");
    expect(normalizeFilter(2, 1080, 1920, "fill")).toContain("force_original_aspect_ratio=increase,crop=1080:1920");
  });
  it("centres text where the preview shows it, keeps 1920-wide sizes as before, outlines captions", () => {
    const f = drawtextFilter({ text: "50% off: today", x: 50, y: 80, fontSize: 48, color: "#FFFFFF", timelineStart: 1, trimStart: 0, trimEnd: 2 }, 1920);
    expect(f).toContain("fontsize=96");
    expect(f).toContain("x=(w*50/100)-text_w/2");
    expect(f).toContain("text='50\\% off\\: today'");
    expect(f).toContain("enable='between(t,1,3)'");
    expect(drawtextFilter({ text: "hi", x: 50, y: 80, fontSize: 48, color: "white", timelineStart: 0, trimStart: 0, trimEnd: 1, style: "caption" }, 1080)).toMatch(/borderw=\d+:bordercolor=black/);
  });
  it("builds Cloudinary filmstrip frames and skips other hosts", () => {
    expect(frameAt("https://res.cloudinary.com/x/video/upload/v1/a.mp4", 2.25)).toBe("https://res.cloudinary.com/x/video/upload/so_2.3,h_64,c_fill,q_auto,f_jpg/v1/a.jpg");
    expect(frameAt("https://example.supabase.co/a.mp4", 1)).toBeUndefined();
  });
});
