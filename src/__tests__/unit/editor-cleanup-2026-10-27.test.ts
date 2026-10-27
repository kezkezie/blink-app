import { describe, expect, it } from "vitest";
import { cutPoints, dropByRule, fitToRhythm, isFiller, keepRanges, relayout, validateDrops, type Word } from "@/lib/editor/cleanup";

/**
 * Clean up the talking and cut between words (Kezie, 2026-10-27: the magic cutter cut "randomly",
 * kept the hmms, pauses and repeats, and started clips again).
 */
// "So um I I think, hmm... we can, we can grow maize here." with a 1.6 s stare before "we".
const said: Word[] = [
  ["So", 0.0, 0.25], ["um", 0.4, 0.7], ["I", 0.8, 0.9], ["I", 0.95, 1.05], ["think,", 1.1, 1.4], ["hmm...", 1.6, 2.0],
  ["we", 3.6, 3.75], ["can,", 3.8, 4.0], ["we", 4.2, 4.35], ["can", 4.4, 4.6], ["grow", 4.65, 4.9], ["maize", 4.95, 5.3], ["here.", 5.35, 5.7],
].map(([word, start, end]) => ({ word: word as string, start: start as number, end: end as number }));

describe("clean up the talking", () => {
  it("knows ums and hmms, and not real words", () => {
    for (const w of ["um", "Umm,", "uh", "uhh...", "erm", "hmm", "Hmmmm", "ah", "mm"]) expect(isFiller(w), w).toBe(true);
    for (const w of ["I", "maize", "am", "here", "so", "like", "huh?"]) expect(isFiller(w), w).toBe(false);
  });

  it("drops fillers, a word said twice, and a restarted phrase (the first go)", () => {
    const drop = dropByRule(said);
    const kept = said.filter((_, i) => !drop.has(i)).map((w) => w.word);
    expect(kept).toEqual(["So", "I", "think,", "we", "can", "grow", "maize", "here."]);
  });

  it("checks Claude's drops: in range, and never most of the talk", () => {
    expect([...validateDrops([[2, 4], 9, [99, 120]], 13)].sort((a, b) => a - b)).toEqual([2, 3, 4, 9]);
    expect(validateDrops([[0, 11]], 13).size).toBe(0); // 12 of 13 words: refused
    expect(validateDrops("nonsense", 13).size).toBe(0);
  });

  it("keeps the words, takes out the stare and the ums, never cuts through a word", () => {
    const drop = dropByRule(said);
    const r = keepRanges(said, drop, 6);
    // "So" | "I think," | "we can grow maize here." (the 1.6 s stare and the hmm are gone)
    expect(r).toEqual([{ start: 0, end: 0.33 }, { start: 0.87, end: 1.48 }, { start: 4.12, end: 5.78 }]);
    const total = r.reduce((s, x) => s + x.end - x.start, 0);
    expect(total).toBeLessThan(2.7); // of 5.7 s
    for (const w of said.filter((_, i) => !drop.has(i))) expect(r.some((x) => w.start >= x.start && w.end <= x.end), w.word).toBe(true);
    // Cuts can go between kept words only.
    expect(cutPoints(said, drop, r[2])).toEqual([4.375, 4.625, 4.925, 5.325]);
  });
});

describe("cut to an inspiration's rhythm", () => {
  it("talking: in order, each cut on the gap between words nearest the shot length, nothing twice", () => {
    const material = [{ sourceId: "a", start: 0, end: 10, points: [1.1, 2.3, 3.2, 4.9, 6.0, 7.4, 8.8] }];
    const pieces = fitToRhythm(material, [2, 2, 2]);
    expect(pieces.map((p) => [p.trimStart, p.trimEnd])).toEqual([[0, 2.3], [2.3, 4.9], [4.9, 7.4], [7.4, 10]]);
    // Back to back on the timeline, and the whole talk is there (it carries on at the average pace).
    expect(pieces.map((p) => p.timelineStart)).toEqual([0, 2.3, 4.9, 7.4]);
    expect(pieces.reduce((s, p) => s + p.trimEnd - p.trimStart, 0)).toBeCloseTo(10, 6);
  });

  it("no talking: clips take turns and carry on, never starting over", () => {
    const material = [{ sourceId: "a", start: 0, end: 3, points: null }, { sourceId: "b", start: 5, end: 7, points: null }];
    const pieces = fitToRhythm(material, [1, 1, 1, 1, 1, 1, 1]);
    expect(pieces.map((p) => `${p.sourceId}:${p.trimStart}-${p.trimEnd}`)).toEqual(["a:0-1", "b:5-6", "a:1-2", "b:6-7", "a:2-3"]);
  });
});

describe("cleaned clips on the timeline", () => {
  it("lays the kept stretches back to back, moves what follows up, and moves text with it", () => {
    // A 10 s talking clip (file seconds 2-12) then a 5 s photo; keep file 2-4 and 7-12 (3 s cut).
    const row = [{ id: "talk", timelineStart: 0, trimStart: 2, trimEnd: 12 }, { id: "photo", timelineStart: 10, trimStart: 0, trimEnd: 5 }];
    let n = 0;
    const { clips, map } = relayout(row, new Map([["talk", [{ start: 2, end: 4 }, { start: 7, end: 12 }]]]), () => `p${++n}`);
    expect(clips.map((c) => [c.id, c.timelineStart, c.trimStart, c.trimEnd])).toEqual([["p1", 0, 2, 4], ["p2", 2, 7, 12], ["photo", 7, 0, 5]]);
    expect(map(1)).toBe(1); // in the first kept stretch
    expect(map(3)).toBe(2); // inside the cut: where the talking picks up again
    expect(map(6)).toBe(3); // file second 8: one second into the second stretch
    expect(map(11)).toBe(8); // on the photo, moved up by the 3 s cut
  });

  it("knows slow motion: a clip at half speed lasts twice as long", () => {
    const { clips, map } = relayout([{ id: "s", timelineStart: 0, trimStart: 0, trimEnd: 4, speed: 0.5 }, { id: "x", timelineStart: 8, trimStart: 0, trimEnd: 2 }], new Map([["s", [{ start: 0, end: 1 }, { start: 3, end: 4 }]]]), () => "n");
    expect(clips.map((c) => c.timelineStart)).toEqual([0, 2, 4]);
    expect(map(9)).toBe(5);
  });
});

