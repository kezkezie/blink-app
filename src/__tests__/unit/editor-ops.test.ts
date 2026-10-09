import { describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from } }));

import { applyEditOps, describeEditOps, summarizeTimeline, timelineLength, validateEditOps, type EditorState } from "@/lib/editor-ops";
import { runAssistantTool } from "@/lib/assistant/tools";
import { parseEditorContext } from "@/lib/assistant/request";

const clip = (id: string, start: number, len: number, max = 10, row = 0) => ({
  id, assetId: `a-${id}`, url: `https://res.cloudinary.com/x/video/upload/${id}.mp4`, type: "video" as const, name: `Clip ${id}`,
  timelineStart: start, trimStart: 0, trimEnd: len, maxDuration: max, opacity: 100, volume: 100, trackRow: row,
});
const base = (): EditorState => ({
  videoClips: [clip("a", 0, 5), clip("b", 5, 5), clip("c", 10, 5)],
  audioClips: [],
  textLayers: [],
  assets: [
    { id: "lib-img", type: "image", url: "https://x/i.png", thumb: "", name: "Logo card" },
    { id: "lib-song", type: "audio", url: "https://x/s.mp3", thumb: "", name: "Beat", duration: 60 },
  ],
});
let n = 0;
const ids = () => `new-${++n}`;

describe("smart edit ops", () => {
  it("reorders, trims and lays clips end to end", () => {
    const s = applyEditOps(base(), [
      { op: "sequence", clipIds: ["c", "a"], dropOthers: true },
      { op: "trim", clipId: "c", from: 2, to: 4.5 },
      { op: "trim", clipId: "a", from: 0, to: 3 },
    ], ids);
    expect(s.videoClips.map((c) => [c.id, c.timelineStart, c.trimStart, c.trimEnd])).toEqual([["c", 0, 2, 4.5], ["a", 2.5, 0, 3]]);
    expect(timelineLength(s)).toBe(5.5);
  });

  it("keeps overlay clips in place and unlisted main clips after the listed ones", () => {
    const st = base();
    st.videoClips.push(clip("overlay", 3, 2, 2, 1));
    const s = applyEditOps(st, [{ op: "sequence", clipIds: ["b"] }], ids);
    expect(s.videoClips.find((c) => c.id === "overlay")?.timelineStart).toBe(3);
    expect(s.videoClips.filter((c) => (c.trackRow ?? 0) === 0).sort((x, y) => x.timelineStart - y.timelineStart).map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("clamps trims to the source and never makes a clip shorter than 0.3 s", () => {
    const s = applyEditOps(base(), [{ op: "trim", clipId: "a", from: 9.9, to: 50 }], ids);
    const a = s.videoClips.find((c) => c.id === "a")!;
    expect(a.trimEnd).toBe(10);
    expect(a.trimEnd - a.trimStart).toBeGreaterThanOrEqual(0.3);
  });

  it("adds a library card at the end, captions, and music that stops with the cut", () => {
    const s = applyEditOps(base(), [
      { op: "add_clip", assetId: "lib-img", at: "end" },
      { op: "add_text", text: "Book your wash", start: 15, duration: 3, position: "bottom", size: "large", color: "#FFFFFF" },
      { op: "music", assetId: "lib-song", volume: 60 },
    ], ids);
    expect(s.videoClips.at(-1)?.assetId).toBe("lib-img");
    expect(timelineLength(s)).toBe(18);
    expect(s.textLayers[0]).toMatchObject({ text: "Book your wash", timelineStart: 15, trimEnd: 3, y: 80, fontSize: 56 });
    expect(s.audioClips[0]).toMatchObject({ volume: 60, timelineStart: 0, trimEnd: 18 });
  });

  it("drops ops that point at clips that do not exist or are malformed", () => {
    const t = summarizeTimeline(base());
    const ops = validateEditOps([
      { op: "trim", clipId: "ghost", from: 0, to: 2 },
      { op: "trim", clipId: "a", from: 1, to: 1.1 },
      { op: "remove", clipId: "b" },
      { op: "add_text", text: "", start: 0, duration: 2 },
      { op: "add_text", text: "Hi", start: 0, duration: 2, color: "red" },
      { op: "music", assetId: "lib-img" },
      { op: "explode" },
      "nonsense",
    ], t);
    expect(ops).toEqual([{ op: "remove", clipId: "b" }, { op: "add_text", text: "Hi", start: 0, duration: 2, position: "bottom", size: "medium", color: "#FFFFFF" }]);
    expect(describeEditOps(ops, t)).toEqual(["Remove Clip b", 'Text "Hi" at 0 s for 2 s (bottom)']);
  });
});

describe("edit_timeline tool", () => {
  const timeline = summarizeTimeline(base());
  it("turns a valid edit into an Apply button and changes nothing itself", async () => {
    const r = await runAssistantTool("edit_timeline", { summary: "15 s reel", ops: [{ op: "sequence", clipIds: ["c", "a"] }, { op: "remove", clipId: "ghost" }] }, { clientId: "c1", brandId: "b1", timeline });
    expect(r.action).toMatchObject({ kind: "apply_edit", note: "15 s reel", ops: [{ op: "sequence", clipIds: ["c", "a"], dropOthers: false }] });
    expect(r.action?.changes?.[0]).toBe("Order: Clip c → Clip a");
    expect(from).not.toHaveBeenCalled();
  });
  it("refuses when the editor is not open", async () => {
    const r = await runAssistantTool("edit_timeline", { summary: "x", ops: [] }, { clientId: "c1", brandId: "b1" });
    expect(r.action).toBeUndefined();
    expect(r.content).toMatch(/not open/);
  });
});

describe("editor context from the browser", () => {
  it("keeps a well-formed timeline and only frames of known clips", () => {
    const ctx = parseEditorContext({
      timeline: summarizeTimeline(base()),
      frames: [
        { clipId: "a", t: 1, data: "QUJD" },
        { clipId: "ghost", t: 1, data: "QUJD" },
        { clipId: "b", t: 1, data: "not base64!" },
        { clipId: "c", t: 1, data: "A".repeat(80_001) },
      ],
    });
    expect(ctx?.timeline.video.map((v) => v.id)).toEqual(["a", "b", "c"]);
    expect(ctx?.frames).toEqual([{ clipId: "a", t: 1, data: "QUJD" }]);
  });
  it("ignores junk", () => {
    expect(parseEditorContext("x")).toBeNull();
    expect(parseEditorContext({ timeline: { video: [{ id: "<script>" }] } })?.timeline.video).toEqual([]);
  });
});
