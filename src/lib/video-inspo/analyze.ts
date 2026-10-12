"use client";

import { detectCuts, frameDiff, sampleTimes, shotsFrom, toGrey, type Shot } from "./cuts";

/**
 * The browser half of Video Inspo: open the video, sample small grey frames to find the shots,
 * then grab one still per shot (the middle) at 512 px. Nothing is uploaded until the user asks for
 * the breakdown, and only these stills are sent, never the video.
 */
export type ShotFrame = Shot & { t: number; data: string };
export type VideoReading = { duration: number; width: number; height: number; shots: ShotFrame[] };

const MAX_SECONDS = 90;

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const t = setTimeout(() => reject(new Error("The video took too long to open.")), 30_000);
    v.onloadeddata = () => { clearTimeout(t); resolve(v); };
    v.onerror = () => { clearTimeout(t); reject(new Error("This browser can't open that video. Try an MP4.")); };
    v.src = src;
  });
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { v.removeEventListener("seeked", done); resolve(); };
    v.addEventListener("seeked", done);
    v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.05));
    setTimeout(done, 1500); // a stuck seek must not hang the reading
  });
}

export async function readVideo(src: string, onProgress?: (p: number) => void): Promise<VideoReading> {
  const v = await loadVideo(src);
  const duration = Math.min(v.duration || 0, MAX_SECONDS);
  if (!duration || !Number.isFinite(duration)) throw new Error("Couldn't read the video's length.");
  const small = document.createElement("canvas");
  small.width = 64; small.height = 36;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  const times = sampleTimes(duration);
  const diffs: number[] = [];
  let prev: Uint8ClampedArray | null = null;
  for (let i = 0; i < times.length; i++) {
    await seek(v, times[i]);
    sctx.drawImage(v, 0, 0, 64, 36);
    let grey: Uint8ClampedArray;
    try { grey = toGrey(sctx.getImageData(0, 0, 64, 36).data); } catch { throw new Error("That video's host doesn't allow reading it. Upload the file instead."); }
    diffs.push(prev ? frameDiff(prev, grey) : 0);
    prev = grey;
    onProgress?.((i + 1) / (times.length + 16));
  }
  const shots = shotsFrom(detectCuts(diffs, times), duration);
  const big = document.createElement("canvas");
  const w = 512;
  const h = Math.round((w * (v.videoHeight || 9)) / (v.videoWidth || 16));
  big.width = w; big.height = h;
  const bctx = big.getContext("2d")!;
  const out: ShotFrame[] = [];
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const t = s.start + (s.end - s.start) / 2;
    await seek(v, t);
    bctx.drawImage(v, 0, 0, w, h);
    out.push({ ...s, t: Math.round(t * 100) / 100, data: big.toDataURL("image/jpeg", 0.72).split(",")[1] });
    onProgress?.((times.length + i + 1) / (times.length + shots.length));
  }
  const size = { width: v.videoWidth, height: v.videoHeight };
  v.removeAttribute("src"); v.load();
  return { duration: Math.round(duration * 100) / 100, ...size, shots: out };
}
