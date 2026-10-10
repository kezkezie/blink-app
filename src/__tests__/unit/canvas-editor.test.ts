// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from } }));

import { sanitizeSvg } from "@/lib/svg-sanitize";
import { describeCanvasOps, validateCanvasOps, type CanvasSummary } from "@/lib/canvas-ops";
import { runAssistantTool } from "@/lib/assistant/tools";
import { parseCanvasContext } from "@/lib/assistant/request";

const summary: CanvasSummary = {
  width: 1080, height: 1350, background: "#FFFFFF", brandColors: ["#A64A2A"],
  layers: [{ id: "t1", name: "Headline", type: "Text", x: 80, y: 80, w: 900, h: 200, angle: 0, text: "Weekend special", opacity: 1, visible: true }],
};

describe("SVG from the AI or image tracing is cleaned before it becomes layers", () => {
  it("keeps drawing elements and drops scripts, handlers, external links and foreign content", () => {
    const dirty = `Here you go: <svg viewBox="0 0 100 100" onload="alert(1)"><script>alert(2)</script>
      <defs><linearGradient id="g"><stop offset="0" stop-color="#A64A2A"/></linearGradient></defs>
      <g id="mark"><path d="M10 10 L90 10 L50 90 Z" fill="url(#g)" onclick="x()"/><circle cx="50" cy="50" r="10" fill="url(https://evil.example/x)"/></g>
      <image href="https://evil.example/x.png"/><foreignObject><div>hi</div></foreignObject>
      <a href="javascript:alert(3)"><rect width="10" height="10"/></a><text x="5" y="95" font-family="Inter">Brand</text></svg>`;
    const clean = sanitizeSvg(dirty)!;
    expect(clean).toBeTruthy();
    expect(clean).not.toMatch(/script|onload|onclick|evil\.example|foreignObject|<image|<a\b|javascript:/i);
    expect(clean).toMatch(/<path[^>]+d="M10 10/);
    expect(clean).toMatch(/fill="url\(#g\)"/);
    expect(clean).toMatch(/<text[^>]*>Brand<\/text>/);
  });
  it("rejects things that are not SVG or have nothing to draw", () => {
    expect(sanitizeSvg("no svg here")).toBeNull();
    expect(sanitizeSvg("<svg viewBox='0 0 1 1'><script/></svg>")).toBeNull();
    expect(sanitizeSvg("<svg><path d='M0 0'")).toBeNull();
  });
});

describe("canvas operations Ask BlinkSpot can propose", () => {
  it("keeps valid ops, clamps geometry, and drops ops on unknown layers or bad colours", () => {
    const ops = validateCanvasOps([
      { op: "add_shape", shape: "rect", x: 0, y: 1200, w: 1080, h: 150, fill: "#A64A2A", name: "Band" },
      { op: "add_text", text: "Order now", x: 80, y: 1240, size: 64, color: "#FFFFFF", align: "center" },
      { op: "update", id: "t1", size: 120, fill: "#111111" },
      { op: "update", id: "ghost", x: 1 },
      { op: "add_shape", shape: "triangle", x: 0, y: 0, w: 10, h: 10 },
      { op: "add_text", text: "x", x: 0, y: 0, color: "red" },
      { op: "background", color: "#0B0B0C" },
      { op: "add_svg", svg: "<svg viewBox='0 0 10 10'><path d='M0 0h10v10z'/></svg>", x: 400, y: 400, w: 280, name: "Logo mark" },
    ], summary);
    expect(ops.map((o) => o.op)).toEqual(["add_shape", "add_text", "update", "add_text", "background", "add_svg"]);
    expect(ops[3]).toMatchObject({ op: "add_text", color: undefined }); // invalid colour dropped, op kept
    expect(describeCanvasOps(ops, summary)).toEqual(["Add Band", 'Add text "Order now"', "Change Headline", 'Add text "x"', "Background #0B0B0C", "Draw Logo mark"]);
  });

  it("edit_canvas turns them into an Apply button and changes nothing itself", async () => {
    const r = await runAssistantTool("edit_canvas", { summary: "Poster layout", ops: [{ op: "background", color: "#FFFFFF" }] }, { clientId: "c", brandId: "b", canvas: summary });
    expect(r.action).toMatchObject({ kind: "apply_canvas", note: "Poster layout", canvasOps: [{ op: "background", color: "#FFFFFF" }] });
    const none = await runAssistantTool("edit_canvas", { summary: "x", ops: [] }, { clientId: "c", brandId: "b" });
    expect(none.action).toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });

  it("parses the canvas the panel sends and ignores junk", () => {
    const c = parseCanvasContext({ ...summary, layers: [...summary.layers, { id: "<b>" }, "x"], brandColors: ["#A64A2A", "red"] });
    expect(c?.layers.map((l) => l.id)).toEqual(["t1"]);
    expect(c?.brandColors).toEqual(["#A64A2A"]);
    expect(parseCanvasContext({ width: 0, height: 10, layers: [] })).toBeNull();
  });
});
