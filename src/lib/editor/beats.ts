/**
 * Cut to the beat (Kezie, 2026-10-11: "edited videos where it follows the beats"). Pure and local:
 * the browser decodes the music, this finds the tempo and the beat times, and beatCut() lays the
 * video clips so every cut lands on a beat. Free, nothing leaves the device.
 *
 * Method: an onset envelope (rise in short-time energy), tempo from its autocorrelation (70-180 BPM,
 * gently favouring 90-140 where most social music sits), then the beat phase that lines up with the
 * strongest onsets, and each beat nudged to its local peak.
 */
export type BeatResult = { bpm: number; beats: number[]; duration: number };

const HOP = 512;
const FRAME = 1024;

export function onsetEnvelope(samples: Float32Array, sampleRate: number): { env: Float32Array; hopSeconds: number } {
  const frames = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    const o = f * HOP;
    for (let i = 0; i < FRAME; i++) { const v = samples[o + i]; s += v * v; }
    energy[f] = Math.sqrt(s / FRAME);
  }
  // Positive change of log energy against a short running mean: peaks at drum hits and note starts.
  const env = new Float32Array(frames);
  const W = 8;
  let max = 0;
  for (let f = 0; f < frames; f++) {
    let mean = 0, n = 0;
    for (let k = Math.max(0, f - W); k < f; k++) { mean += energy[k]; n++; }
    mean = n ? mean / n : 0;
    const d = Math.log1p(energy[f] * 100) - Math.log1p(mean * 100);
    env[f] = d > 0 ? d : 0;
    if (env[f] > max) max = env[f];
  }
  if (max > 0) for (let f = 0; f < frames; f++) env[f] /= max;
  return { env, hopSeconds: HOP / sampleRate };
}

export function detectBeats(samples: Float32Array, sampleRate: number): BeatResult {
  const duration = samples.length / sampleRate;
  const { env, hopSeconds } = onsetEnvelope(samples, sampleRate);
  if (env.length < 16) return { bpm: 0, beats: [], duration };

  // Tempo: autocorrelation over lags for 70-180 BPM.
  const lagFor = (bpm: number) => 60 / bpm / hopSeconds;
  const minLag = Math.floor(lagFor(180)), maxLag = Math.ceil(lagFor(70));
  let bestLag = 0, bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag];
    s /= env.length - lag;
    const bpm = 60 / (lag * hopSeconds);
    const prefer = bpm >= 90 && bpm <= 140 ? 1.08 : 1; // a gentle nudge away from half/double tempo
    if (s * prefer > bestScore) { bestScore = s * prefer; bestLag = lag; }
  }
  // Sub-frame tempo from the neighbours of the best lag.
  const ac = (lag: number) => { let s = 0; for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag]; return s / (env.length - lag); };
  const a = ac(bestLag - 1), b = ac(bestLag), c = ac(bestLag + 1);
  const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
  const period = bestLag + Math.max(-0.5, Math.min(0.5, shift));
  const bpm = Math.round((60 / (period * hopSeconds)) * 10) / 10;

  // Phase: the offset whose beat grid collects the most onset energy.
  let bestPhase = 0, bestSum = -Infinity;
  for (let ph = 0; ph < period; ph++) {
    let s = 0;
    for (let t = ph; t < env.length; t += period) s += env[Math.round(t)] ?? 0;
    if (s > bestSum) { bestSum = s; bestPhase = ph; }
  }
  // Beat grid, each beat snapped to the strongest onset within an eighth of a beat.
  const win = Math.max(1, Math.round(period / 8));
  const beats: number[] = [];
  for (let t = bestPhase; t < env.length; t += period) {
    const centre = Math.round(t);
    let peak = centre, pv = -1;
    for (let k = Math.max(0, centre - win); k <= Math.min(env.length - 1, centre + win); k++) if (env[k] > pv) { pv = env[k]; peak = k; }
    // Frame index -> the middle of that frame (the onset is inside it, not at its first sample).
    const sec = (pv > 0.05 ? peak : t) * hopSeconds + FRAME / 2 / sampleRate;
    if (!beats.length || sec - beats[beats.length - 1] > (period * hopSeconds) / 2) beats.push(Math.round(sec * 1000) / 1000);
  }
  return { bpm, beats, duration };
}

/** Loudness peaks for drawing a waveform: `count` values between 0 and 1. */
export function waveformPeaks(samples: Float32Array, count = 400): number[] {
  const size = Math.max(1, Math.floor(samples.length / count));
  const out: number[] = [];
  let max = 0;
  for (let i = 0; i < count; i++) {
    let m = 0;
    for (let j = i * size; j < Math.min(samples.length, (i + 1) * size); j += 4) { const v = Math.abs(samples[j]); if (v > m) m = v; }
    out.push(m);
    if (m > max) max = m;
  }
  return max > 0 ? out.map((v) => Math.round((v / max) * 1000) / 1000) : out;
}

export type CutSource = { id: string; maxDuration: number; trimStart?: number };
export type CutPiece = { sourceId: string; timelineStart: number; trimStart: number; trimEnd: number };

/**
 * Lay video clips so every cut lands on a beat. `beats` are timeline times (seconds). The video runs
 * from `from` to `to`; a cut every `every` beats. Clips are used in order and cycle; a clip used
 * again continues where it left off (so one long clip becomes a run of different moments).
 */
export function beatCut(sources: CutSource[], beats: number[], opts: { from: number; to: number; every: 1 | 2 | 4 }): CutPiece[] {
  if (!sources.length || opts.to - opts.from < 0.5) return [];
  const inRange = beats.filter((b) => b > opts.from + 0.15 && b < opts.to - 0.15);
  const cuts = [opts.from, ...inRange.filter((_, i) => (i + 1) % opts.every === 0), opts.to];
  const used = new Map<string, number>(sources.map((s) => [s.id, s.trimStart ?? 0]));
  const pieces: CutPiece[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const len = cuts[i + 1] - cuts[i];
    if (len < 0.2) continue;
    const src = sources[i % sources.length];
    let start = used.get(src.id) ?? 0;
    if (start + len > src.maxDuration) start = Math.max(0, (src.trimStart ?? 0)); // wrap to the clip's start
    const take = Math.min(len, src.maxDuration - start);
    if (take <= 0.1) continue;
    pieces.push({ sourceId: src.id, timelineStart: Math.round(cuts[i] * 1000) / 1000, trimStart: Math.round(start * 1000) / 1000, trimEnd: Math.round((start + take) * 1000) / 1000 });
    used.set(src.id, start + take);
  }
  return pieces;
}
