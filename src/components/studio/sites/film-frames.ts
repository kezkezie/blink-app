"use client";

import { supabase } from "@/lib/supabase";
import { FILM_PHONE_WIDTH, FILM_WIDTH, filmFolder, filmFrameCount, filmFrameTime, framePath, phoneCountFor, type FilmInput } from "@/lib/sites/scroll-film";

/**
 * A scroll film from a video, in the browser (lib/sites/scroll-film.ts): the video is read whole
 * (a same-origin blob, so its frames can be drawn and saved), cut into frames, and each frame is
 * uploaded to the owner's storage as it is made: 1280 wide for desktops, every other one at 720
 * wide for phones. WebP where the browser can write it, else JPEG (Safari).
 */
export type FilmProgress = { step: "reading" | "cutting"; done: number; total: number };

const PROXY_HOSTS = ["res.cloudinary.com", "supabase.co", "tempfile.aiquickdraw.com"];
const MAX_VIDEO_BYTES = 200_000_000;

async function videoBlob(src: string | File): Promise<Blob> {
  if (typeof src !== "string") return src;
  const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return r.blob(); };
  try { return await get(src); } catch {
    // No CORS on the host: through our media proxy (the same one the video editor uses).
    if (!PROXY_HOSTS.some((h) => { try { return new URL(src).hostname.endsWith(h); } catch { return false; } })) throw new Error("Couldn't read that video.");
    return get(`/api/fetch-media?url=${encodeURIComponent(src)}`);
  }
}

function seek(video: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("seek failed")); };
    const timer = setTimeout(fail, 10_000);
    const cleanup = () => { clearTimeout(timer); video.removeEventListener("seeked", done); video.removeEventListener("error", fail); };
    video.addEventListener("seeked", done);
    video.addEventListener("error", fail);
    video.currentTime = t;
  });
}

const blobOf = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("frame"))), type, q));

export async function makeFilm(src: string | File, clientId: string, onProgress: (p: FilmProgress) => void, signal?: AbortSignal): Promise<FilmInput> {
  onProgress({ step: "reading", done: 0, total: 1 });
  const blob = await videoBlob(src);
  if (blob.size > MAX_VIDEO_BYTES) throw new Error("That video is over 200 MB. Trim it first.");
  const url = URL.createObjectURL(blob);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  try {
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("That file isn't a video we can read (MP4 or WebM).")); setTimeout(() => rej(new Error("The video took too long to open.")), 30_000); });
    const seconds = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 5;
    const w = v.videoWidth || 1280, h = v.videoHeight || 720;
    const count = filmFrameCount(seconds), phoneCount = phoneCountFor(count);
    const big = document.createElement("canvas"), small = document.createElement("canvas");
    big.width = Math.min(FILM_WIDTH, w); big.height = Math.round((big.width / w) * h);
    small.width = Math.min(FILM_PHONE_WIDTH, w); small.height = Math.round((small.width / w) * h);
    const folder = filmFolder(clientId);
    let type = "image/webp", ext: "webp" | "jpg" = "webp";
    const pending = new Set<Promise<void>>();
    let done = 0, failed: Error | null = null;
    const total = count + phoneCount;
    const put = (path: string, b: Blob) => {
      const p: Promise<void> = supabase.storage.from("assets").upload(path, b, { contentType: type, cacheControl: "31536000" })
        .then(({ error }) => { if (error) failed ??= new Error("Couldn't upload the frames."); else { done++; onProgress({ step: "cutting", done, total }); } }, () => { failed ??= new Error("Couldn't upload the frames."); })
        .finally(() => { pending.delete(p); });
      pending.add(p);
    };
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) throw new Error("Stopped.");
      if (failed) throw failed;
      await seek(v, filmFrameTime(i, count, seconds));
      big.getContext("2d")!.drawImage(v, 0, 0, big.width, big.height);
      let frame = await blobOf(big, type, 0.72);
      if (i === 0 && frame.type !== "image/webp") { type = "image/jpeg"; ext = "jpg"; frame = await blobOf(big, type, 0.8); }
      put(framePath(folder, "d", i, ext), frame);
      if (i % 2 === 0) {
        small.getContext("2d")!.drawImage(v, 0, 0, small.width, small.height);
        put(framePath(folder, "m", i / 2, ext), await blobOf(small, type, ext === "webp" ? 0.7 : 0.78));
      }
      // At most a dozen uploads waiting at once.
      while (pending.size > 12) await Promise.race(pending);
    }
    await Promise.all(pending);
    if (failed) throw failed;
    return { folder, count, phoneCount, ext, ratio: Math.round((w / h) * 1000) / 1000 };
  } finally {
    v.removeAttribute("src"); v.load();
    URL.revokeObjectURL(url);
  }
}

/** A phone frame's public URL, for the preview strip. */
export function filmFrameUrl(film: FilmInput, i: number) {
  return supabase.storage.from("assets").getPublicUrl(framePath(film.folder, "m", i, film.ext)).data.publicUrl;
}
