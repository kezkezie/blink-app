/**
 * Clean up the talking, and cut to a rhythm between words (Kezie, 2026-10-27: the magic cutter "just
 * cuts videos and starts them again randomly... cut pauses, cut awkward stares... remove repetition of
 * words... make the whole video look seamless, not like a sieve").
 *
 * The server transcribes word by word (Whisper, told to keep the ums) and Claude marks false starts,
 * retakes and asides; these pure helpers do the rest, so preview, tests and the server agree:
 * - fillers and stutters are dropped by rule (dropByRule);
 * - what's left becomes the stretches to keep, with long pauses taken out but a breath left in, and
 *   every cut between words, never through one (keepRanges);
 * - an inspiration's rhythm is applied to your clips in your order, cutting at the nearest gap
 *   between words and never starting a clip over (fitToRhythm).
 */
export type Word = { word: string; start: number; end: number };
export type Range = { start: number; end: number };

/** Sounds that are only thinking out loud. "Like", "so" and "you know" carry meaning too often to drop by rule; Claude decides those. */
const FILLER = /^(u+h+m*|u+m+|e+r+m*|e+r+|a+h+|h+m+|m+h*m+|mhm|uh-huh|eh)$/i;
const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "");
export const isFiller = (w: string) => FILLER.test(bare(w));

/**
 * Word indexes to drop without asking anyone: fillers, a word said twice in a row ("I I think"), and
 * a phrase of 2-4 words said twice in a row ("we can, we can do it"): the earlier one goes.
 */
export function dropByRule(words: Word[]): Set<number> {
  const drop = new Set<number>();
  const w = words.map((x) => bare(x.word));
  words.forEach((x, i) => { if (isFiller(x.word)) drop.add(i); });
  for (let n = 4; n >= 1; n--) {
    for (let i = 0; i + 2 * n <= w.length; i++) {
      if (drop.has(i)) continue;
      let same = true;
      for (let k = 0; k < n && same; k++) same = !!w[i + k] && w[i + k] === w[i + n + k];
      // Close together: a stutter or a restart, not a phrase that comes back later on purpose.
      if (same && words[i + n].start - words[i + n - 1].end < 1.2) for (let k = 0; k < n; k++) drop.add(i + k);
    }
  }
  return drop;
}

/** Claude's ranges of word indexes to drop, checked: in range, and never most of what was said. */
export function validateDrops(raw: unknown, count: number, maxShare = 0.6): Set<number> {
  const out = new Set<number>();
  if (!Array.isArray(raw)) return out;
  for (const r of raw.slice(0, 400)) {
    const [a, b] = Array.isArray(r) ? r : [r, r];
    let from = Math.round(Number(a)), to = Math.round(Number(b));
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (from > to) [from, to] = [to, from];
    for (let i = Math.max(0, from); i <= Math.min(count - 1, to); i++) out.add(i);
  }
  return out.size > count * maxShare ? new Set() : out;
}

/**
 * The stretches of the clip to keep (seconds of its audio). Kept words run on while they follow each
 * other with no more than `keepPause` between them; a longer pause, or dropped words, is a cut, with
 * `pad` either side so no word is clipped and a breath stays.
 */
export function keepRanges(words: Word[], drop: Set<number>, duration: number, o: { pad?: number; keepPause?: number; minPiece?: number } = {}): Range[] {
  const pad = o.pad ?? 0.08, keepPause = o.keepPause ?? 0.3, minPiece = o.minPiece ?? 0.2;
  const ranges: Range[] = [];
  let cur: Range | null = null, last = -2;
  words.forEach((w, i) => {
    if (drop.has(i)) return;
    const flows = cur && last === i - 1 && w.start - words[last].end <= keepPause;
    if (cur && flows) cur.end = w.end + pad;
    else { if (cur) ranges.push(cur); cur = { start: w.start - pad, end: w.end + pad }; }
    last = i;
  });
  if (cur) ranges.push(cur);
  // Clamp, and join pieces whose padding meets (a cut that short would only be a flicker).
  const out: Range[] = [];
  for (const r of ranges.map((x) => ({ start: Math.max(0, x.start), end: Math.min(duration, x.end) })).filter((x) => x.end - x.start >= minPiece)) {
    const prev = out[out.length - 1];
    if (prev && r.start - prev.end < 0.05) prev.end = Math.max(prev.end, r.end);
    else out.push({ start: Math.round(r.start * 1000) / 1000, end: Math.round(r.end * 1000) / 1000 });
  }
  return out;
}

/** The gaps between kept words inside a range: where a cut can go without cutting through a word. */
export function cutPoints(words: Word[], drop: Set<number>, r: Range): number[] {
  const kept = words.filter((w, i) => !drop.has(i) && w.start >= r.start - 0.01 && w.end <= r.end + 0.01);
  const pts: number[] = [];
  for (let i = 0; i < kept.length - 1; i++) pts.push(Math.round(((kept[i].end + kept[i + 1].start) / 2) * 1000) / 1000);
  return pts;
}

/** What there is to cut from, in order: a clip's kept stretches (with where cuts may go), or a whole clip with no talking. */
export type Material = { sourceId: string; start: number; end: number; points: number[] | null };
export type Piece = { sourceId: string; trimStart: number; trimEnd: number; timelineStart: number };

/**
 * An inspiration's rhythm (its shot lengths, in seconds) applied to your material.
 * - Talking: your clips in your order; each cut lands on the gap between words nearest to the shot
 *   length (within half to one and a half of it); nothing is skipped or played twice, and the rest
 *   of what's said carries on at the inspiration's average pace.
 * - No talking anywhere: the clips take turns, each carrying on from where it left off (no starting
 *   over), for the inspiration's length or until the footage runs out.
 */
export function fitToRhythm(material: Material[], cuts: number[], o: { minPiece?: number } = {}): Piece[] {
  const minPiece = o.minPiece ?? 0.3;
  const lengths = cuts.filter((c) => c > 0.05);
  if (!material.length || !lengths.length) return [];
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const talking = material.some((m) => m.points);
  const pieces: Piece[] = [];
  let t = 0;
  const put = (m: Material, from: number, to: number) => { pieces.push({ sourceId: m.sourceId, trimStart: Math.round(from * 1000) / 1000, trimEnd: Math.round(to * 1000) / 1000, timelineStart: Math.round(t * 1000) / 1000 }); t += to - from; };

  if (talking) {
    let k = 0;
    for (const m of material) {
      let pos = m.start;
      while (m.end - pos >= minPiece) {
        const want = lengths[k] ?? avg;
        k++;
        let end: number;
        if (m.points) {
          // The end of the stretch first, so a tie goes to it (no sliver left after).
          const options = [...(m.end - pos <= want * 1.5 ? [m.end] : []), ...m.points.filter((p) => p > pos + Math.max(minPiece, want * 0.5) && p <= pos + want * 1.5)];
          end = options.length ? options.reduce((best, p) => (Math.abs(p - (pos + want)) < Math.abs(best - (pos + want)) ? p : best)) : Math.min(m.end, m.points.find((p) => p > pos + want) ?? m.end);
        } else end = Math.min(m.end, pos + want);
        // Not a sliver left over at the end of a stretch: it joins this piece.
        if (m.end - end < minPiece) end = m.end;
        put(m, pos, end);
        pos = end;
      }
    }
    return pieces;
  }

  const at = material.map((m) => m.start);
  let turn = 0;
  for (const want of lengths) {
    let tries = 0;
    while (tries < material.length && material[turn % material.length].end - at[turn % material.length] < minPiece) { turn++; tries++; }
    if (tries >= material.length) break;
    const i = turn % material.length, m = material[i];
    const end = Math.min(m.end, at[i] + want);
    put(m, at[i], end);
    at[i] = end;
    turn++;
  }
  return pieces;
}

type RowClip = { id: string; timelineStart: number; trimStart: number; trimEnd: number; speed?: number };
const rate = (c: { speed?: number }) => (Number.isFinite(c.speed) && (c.speed ?? 0) > 0 ? c.speed! : 1);

/**
 * Cleaned clips on a track: each one's kept stretches (seconds of its file) laid back to back where it
 * was, the clips after it moved up by what was cut, and `map` to move anything else on the timeline
 * (text, sound, overlays) with it: a time inside a cut lands where the talking picks up again.
 */
export function relayout<T extends RowClip>(row: T[], keep: Map<string, Range[]>, newId: () => string): { clips: T[]; map: (t: number) => number } {
  const sorted = [...row].sort((a, b) => a.timelineStart - b.timelineStart);
  const out: T[] = [];
  type Placed = { clip: T; oldEnd: number; pieces: Array<{ src: Range; at: number }>; removed: number };
  const placed: Placed[] = [];
  let removed = 0;
  for (const c of sorted) {
    const span = (c.trimEnd - c.trimStart) / rate(c);
    const start = c.timelineStart - removed;
    const ranges = keep.get(c.id)?.map((r) => ({ start: Math.max(c.trimStart, r.start), end: Math.min(c.trimEnd, r.end) })).filter((r) => r.end - r.start > 0.05);
    if (!ranges) { out.push({ ...c, timelineStart: Math.round(start * 1000) / 1000 }); continue; }
    let at = start;
    const pieces = ranges.map((r) => { const p = { src: r, at }; out.push({ ...c, id: newId(), trimStart: r.start, trimEnd: r.end, timelineStart: Math.round(at * 1000) / 1000 }); at += (r.end - r.start) / rate(c); return p; });
    const cut = span - (at - start);
    placed.push({ clip: c, oldEnd: c.timelineStart + span, pieces, removed: cut });
    removed += cut;
  }
  const map = (t: number) => {
    let before = 0;
    for (const p of placed) {
      if (t >= p.oldEnd) { before += p.removed; continue; }
      if (t < p.clip.timelineStart) break;
      const s = p.clip.trimStart + (t - p.clip.timelineStart) * rate(p.clip);
      const hit = p.pieces.find((x) => s < x.src.end) ?? null;
      if (!hit) return Math.round((p.clip.timelineStart - before + (p.clip.trimEnd - p.clip.trimStart) / rate(p.clip) - p.removed) * 1000) / 1000;
      return Math.round((hit.at + Math.max(0, s - hit.src.start) / rate(p.clip)) * 1000) / 1000;
    }
    return Math.round((t - before) * 1000) / 1000;
  };
  return { clips: out, map };
}
