/**
 * Shorts from a long video, and captions (Kezie, 2026-10-11: "give it a long form of video and it will
 * shorten it for you and create all the best parts"). The server transcribes the audio with
 * timestamps; Claude picks the moments; these pure helpers keep its answer honest and turn the
 * transcript into on-screen captions.
 */
export type Segment = { start: number; end: number; text: string };
export type Highlight = { title: string; start: number; end: number; hook: string; caption: string };
export type CaptionChunk = { start: number; end: number; text: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Keep only moments inside the video, 5 to 90 s long, not overlapping, snapped to segment edges. */
export function validateHighlights(raw: unknown, duration: number, segments: Segment[]): Highlight[] {
  if (!Array.isArray(raw)) return [];
  const snapStart = (t: number) => { const s = segments.filter((x) => x.start <= t + 0.6).pop(); return s && t - s.start < 3 ? s.start : t; };
  const snapEnd = (t: number) => { const s = segments.find((x) => x.end >= t - 0.6); return s && s.end - t < 3 ? s.end : t; };
  const out: Highlight[] = [];
  for (const r of raw.slice(0, 6)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    let start = Number(o.start), end = Number(o.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    start = Math.max(0, snapStart(start));
    end = Math.min(duration, snapEnd(end));
    if (end - start < 5 || end - start > 90) continue;
    if (out.some((h) => start < h.end && end > h.start)) continue;
    out.push({ title: str(o.title, 60) || "Highlight", start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100, hook: str(o.hook, 160), caption: str(o.caption, 300) });
  }
  return out.sort((a, b) => a.start - b.start).slice(0, 3);
}

/**
 * On-screen captions for the part of the transcript between `from` and `to`, in short chunks
 * (≤ maxChars) timed proportionally to their words, relative to `from`.
 */
export function captionChunks(segments: Segment[], from: number, to: number, maxChars = 32): CaptionChunk[] {
  const out: CaptionChunk[] = [];
  for (const s of segments) {
    if (s.end <= from || s.start >= to) continue;
    const start = Math.max(s.start, from), end = Math.min(s.end, to);
    const words = s.text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (!words.length || end - start < 0.2) continue;
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
    }
    if (cur) lines.push(cur);
    const total = lines.reduce((n, l) => n + l.length, 0);
    let t = start;
    for (const l of lines) {
      const len = ((end - start) * l.length) / total;
      out.push({ start: Math.round((t - from) * 100) / 100, end: Math.round((t + len - from) * 100) / 100, text: l });
      t += len;
    }
  }
  return out;
}

/** The transcript as compact lines for the model: "[12.4-17.9] words". */
export function transcriptForModel(segments: Segment[], maxChars = 24000): string {
  let out = "";
  for (const s of segments) {
    const line = `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text.trim()}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out;
}

/** Credits for transcribing: 2 per started minute (Whisper is $0.006/min; 1 credit = $0.005), at least 2. */
export function transcribeCredits(seconds: number): number {
  return Math.max(2, Math.ceil(Math.max(0, seconds) / 60) * 2);
}
