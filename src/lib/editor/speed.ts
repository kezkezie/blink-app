/**
 * Clip speed in the video editor (Kezie, 2026-10-23: "we need to have a slow-mo"). A clip keeps
 * its source trim (trimStart..trimEnd, seconds of the file) and gets a speed: 0.5 plays it at half
 * speed, so it takes twice as long on the timeline. Pure, so preview, timeline and export agree.
 */
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;
const MIN = 0.25, MAX = 4;

type Timed = { timelineStart: number; trimStart: number; trimEnd: number; speed?: number };

export function speedOf(c: { speed?: number }): number {
  const s = Number(c.speed);
  return Number.isFinite(s) && s > 0 ? Math.min(MAX, Math.max(MIN, s)) : 1;
}

/** How long the clip lasts on the timeline. */
export const span = (c: Timed | { trimStart: number; trimEnd: number; speed?: number }) => (c.trimEnd - c.trimStart) / speedOf(c);

/** Where the clip ends on the timeline. */
export const endOf = (c: Timed) => c.timelineStart + span(c);

/** The second of the source file shown at timeline time t. */
export const sourceAt = (c: Timed, t: number) => c.trimStart + (t - c.timelineStart) * speedOf(c);

/** The timeline seconds a source change of `sourceDelta` takes. */
export const toTimeline = (c: { speed?: number }, sourceDelta: number) => sourceDelta / speedOf(c);

/** ffmpeg: stretch (or squeeze) a clip's frames to its speed. */
export function setptsFor(speed: number): string {
  const s = speedOf({ speed });
  return s === 1 ? "setpts=PTS-STARTPTS" : `setpts=${(1 / s).toFixed(4)}*(PTS-STARTPTS)`;
}

/** ffmpeg: the same for sound, as a chain of atempo steps (each kept between 0.5 and 2). */
export function atempoChain(speed: number): string {
  let s = speedOf({ speed });
  if (s === 1) return "";
  const steps: string[] = [];
  while (s < 0.5) { steps.push("atempo=0.5"); s /= 0.5; }
  while (s > 2) { steps.push("atempo=2.0"); s /= 2; }
  steps.push(`atempo=${Number(s.toFixed(4))}`);
  return steps.join(",");
}

export const speedLabel = (s: number) => (s === 1 ? "1×" : `${s}×`);

/**
 * A new speed for one clip, rippling the clips after it on the same row so nothing overlaps or
 * leaves a gap: everything that started at or after its old end moves by the change in length.
 */
export function withSpeed<T extends Timed & { id: string; trackRow?: number }>(clips: T[], id: string, speed: number): T[] {
  const target = clips.find((c) => c.id === id);
  if (!target) return clips;
  const next = { ...target, speed: speedOf({ speed }) };
  const oldEnd = endOf(target), delta = span(next) - span(target);
  const row = target.trackRow ?? 0;
  return clips.map((c) => {
    if (c.id === id) return next;
    if ((c.trackRow ?? 0) === row && c.timelineStart >= oldEnd - 1e-6) return { ...c, timelineStart: Math.max(0, c.timelineStart + delta) };
    return c;
  });
}
