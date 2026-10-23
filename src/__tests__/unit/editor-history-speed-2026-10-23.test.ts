import { describe, expect, it } from "vitest";
import { commit, emptyHistory, isRedoKey, isUndoKey, redoStep, undoStep, HISTORY_LIMIT } from "@/lib/editor/history";
import { atempoChain, endOf, setptsFor, sourceAt, span, speedOf, withSpeed } from "@/lib/editor/speed";

const same = (a: unknown, b: unknown) => a === b;
const k = (key: string, o: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });

describe("video editor undo history (2026-10-23)", () => {
  it("commits, undoes and redoes; a new edit clears redo", () => {
    let h = emptyHistory<string>();
    h = commit(h, "a", same); h = commit(h, "b", same); h = commit(h, "c", same);
    expect(h).toEqual({ past: ["a", "b"], present: "c", future: [] });
    h = undoStep(h); expect(h.present).toBe("b");
    h = undoStep(h); expect(h.present).toBe("a");
    h = undoStep(h); expect(h.present).toBe("a"); // nothing before the first
    h = redoStep(h); expect(h.present).toBe("b");
    h = commit(h, "x", same); expect(h).toEqual({ past: ["a", "b"], present: "x", future: [] });
  });
  it("ignores a state equal to the present and keeps at most the limit", () => {
    let h = commit(emptyHistory<number>(), 0, same);
    expect(commit(h, 0, same)).toBe(h);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, i, same);
    expect(h.past.length).toBe(HISTORY_LIMIT);
  });
  it("Cmd+Z / Ctrl+Z undo; Cmd+Shift+Z, Ctrl+Shift+Z and Ctrl+Y redo", () => {
    expect(isUndoKey(k("z", { metaKey: true }))).toBe(true);
    expect(isUndoKey(k("z", { ctrlKey: true }))).toBe(true);
    expect(isUndoKey(k("z"))).toBe(false);
    expect(isUndoKey(k("Z", { metaKey: true, shiftKey: true }))).toBe(false);
    expect(isRedoKey(k("Z", { metaKey: true, shiftKey: true }))).toBe(true);
    expect(isRedoKey(k("z", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isRedoKey(k("y", { ctrlKey: true }))).toBe(true);
    expect(isRedoKey(k("y", { metaKey: true }))).toBe(false);
  });
});

describe("clip speed / slow-mo (2026-10-23)", () => {
  const clip = { id: "a", timelineStart: 2, trimStart: 1, trimEnd: 5, trackRow: 0 };
  it("half speed doubles the clip on the timeline and maps time to the source", () => {
    expect(span(clip)).toBe(4);
    const slow = { ...clip, speed: 0.5 };
    expect(span(slow)).toBe(8);
    expect(endOf(slow)).toBe(10);
    expect(sourceAt(slow, 4)).toBe(2); // 2 s into the clip at half speed = 1 s of source
    expect(speedOf({ speed: 0 })).toBe(1);
    expect(speedOf({ speed: 99 })).toBe(4);
  });
  it("builds ffmpeg filters for the speed", () => {
    expect(setptsFor(1)).toBe("setpts=PTS-STARTPTS");
    expect(setptsFor(0.5)).toBe("setpts=2.0000*(PTS-STARTPTS)");
    expect(atempoChain(1)).toBe("");
    expect(atempoChain(0.25)).toBe("atempo=0.5,atempo=0.5");
    expect(atempoChain(1.5)).toBe("atempo=1.5");
  });
  it("ripples later clips on the same row by the change in length, and only those", () => {
    const clips = [clip, { id: "b", timelineStart: 6, trimStart: 0, trimEnd: 3, trackRow: 0 }, { id: "c", timelineStart: 6, trimStart: 0, trimEnd: 3, trackRow: 1 }];
    const out = withSpeed(clips, "a", 0.5);
    expect(out.find((c) => c.id === "a")).toMatchObject({ speed: 0.5 });
    expect(out.find((c) => c.id === "b")!.timelineStart).toBe(10); // moved by +4
    expect(out.find((c) => c.id === "c")!.timelineStart).toBe(6); // another row: stays
    expect(withSpeed(out, "a", 1).find((c) => c.id === "b")!.timelineStart).toBe(6); // back to normal
  });
});
