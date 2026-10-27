/**
 * Preview playback in the video editor (Kezie, 2026-10-27: "the video editor is skipping a lot of
 * footage while pressing play... especially when you upload a video from your local machine... on an
 * iPad... CapCut has better playback").
 *
 * Before, a stopwatch moved the playhead and every video was forced to it whenever they were a
 * quarter second apart. An iPad starts, seeks and decodes big phone footage slower than a laptop, so
 * each forced jump stalled the video, the stopwatch ran further ahead, and it jumped again: whole
 * stretches skipped. Now it plays like an editor: the video at the playhead sets the time and the
 * playhead follows it (waiting while it loads, never pulling it around), and only gaps, photos and
 * text run on the clock. The next clip is lined up just before its cut. Pure, so it's tested.
 */
import { sourceAt, span, speedOf } from "./speed";

type Clip = { id: string; type?: string; timelineStart: number; trimStart: number; trimEnd: number; speed?: number; trackRow?: number };

export const isActiveAt = (c: Clip, t: number) => t >= c.timelineStart && t < c.timelineStart + span(c);

/** How far ahead a clip is lined up (its first frame decoded, paused) before its cut. */
export const LINE_UP_AHEAD = 1.5;
export const isUpcomingAt = (c: Clip, t: number) => c.timelineStart > t && c.timelineStart - t <= LINE_UP_AHEAD;

/** The clip whose video sets the time: the video playing at t on the lowest row (the main track first). */
export function masterAt<T extends Clip>(clips: T[], t: number): T | null {
  let best: T | null = null;
  for (const c of clips) {
    if (c.type !== "video" || !isActiveAt(c, t)) continue;
    if (!best || (c.trackRow ?? 0) < (best.trackRow ?? 0)) best = c;
  }
  return best;
}

/** Timeline time for a second of the clip's file (sourceAt backwards). */
export const timelineAt = (c: Clip, source: number) => c.timelineStart + (source - c.trimStart) / speedOf(c);

/** What the master video is doing right now. ready: playing with frames to show (not loading or seeking). */
export type MasterNow = { clip: Clip; currentTime: number; ready: boolean; ended: boolean };

/** A video stuck this long (a broken file, or the browser refused to play it) stops holding the playhead. */
export const GIVE_UP_AFTER = 3;
/** Further than this from where it should be (in its own seconds), the master is moved: a cut or a jump. */
export const MASTER_OFF = 0.5;

/**
 * The playhead's next time while playing, and whether it's waiting for the video.
 * - No video at the playhead (a gap, photos, text), or one that ended or is stuck: the clock.
 * - A video that's loading or seeking: the playhead waits for it (holding), instead of running on.
 * - A playing video: its own position. Never backwards, and never more than a moment ahead.
 */
export function nextTime(prev: number, wall: number, master: MasterNow | null, heldFor: number): { time: number; holding: boolean } {
  if (!master || master.ended || heldFor >= GIVE_UP_AFTER) return { time: prev + wall, holding: false };
  const expected = sourceAt(master.clip, prev);
  if (!master.ready || Math.abs(master.currentTime - expected) > MASTER_OFF * speedOf(master.clip)) return { time: prev, holding: true };
  const at = timelineAt(master.clip, master.currentTime);
  return { time: Math.min(Math.max(prev, at), prev + wall + 0.1), holding: false };
}

/**
 * Whether a video or sound that isn't the master should be moved to `expected`: a frame off when
 * paused (scrubbing shows the exact frame), a clear drift while playing (small ones aren't worth the
 * stall a seek costs), and never while it's still finishing a seek.
 */
export function shouldSeek(currentTime: number, expected: number, opts: { playing: boolean; seeking: boolean; speed?: number }) {
  const off = Math.abs(currentTime - expected);
  if (!opts.playing) return off > 0.04;
  return !opts.seeking && off > 0.3 * (opts.speed ?? 1);
}

/**
 * How long this device takes to get a video moving after play() (seconds), learned each time a clip
 * starts. An iPad takes a moment, which showed as a freeze at every cut, so the next clip is started
 * (silent, unseen) that much before its cut and is already moving when it's shown.
 */
export const START_GUESS = 0.12;
export const learnLatency = (prev: number, sample: number) => Math.min(0.8, Math.max(0, prev * 0.6 + sample * 0.4));
export const shouldPreroll = (c: Clip, t: number, latency: number) => { const toCut = c.timelineStart - t; return toCut > 0 && toCut <= latency + 0.02; };

/** Where the whole edit ends (at least 5 s, like before). */
export const endOfEdit = (...tracks: Clip[][]) => Math.max(5, ...tracks.flat().map((c) => c.timelineStart + span(c)));
