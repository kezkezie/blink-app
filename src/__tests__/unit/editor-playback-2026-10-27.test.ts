import { describe, expect, it } from "vitest";
import { GIVE_UP_AFTER, START_GUESS, endOfEdit, isUpcomingAt, learnLatency, masterAt, nextTime, shouldPreroll, shouldSeek, timelineAt } from "@/lib/editor/playback";

/**
 * The editor's preview playback (Kezie, 2026-10-27: footage skipped on an iPad, worst with uploaded
 * phone clips). The video sets the time; the playhead waits for it instead of forcing it along.
 */
const main = { id: "a", type: "video", timelineStart: 0, trimStart: 2, trimEnd: 12, trackRow: 0 };
const next = { id: "b", type: "video", timelineStart: 10, trimStart: 0, trimEnd: 5, trackRow: 0 };
const overlay = { id: "o", type: "video", timelineStart: 3, trimStart: 0, trimEnd: 4, trackRow: 1 };
const photo = { id: "p", type: "image", timelineStart: 15, trimStart: 0, trimEnd: 5, trackRow: 0 };
const frame = 1 / 60;

describe("editor playback", () => {
  it("lets the main track's video set the time, not an overlay or a photo", () => {
    expect(masterAt([overlay, main, next], 4)?.id).toBe("a");
    expect(masterAt([overlay, next], 4)?.id).toBe("o");
    expect(masterAt([main, next, photo], 16)).toBeNull();
    expect(masterAt([main, next], 10)?.id).toBe("b");
  });

  it("follows the video while it plays", () => {
    // 4 s in: the file is at 6.0 s (trimmed from 2 s), and it has moved on a frame.
    const r = nextTime(4, frame, { clip: main, currentTime: 6 + frame, ready: true, ended: false }, 0);
    expect(r.holding).toBe(false);
    expect(r.time).toBeCloseTo(4 + frame, 6);
    expect(timelineAt({ ...main, speed: 0.5 }, 3)).toBeCloseTo(2, 6);
  });

  it("waits while the video loads or seeks, instead of running ahead and skipping", () => {
    const loading = { clip: main, currentTime: 6, ready: false, ended: false };
    let t = 4;
    for (let i = 0; i < 30; i++) t = nextTime(t, frame, loading, i * frame).time;
    expect(t).toBe(4);
    expect(nextTime(4, frame, loading, 0).holding).toBe(true);
    // A video that's behind (an iPad starting late) holds the playhead until it catches up.
    expect(nextTime(4, frame, { clip: main, currentTime: 5.9, ready: true, ended: false }, 0).time).toBe(4);
    // Far from where it should be (a cut, a jump): wait while it's moved.
    expect(nextTime(4, frame, { clip: main, currentTime: 9, ready: true, ended: false }, 0)).toEqual({ time: 4, holding: true });
  });

  it("never jumps ahead more than a moment, and runs on the clock in gaps or when stuck", () => {
    expect(nextTime(4, frame, { clip: main, currentTime: 6.4, ready: true, ended: false }, 0).time).toBeCloseTo(4 + frame + 0.1, 6);
    expect(nextTime(16, frame, null, 0).time).toBeCloseTo(16 + frame, 6);
    expect(nextTime(4, frame, { clip: main, currentTime: 6, ready: false, ended: false }, GIVE_UP_AFTER).time).toBeCloseTo(4 + frame, 6);
    expect(nextTime(9.99, frame, { clip: main, currentTime: 12, ready: true, ended: true }, 0).time).toBeCloseTo(9.99 + frame, 6);
  });

  it("lines up the next clip shortly before its cut", () => {
    expect(isUpcomingAt(next, 8.6)).toBe(true);
    expect(isUpcomingAt(next, 8)).toBe(false);
    expect(isUpcomingAt(next, 10)).toBe(false);
  });

  it("seeks exact frames when paused, only clear drifts while playing", () => {
    expect(shouldSeek(5, 5.05, { playing: false, seeking: false })).toBe(true);
    expect(shouldSeek(5, 5.02, { playing: false, seeking: false })).toBe(false);
    expect(shouldSeek(5, 5.2, { playing: true, seeking: false })).toBe(false);
    expect(shouldSeek(5, 5.4, { playing: true, seeking: false })).toBe(true);
    expect(shouldSeek(5, 5.4, { playing: true, seeking: true })).toBe(false);
  });

  it("starts the next clip early by the device's own start delay, learned as clips start", () => {
    let l = START_GUESS;
    for (let i = 0; i < 6; i++) l = learnLatency(l, 0.25); // an iPad taking a quarter second
    expect(l).toBeGreaterThan(0.24);
    expect(learnLatency(0.2, 5)).toBe(0.8); // a one-off stall doesn't start clips seconds early
    expect(shouldPreroll(next, 10 - 0.2, 0.25)).toBe(true);
    expect(shouldPreroll(next, 10 - 0.5, 0.25)).toBe(false);
    expect(shouldPreroll(next, 10, 0.25)).toBe(false);
  });

  it("knows where the edit ends", () => {
    expect(endOfEdit([main, next], [overlay])).toBe(15);
    expect(endOfEdit([], [])).toBe(5);
  });
});
