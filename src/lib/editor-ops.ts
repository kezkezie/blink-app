/**
 * Smart editing for the Video Editor: the edit operations Ask BlinkSpot can propose, and the pure
 * functions that validate and apply them to the editor timeline. No network, no credits: an AI edit
 * is a list of these ops, the user presses Apply, and Undo restores the previous timeline.
 */

export type EditorClip = {
  id: string; assetId: string; url: string; type: "video" | "audio" | "image"; name: string;
  timelineStart: number; trimStart: number; trimEnd: number; maxDuration: number;
  opacity?: number; volume?: number; trackRow?: number;
};
export type EditorText = {
  id: string; text: string; x: number; y: number; fontSize: number; color: string;
  timelineStart: number; trimStart: number; trimEnd: number; maxDuration: number;
  opacity?: number; trackRow?: number;
};
export type EditorAsset = { id: string; type: "video" | "image" | "audio"; url: string; thumb: string; name: string; duration?: number };
export type EditorState = { videoClips: EditorClip[]; audioClips: EditorClip[]; textLayers: EditorText[]; assets: EditorAsset[] };

export type EditOp =
  | { op: "sequence"; clipIds: string[]; dropOthers?: boolean }
  | { op: "trim"; clipId: string; from: number; to: number }
  | { op: "remove"; clipId: string }
  | { op: "add_clip"; assetId: string; at?: "start" | "end"; from?: number; to?: number }
  | { op: "add_text"; text: string; start: number; duration: number; position?: "top" | "center" | "bottom"; size?: "small" | "medium" | "large"; color?: string }
  | { op: "remove_text"; textId: string }
  | { op: "volume"; clipId: string; volume: number }
  | { op: "music"; assetId: string; volume?: number };

const MIN_CLIP = 0.3;
const round = (n: number) => Math.round(n * 100) / 100;
const clipLength = (c: { trimStart: number; trimEnd: number }) => Math.max(0, c.trimEnd - c.trimStart);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 80;
const HEX = /^#[0-9a-f]{6}$/i;

/** Total length of the main video track. */
export function timelineLength(s: Pick<EditorState, "videoClips">) {
  return round(s.videoClips.reduce((end, c) => Math.max(end, c.timelineStart + clipLength(c)), 0));
}

/** A compact, model-readable view of the timeline (ids the model must use, lengths in seconds). */
export function summarizeTimeline(s: EditorState) {
  return {
    length: timelineLength(s),
    video: [...s.videoClips].sort((a, b) => a.timelineStart - b.timelineStart).map((c) => ({
      id: c.id, name: c.name.slice(0, 80), type: c.type, start: round(c.timelineStart), from: round(c.trimStart), to: round(c.trimEnd), sourceLength: round(c.maxDuration), row: c.trackRow ?? 0,
    })),
    audio: s.audioClips.map((c) => ({ id: c.id, name: c.name.slice(0, 80), start: round(c.timelineStart), from: round(c.trimStart), to: round(c.trimEnd), volume: c.volume ?? 100 })),
    text: s.textLayers.map((t) => ({ id: t.id, text: t.text.slice(0, 80), start: round(t.timelineStart), duration: round(clipLength(t)) })),
    library: s.assets.slice(0, 30).map((a) => ({ id: a.id, name: a.name.slice(0, 80), type: a.type, duration: a.duration ? round(a.duration) : undefined })),
  };
}
export type TimelineSummary = ReturnType<typeof summarizeTimeline>;

/**
 * Keep only well-formed ops that point at things that exist. Bad ops are dropped, never guessed at,
 * so a confused model can only make a smaller edit, not a broken timeline.
 */
export function validateEditOps(raw: unknown, t: TimelineSummary): EditOp[] {
  if (!Array.isArray(raw)) return [];
  const video = new Set(t.video.map((c) => c.id));
  const audio = new Set(t.audio.map((c) => c.id));
  const texts = new Set(t.text.map((x) => x.id));
  const lib = new Map(t.library.map((a) => [a.id, a]));
  const out: EditOp[] = [];
  for (const o of raw.slice(0, 40)) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    switch (r.op) {
      case "sequence": {
        const ids = Array.isArray(r.clipIds) ? r.clipIds.filter((id): id is string => isId(id) && video.has(id)) : [];
        if (ids.length) out.push({ op: "sequence", clipIds: [...new Set(ids)], dropOthers: r.dropOthers === true });
        break;
      }
      case "trim":
        if (isId(r.clipId) && video.has(r.clipId) && isNum(r.from) && isNum(r.to) && r.to - r.from >= MIN_CLIP) out.push({ op: "trim", clipId: r.clipId, from: r.from, to: r.to });
        break;
      case "remove":
        if (isId(r.clipId) && (video.has(r.clipId) || audio.has(r.clipId))) out.push({ op: "remove", clipId: r.clipId });
        break;
      case "add_clip": {
        const a = isId(r.assetId) ? lib.get(r.assetId) : undefined;
        if (a && a.type !== "audio") out.push({ op: "add_clip", assetId: a.id, at: r.at === "start" ? "start" : "end", ...(isNum(r.from) ? { from: r.from } : {}), ...(isNum(r.to) ? { to: r.to } : {}) });
        break;
      }
      case "add_text": {
        const text = typeof r.text === "string" ? r.text.trim().slice(0, 90) : "";
        if (text && isNum(r.start) && isNum(r.duration) && r.duration >= 0.5) {
          out.push({
            op: "add_text", text, start: Math.max(0, r.start), duration: Math.min(r.duration, 60),
            position: r.position === "top" || r.position === "center" ? r.position : "bottom",
            size: r.size === "small" || r.size === "large" ? r.size : "medium",
            color: typeof r.color === "string" && HEX.test(r.color) ? r.color : "#FFFFFF",
          });
        }
        break;
      }
      case "remove_text":
        if (isId(r.textId) && texts.has(r.textId)) out.push({ op: "remove_text", textId: r.textId });
        break;
      case "volume":
        if (isId(r.clipId) && (video.has(r.clipId) || audio.has(r.clipId)) && isNum(r.volume)) out.push({ op: "volume", clipId: r.clipId, volume: Math.min(100, Math.max(0, Math.round(r.volume))) });
        break;
      case "music": {
        const a = isId(r.assetId) ? lib.get(r.assetId) : undefined;
        if (a && a.type === "audio") out.push({ op: "music", assetId: a.id, ...(isNum(r.volume) ? { volume: Math.min(100, Math.max(0, Math.round(r.volume))) } : {}) });
        break;
      }
    }
  }
  return out;
}

/** Plain-English list of what an edit will do, shown before the user presses Apply. */
export function describeEditOps(ops: EditOp[], t: TimelineSummary): string[] {
  const name = (id: string) => t.video.find((c) => c.id === id)?.name ?? t.audio.find((c) => c.id === id)?.name ?? t.library.find((a) => a.id === id)?.name ?? "clip";
  return ops.map((o) => {
    switch (o.op) {
      case "sequence": return `Order: ${o.clipIds.map(name).join(" → ")}${o.dropOthers ? " (others removed)" : ""}`;
      case "trim": return `Trim ${name(o.clipId)} to ${round(o.from)}–${round(o.to)} s`;
      case "remove": return `Remove ${name(o.clipId)}`;
      case "add_clip": return `Add ${name(o.assetId)} at the ${o.at ?? "end"}`;
      case "add_text": return `Text "${o.text}" at ${round(o.start)} s for ${round(o.duration)} s (${o.position})`;
      case "remove_text": return `Remove a text layer`;
      case "volume": return `Volume of ${name(o.clipId)} to ${o.volume}%`;
      case "music": return `Music: ${name(o.assetId)} under the whole video`;
    }
  });
}

const POS_Y = { top: 8, center: 44, bottom: 80 } as const;
const SIZE = { small: 28, medium: 40, large: 56 } as const;

/** Lay the main-track clips end to end, in their current order, starting at 0. */
function ripple(clips: EditorClip[]) {
  const main = clips.filter((c) => (c.trackRow ?? 0) === 0).sort((a, b) => a.timelineStart - b.timelineStart);
  let t = 0;
  const placed = new Map<string, number>();
  for (const c of main) { placed.set(c.id, round(t)); t += clipLength(c); }
  return clips.map((c) => (placed.has(c.id) ? { ...c, timelineStart: placed.get(c.id)! } : c));
}

export function applyEditOps(state: EditorState, ops: EditOp[], newId: () => string = () => crypto.randomUUID()): EditorState {
  let { videoClips, audioClips, textLayers } = state;
  let touchedVideo = false;
  for (const o of ops) {
    switch (o.op) {
      case "sequence": {
        const order = new Map(o.clipIds.map((id, i) => [id, i]));
        const kept = videoClips.filter((c) => order.has(c.id) || !o.dropOthers);
        const listed = kept.filter((c) => order.has(c.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
        const rest = kept.filter((c) => !order.has(c.id)).sort((a, b) => a.timelineStart - b.timelineStart);
        // Give main-track clips a start that reflects the new order; ripple below closes the gaps.
        // Overlay clips (other rows) keep their place.
        videoClips = [
          ...listed.map((c, i) => ({ ...c, trackRow: 0, timelineStart: i * 1000 })),
          ...rest.map((c, j) => ((c.trackRow ?? 0) === 0 ? { ...c, timelineStart: (listed.length + j) * 1000 } : c)),
        ];
        touchedVideo = true;
        break;
      }
      case "trim":
        videoClips = videoClips.map((c) => {
          if (c.id !== o.clipId) return c;
          const max = c.maxDuration || o.to;
          const from = Math.max(0, Math.min(o.from, max - MIN_CLIP));
          const to = Math.max(from + MIN_CLIP, Math.min(o.to, max));
          return { ...c, trimStart: round(from), trimEnd: round(to) };
        });
        touchedVideo = true;
        break;
      case "remove":
        if (videoClips.some((c) => c.id === o.clipId)) touchedVideo = true;
        videoClips = videoClips.filter((c) => c.id !== o.clipId);
        audioClips = audioClips.filter((c) => c.id !== o.clipId);
        break;
      case "add_clip": {
        const a = state.assets.find((x) => x.id === o.assetId);
        if (!a) break;
        const len = a.type === "image" ? 3 : a.duration || 5;
        const from = Math.max(0, o.from ?? 0);
        const to = Math.max(from + MIN_CLIP, Math.min(o.to ?? len, a.type === "image" ? 60 : len));
        const clip: EditorClip = {
          id: newId(), assetId: a.id, url: a.url, type: a.type === "image" ? "image" : "video", name: a.name,
          timelineStart: o.at === "start" ? -1 : 100_000, trimStart: round(from), trimEnd: round(to),
          maxDuration: a.type === "image" ? 60 : len, opacity: 100, volume: 100, trackRow: 0,
        };
        videoClips = [...videoClips, clip];
        touchedVideo = true;
        break;
      }
      case "add_text":
        textLayers = [...textLayers, {
          id: newId(), text: o.text, x: 8, y: POS_Y[o.position ?? "bottom"], fontSize: SIZE[o.size ?? "medium"], color: o.color ?? "#FFFFFF",
          timelineStart: round(o.start), trimStart: 0, trimEnd: round(o.duration), maxDuration: 3600, opacity: 100, trackRow: 0,
        }];
        break;
      case "remove_text":
        textLayers = textLayers.filter((t) => t.id !== o.textId);
        break;
      case "volume":
        videoClips = videoClips.map((c) => (c.id === o.clipId ? { ...c, volume: o.volume } : c));
        audioClips = audioClips.map((c) => (c.id === o.clipId ? { ...c, volume: o.volume } : c));
        break;
      case "music": {
        const a = state.assets.find((x) => x.id === o.assetId);
        if (!a) break;
        const len = a.duration || 30;
        audioClips = [...audioClips, {
          id: newId(), assetId: a.id, url: a.url, type: "audio", name: a.name, timelineStart: 0, trimStart: 0,
          trimEnd: len, maxDuration: len, opacity: 100, volume: o.volume ?? 70, trackRow: 0,
        }];
        break;
      }
    }
  }
  if (touchedVideo) videoClips = ripple(videoClips);
  // Music laid under the whole video never runs past the cut.
  const end = timelineLength({ videoClips });
  const musicChanged = ops.some((o) => o.op === "music");
  if (end > 0 && (touchedVideo || musicChanged)) {
    audioClips = audioClips.map((c) => (c.timelineStart === 0 && clipLength(c) > end ? { ...c, trimEnd: round(c.trimStart + end) } : c));
  }
  return { ...state, videoClips, audioClips, textLayers };
}
