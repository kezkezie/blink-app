"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { cloudinaryVideoPoster } from "@/lib/utils";
import type { Content } from "@/types/database";

/** Content types that are pieces of a video (scenes, raw clips, audio), not finished posts. Same list as the classic grid. */
export const PART_TYPES = ["sequence_clip", "raw_clip", "story_sequence", "storyboard", "generated_audio"];
/** The storyboard start/end frames are saved as post_image; keep them out of the finished feed. NULL-safe:
 *  a plain `not ilike` drops every row whose caption is NULL (NULL NOT ILIKE x is never true). */
export const NOT_STORYBOARD_FRAME = 'caption.is.null,caption.not.ilike."Storyboard: Scene*"';
export const VIDEO_TYPES = ["reel", "video"];

function parseArray(data: unknown): string[] {
  if (Array.isArray(data)) return data.filter((u): u is string => typeof u === "string" && u.length > 0);
  if (typeof data === "string" && data.length > 0) {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === "string" && u.length > 0);
    } catch {
      if (data.startsWith("http")) return [data];
    }
  }
  return [];
}

export function isVideoUrl(url: string) {
  const clean = url.split("?")[0].toLowerCase();
  return /\.(mp4|mov|webm)$/.test(clean) || url.includes("/video/upload/") || url.includes("story-sequences");
}

/** The one piece of media a content row should be shown with (same rules as the classic ContentCard). */
export function resolveMedia(c: Pick<Content, "video_urls" | "image_urls" | "reference_image_url">) {
  const videos = parseArray(c.video_urls).filter(isVideoUrl);
  const images = parseArray(c.image_urls);
  const url = videos[0] ?? images.find(isVideoUrl) ?? images[0] ?? c.reference_image_url ?? null;
  const isVideo = !!url && isVideoUrl(url);
  return { url, isVideo, poster: isVideo ? cloudinaryVideoPoster(url) : undefined, images: images.filter((u) => !isVideoUrl(u)) };
}

/**
 * A resized preview of a Cloudinary image (the originals are 4K PNGs, often 10 MB+, so grids were
 * black for seconds). Exports and editors keep the original URL.
 */
export function thumbUrl(url: string, width = 640) {
  if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) return url;
  return url.replace("/image/upload/", `/image/upload/c_limit,w_${width},q_auto,f_auto/`);
}

export const STATUS_LABEL: Record<string, { label: string; tone?: "ok" | "warn" | "danger" | "ai" }> = {
  draft: { label: "Draft" },
  pending_approval: { label: "Needs approval", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "danger" },
  scheduled: { label: "Scheduled", tone: "ai" },
  posted: { label: "Posted", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
};

export function cleanCaption(caption: string | null | undefined) {
  // Older rows start captions with emoji labels ("🎬 AI Draft: ..."); the new look keeps titles quiet.
  return (caption || "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** A media thumbnail: still poster for videos (paints instantly), the video itself plays on hover. */
export function MediaThumb({ url, isVideo, poster, alt = "" }: { url: string | null; isVideo: boolean; poster?: string; alt?: string }) {
  if (!url) return <div className="absolute inset-0 grid place-items-center text-xs" style={{ color: "var(--s-mute)" }}>No media yet</div>;
  if (isVideo) {
    return (
      <video
        src={url}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
        onMouseEnter={(e) => { void e.currentTarget.play().catch(() => {}); }}
        onMouseLeave={(e) => { e.currentTarget.pause(); }}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={thumbUrl(url)} alt={alt} loading="lazy" decoding="async" />;
}

export function MediaCard({ content, href, actions, selected, aspect = "4 / 3" }: {
  content: Content;
  href: string;
  actions?: React.ReactNode;
  selected?: boolean;
  aspect?: string;
}) {
  const media = resolveMedia(content);
  const status = STATUS_LABEL[content.status] ?? { label: content.status };
  const title = cleanCaption(content.caption) || (media.isVideo ? "Video" : "Image");
  return (
    <div className={`s-media${selected ? " sel" : ""}`}>
      <Link href={href} className="block" aria-label={title}>
        <div className="m" style={{ aspectRatio: aspect }}>
          <MediaThumb {...media} alt={title} />
          <div className="tl">
            {media.isVideo && <span className="s-badge"><Play className="inline h-2.5 w-2.5 -mt-px" /> VIDEO</span>}
            <span className={`s-badge ${status.tone ?? ""}`}>{status.label}</span>
          </div>
        </div>
      </Link>
      {actions && <div className="hov">{actions}</div>}
      <div className="ft">
        <b title={title}>{title}</b>
        <span>{timeAgo(content.created_at)}</span>
      </div>
    </div>
  );
}
