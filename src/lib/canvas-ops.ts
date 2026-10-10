/**
 * The edits Ask BlinkSpot can propose for the image Editor (shapes, text, vector drawings, moving,
 * restyling, deleting, layer order, background). Pure validation and wording live here; the editor
 * applies them to the canvas when the user presses Apply, and Undo restores the previous state.
 */

export type CanvasLayer = {
  id: string; name: string; type: string;
  x: number; y: number; w: number; h: number; angle: number;
  fill?: string; stroke?: string; text?: string; opacity: number; visible: boolean;
};
export type CanvasSummary = {
  width: number; height: number; background: string; layers: CanvasLayer[]; brandColors: string[];
  /** A small JPEG of the canvas (base64, no prefix) so the AI can see the picture, not just the layer boxes. */
  preview?: string;
};

export type CanvasOp =
  | { op: "add_shape"; shape: "rect" | "ellipse" | "line" | "star" | "polygon"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; strokeWidth?: number; radius?: number; name?: string }
  | { op: "add_text"; text: string; x: number; y: number; w?: number; size?: number; color?: string; weight?: number; font?: string; align?: "left" | "center" | "right"; name?: string }
  | { op: "add_svg"; svg: string; x: number; y: number; w: number; name?: string }
  | { op: "update"; id: string; x?: number; y?: number; w?: number; h?: number; angle?: number; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number; text?: string; size?: number }
  | { op: "remove"; id: string }
  | { op: "arrange"; id: string; to: "front" | "back" | "forward" | "backward" }
  | { op: "background"; color: string };

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const color = (v: unknown) => (typeof v === "string" && (HEX.test(v) || v === "transparent") ? v : undefined);
const name = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : undefined);

/** Keep only well-formed ops on layers that exist; clamp geometry to the artboard (with margin). */
export function validateCanvasOps(raw: unknown, s: CanvasSummary): CanvasOp[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set(s.layers.map((l) => l.id));
  const W = s.width, H = s.height;
  const out: CanvasOp[] = [];
  for (const o of raw.slice(0, 60)) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    const x = num(r.x, -W, W * 2), y = num(r.y, -H, H * 2);
    switch (r.op) {
      case "add_shape": {
        const shape = (["rect", "ellipse", "line", "star", "polygon"] as const).find((k) => k === r.shape);
        const w = num(r.w, 1, W * 3), h = num(r.h, 1, H * 3);
        if (shape && x !== null && y !== null && w !== null && h !== null) {
          out.push({ op: "add_shape", shape, x, y, w, h, fill: color(r.fill), stroke: color(r.stroke), strokeWidth: num(r.strokeWidth, 0, 200) ?? undefined, radius: num(r.radius, 0, 2000) ?? undefined, name: name(r.name) });
        }
        break;
      }
      case "add_text": {
        const text = typeof r.text === "string" ? r.text.slice(0, 400) : "";
        if (text.trim() && x !== null && y !== null) {
          out.push({
            op: "add_text", text, x, y, w: num(r.w, 20, W * 2) ?? undefined, size: num(r.size, 6, 600) ?? undefined, color: color(r.color),
            weight: num(r.weight, 100, 900) ?? undefined, font: typeof r.font === "string" ? r.font.slice(0, 60) : undefined,
            align: r.align === "center" || r.align === "right" ? r.align : r.align === "left" ? "left" : undefined, name: name(r.name),
          });
        }
        break;
      }
      case "add_svg": {
        const w = num(r.w, 8, W * 2);
        if (typeof r.svg === "string" && r.svg.includes("<svg") && r.svg.length <= 200_000 && x !== null && y !== null && w !== null) out.push({ op: "add_svg", svg: r.svg, x, y, w, name: name(r.name) });
        break;
      }
      case "update":
        if (typeof r.id === "string" && ids.has(r.id)) {
          const u: CanvasOp = { op: "update", id: r.id };
          const set = <K extends keyof typeof u>(k: K, v: (typeof u)[K] | null | undefined) => { if (v !== null && v !== undefined) (u as Record<string, unknown>)[k as string] = v; };
          set("x", x); set("y", y); set("w", num(r.w, 1, W * 3)); set("h", num(r.h, 1, H * 3)); set("angle", num(r.angle, -360, 360));
          set("fill", color(r.fill)); set("stroke", color(r.stroke)); set("strokeWidth", num(r.strokeWidth, 0, 200)); set("opacity", num(r.opacity, 0, 1));
          set("size", num(r.size, 6, 600)); if (typeof r.text === "string" && r.text.trim()) set("text", r.text.slice(0, 400));
          if (Object.keys(u).length > 2) out.push(u);
        }
        break;
      case "remove":
        if (typeof r.id === "string" && ids.has(r.id)) out.push({ op: "remove", id: r.id });
        break;
      case "arrange": {
        const to = (["front", "back", "forward", "backward"] as const).find((k) => k === r.to);
        if (typeof r.id === "string" && ids.has(r.id) && to) out.push({ op: "arrange", id: r.id, to });
        break;
      }
      case "background": {
        const c = color(r.color);
        if (c) out.push({ op: "background", color: c });
        break;
      }
    }
  }
  return out;
}

export function describeCanvasOps(ops: CanvasOp[], s: CanvasSummary): string[] {
  const nameOf = (id: string) => s.layers.find((l) => l.id === id)?.name ?? "a layer";
  return ops.map((o) => {
    switch (o.op) {
      case "add_shape": return `Add ${o.name ?? `a ${o.shape}`}`;
      case "add_text": return `Add text "${o.text.slice(0, 40)}"`;
      case "add_svg": return `Draw ${o.name ?? "a vector"}`;
      case "update": return `Change ${nameOf(o.id)}`;
      case "remove": return `Delete ${nameOf(o.id)}`;
      case "arrange": return `Move ${nameOf(o.id)} to the ${o.to}`;
      case "background": return `Background ${o.color}`;
    }
  });
}
