"use client";

import type { EditorState } from "@/lib/editor-ops";

export type CapturedFrame = { clipId: string; t: number; data: string };

const PROXY_HOSTS = ["res.cloudinary.com", "supabase.co", "tempfile.aiquickdraw.com"];
function sameOrigin(url: string) {
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return url;
  try {
    return PROXY_HOSTS.some((h) => new URL(url).hostname.endsWith(h)) ? `/api/fetch-media?url=${encodeURIComponent(url)}` : url;
  } catch { return url; }
}

function toJpeg(source: CanvasImageSource, w: number, h: number) {
  const width = 320, height = Math.max(1, Math.round((h / w) * 320));
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  c.getContext("2d")!.drawImage(source, 0, 0, width, height);
  return c.toDataURL("image/jpeg", 0.6).split(",")[1] ?? "";
}

function seek(video: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("seek failed")); };
    const timer = setTimeout(fail, 8000);
    const cleanup = () => { clearTimeout(timer); video.removeEventListener("seeked", done); video.removeEventListener("error", fail); };
    video.addEventListener("seeked", done);
    video.addEventListener("error", fail);
    video.currentTime = t;
  });
}

/**
 * A few small frames from each clip on the timeline (spread across the whole source, so the model
 * can choose the best part), for Ask BlinkSpot to look at. A clip that cannot be read is skipped.
 */
export async function captureTimelineFrames(state: EditorState, perClip = 3, maxFrames = 24): Promise<CapturedFrame[]> {
  const clips = [...state.videoClips].sort((a, b) => a.timelineStart - b.timelineStart).slice(0, 8);
  const out: CapturedFrame[] = [];
  for (const clip of clips) {
    if (out.length >= maxFrames) break;
    try {
      if (clip.type === "image") {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("image")); img.src = sameOrigin(clip.url); });
        out.push({ clipId: clip.id, t: 0, data: toJpeg(img, img.naturalWidth, img.naturalHeight) });
        continue;
      }
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.preload = "auto";
      v.src = sameOrigin(clip.url);
      await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("video")); setTimeout(() => rej(new Error("timeout")), 15000); });
      const length = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : clip.maxDuration || 5;
      for (const f of Array.from({ length: perClip }, (_, i) => (i + 0.5) / perClip)) {
        if (out.length >= maxFrames) break;
        const t = Math.min(length - 0.05, length * f);
        await seek(v, t);
        out.push({ clipId: clip.id, t: Math.round(t * 10) / 10, data: toJpeg(v, v.videoWidth || 16, v.videoHeight || 9) });
      }
      v.removeAttribute("src");
      v.load();
    } catch {
      // unreadable clip: the model still has its name and length
    }
  }
  return out.filter((f) => f.data.length > 100);
}
