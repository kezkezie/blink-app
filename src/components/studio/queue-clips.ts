"use client";

import { useEditorBridge } from "@/components/video/editor-bridge";
import type { Content } from "@/types/database";
import { cleanCaption, resolveMedia } from "./media";

const PROXY_HOSTS = ["res.cloudinary.com", "supabase.co", "tempfile.aiquickdraw.com"];

/** A clip's real length from its metadata (falls back to 5 s if it can't be read in time). */
export function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (n: number) => { v.removeAttribute("src"); v.load(); resolve(n); };
    const t = setTimeout(() => done(5), 8000);
    v.onloadedmetadata = () => { clearTimeout(t); done(Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration * 100) / 100 : 5); };
    v.onerror = () => { clearTimeout(t); done(5); };
    try {
      v.src = PROXY_HOSTS.some((h) => new URL(url).hostname.endsWith(h)) ? `/api/fetch-media?url=${encodeURIComponent(url)}` : url;
    } catch { v.src = url; }
  });
}

/** Put these Library videos on the editor's timeline, in this order, the next time it opens. */
export async function queueForEditor(rows: Pick<Content, "caption" | "image_urls" | "video_urls" | "reference_image_url">[]) {
  const videos = rows.map((r) => ({ media: resolveMedia(r), name: cleanCaption(r.caption) || "Clip" })).filter((x) => x.media.url && x.media.isVideo);
  const clips = await Promise.all(videos.map(async (x) => ({ url: x.media.url!, name: x.name.slice(0, 60), duration: await probeDuration(x.media.url!) })));
  useEditorBridge.getState().enqueue(clips);
  return clips.length;
}
