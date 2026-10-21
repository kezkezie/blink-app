/**
 * Video Inspo (2026-10-12): Claude can't watch a video, so the browser finds the shots (where the
 * picture changes) and sends one still per shot with its timing. This file is the pure part:
 * frame differences in, shots out (unit tested).
 */
export type Shot = { start: number; end: number };

/** Mean absolute difference of two grey thumbnails (0..1). */
export function frameDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n / 255;
}

/** RGBA pixels to grey (one byte per pixel). */
export function toGrey(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) out[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  return out;
}

/** How much a small grey frame varies (brightest minus darkest): near 0 is a blank frame. */
export function frameRange(grey: Uint8ClampedArray): number {
  let lo = 255, hi = 0;
  for (const v of grey) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return hi - lo;
}

/**
 * Cuts from per-sample differences. A cut is a difference well above the video's usual motion
 * (median + k * spread, never below `floor`), at least `minShot` seconds after the last cut.
 * diffs[i] is the change between sample i-1 and sample i, at times[i].
 */
export function detectCuts(diffs: number[], times: number[], opts: { floor?: number; k?: number; minShot?: number } = {}): number[] {
  const { floor = 0.12, k = 4, minShot = 0.6 } = opts;
  const vals = diffs.slice(1).filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
  if (!vals.length) return [];
  const median = vals[Math.floor(vals.length / 2)];
  const mad = vals.map((v) => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(vals.length / 2)] || 0.01;
  const threshold = Math.max(floor, median + k * mad * 1.4826);
  const cuts: number[] = [];
  let last = 0;
  for (let i = 1; i < diffs.length; i++) {
    if (diffs[i] >= threshold && times[i] - last >= minShot) { cuts.push(times[i]); last = times[i]; }
  }
  return cuts;
}

/** Shots between the cuts; very many shots are merged (shortest first) down to `max`. */
export function shotsFrom(cuts: number[], duration: number, max = 16): Shot[] {
  let shots: Shot[] = [];
  let start = 0;
  for (const c of cuts) { if (c > start && c < duration) { shots.push({ start, end: c }); start = c; } }
  if (duration > start) shots.push({ start, end: duration });
  while (shots.length > max) {
    let i = 0;
    for (let j = 1; j < shots.length; j++) if (shots[j].end - shots[j].start < shots[i].end - shots[i].start) i = j;
    // Merge the shortest shot into its shorter neighbour.
    const left = i > 0 ? shots[i - 1] : null;
    const right = i < shots.length - 1 ? shots[i + 1] : null;
    const into = !right || (left && left.end - left.start <= right.end - right.start) ? i - 1 : i + 1;
    const a = Math.min(i, into), b = Math.max(i, into);
    shots = [...shots.slice(0, a), { start: shots[a].start, end: shots[b].end }, ...shots.slice(b + 1)];
  }
  return shots.map((s) => ({ start: Math.round(s.start * 100) / 100, end: Math.round(s.end * 100) / 100 }));
}

/** How often to sample: about 4 a second, fewer for long videos, never more than `maxSamples`. */
export function sampleTimes(duration: number, maxSamples = 240): number[] {
  const step = Math.max(0.25, duration / maxSamples);
  const out: number[] = [];
  for (let t = 0; t < duration - 0.05; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}
