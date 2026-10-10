import type { AgentMessage } from "./agent";
import type { TimelineSummary } from "@/lib/editor-ops";
import type { CanvasSummary } from "@/lib/canvas-ops";

export type EditorFrame = { clipId: string; t: number; data: string };
export type EditorContext = { timeline: TimelineSummary; frames: EditorFrame[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGES = 20;
const MAX_TEXT = 4000;

const ID = /^[\w-]{1,80}$/;
const FRAME = /^[A-Za-z0-9+/=]+$/;
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const name = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : "");

/** The Video Editor timeline as the panel sends it. Anything malformed is dropped, not trusted. */
export function parseEditorContext(raw: unknown): EditorContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const t = r.timeline as Record<string, unknown> | undefined;
  if (!t || typeof t !== "object") return null;
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max).filter((x) => x && typeof x === "object" && ID.test(String((x as { id?: unknown }).id))) as Record<string, unknown>[] : []);
  const timeline: TimelineSummary = {
    length: num(t.length, 0, 36_000) ?? 0,
    video: list(t.video, 60).map((c) => ({
      id: String(c.id), name: name(c.name), type: c.type === "image" ? "image" : "video",
      start: num(c.start, 0, 36_000) ?? 0, from: num(c.from, 0, 36_000) ?? 0, to: num(c.to, 0, 36_000) ?? 0,
      sourceLength: num(c.sourceLength, 0, 36_000) ?? 0, row: num(c.row, 0, 20) ?? 0,
    })),
    audio: list(t.audio, 20).map((c) => ({ id: String(c.id), name: name(c.name), start: num(c.start, 0, 36_000) ?? 0, from: num(c.from, 0, 36_000) ?? 0, to: num(c.to, 0, 36_000) ?? 0, volume: num(c.volume, 0, 100) ?? 100 })),
    text: list(t.text, 40).map((x) => ({ id: String(x.id), text: name(x.text), start: num(x.start, 0, 36_000) ?? 0, duration: num(x.duration, 0, 3600) ?? 0 })),
    library: list(t.library, 30).map((a) => ({ id: String(a.id), name: name(a.name), type: a.type === "audio" ? "audio" : a.type === "image" ? "image" : "video", duration: num(a.duration, 0, 36_000) ?? undefined })),
  };
  const ids = new Set([...timeline.video, ...timeline.library].map((c) => c.id));
  const frames = (Array.isArray(r.frames) ? r.frames : []).slice(0, 24).flatMap((f) => {
    if (!f || typeof f !== "object") return [];
    const { clipId, t: at, data } = f as Record<string, unknown>;
    if (typeof clipId !== "string" || !ids.has(clipId) || typeof data !== "string" || data.length > 80_000 || !FRAME.test(data)) return [];
    return [{ clipId, t: num(at, 0, 36_000) ?? 0, data }];
  });
  return { timeline, frames };
}

/** The image Editor's layers as the panel sends them (geometry and text only; no pixels). */
export function parseCanvasContext(raw: unknown): CanvasSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.width !== "number" || typeof r.height !== "number" || r.width < 1 || r.height < 1 || !Array.isArray(r.layers)) return null;
  const W = Math.min(10_000, r.width), H = Math.min(10_000, r.height);
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const layers = r.layers.slice(0, 200).flatMap((l) => {
    if (!l || typeof l !== "object") return [];
    const x = l as Record<string, unknown>;
    if (typeof x.id !== "string" || !ID.test(x.id)) return [];
    return [{
      id: x.id, name: str(x.name, 60) ?? "Layer", type: str(x.type, 20) ?? "Layer",
      x: num(x.x, -1e5, 1e5) ?? 0, y: num(x.y, -1e5, 1e5) ?? 0, w: num(x.w, 0, 1e5) ?? 0, h: num(x.h, 0, 1e5) ?? 0,
      angle: num(x.angle, -360, 360) ?? 0, fill: str(x.fill, 30), stroke: str(x.stroke, 30), text: str(x.text, 120),
      opacity: num(x.opacity, 0, 1) ?? 1, visible: x.visible !== false,
    }];
  });
  const brandColors = Array.isArray(r.brandColors) ? r.brandColors.filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6) : [];
  const preview = typeof r.preview === "string" && r.preview.length <= 200_000 && FRAME.test(r.preview) ? r.preview : undefined;
  return { width: W, height: H, background: str(r.background, 30) ?? "#FFFFFF", layers, brandColors, ...(preview ? { preview } : {}) };
}

/** Only plain user/assistant text is accepted from the browser; tool traffic is rebuilt server side. */
export function parseAssistantRequest(body: unknown): { messages: AgentMessage[]; brandId: string | null; page?: string; editor?: EditorContext; canvas?: CanvasSummary } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > MAX_MESSAGES) return null;
  const messages: AgentMessage[] = [];
  for (const m of b.messages) {
    if (!m || typeof m !== "object") return null;
    const { role, text } = m as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") return null;
    const t = text.trim();
    if (!t || t.length > MAX_TEXT) return null;
    messages.push({ role, content: t });
  }
  if (messages[messages.length - 1].role !== "user") return null;
  // The Messages API needs the conversation to start with the user.
  while (messages.length && messages[0].role !== "user") messages.shift();
  const brandId = typeof b.brandId === "string" && UUID.test(b.brandId) ? b.brandId : null;
  const page = typeof b.page === "string" && /^\/studio[\w/-]{0,80}$/.test(b.page) ? b.page : undefined;
  const editor = parseEditorContext(b.editor) ?? undefined;
  const canvas = parseCanvasContext(b.canvas) ?? undefined;
  return { messages, brandId, page, ...(editor ? { editor } : {}), ...(canvas ? { canvas } : {}) };
}
