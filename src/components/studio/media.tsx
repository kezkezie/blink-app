"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, GalleryHorizontal, Loader2, Play, Square } from "lucide-react";
import { cloudinaryVideoPoster } from "@/lib/utils";
import type { Content } from "@/types/database";
import { stopPosts } from "./stop";

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

/** A post whose picture or video is still being made (or never arrived). */
function PendingNote({ content }: { content: Content }) {
  const [now] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);
  // Server-owned image jobs keep their own clock (they're rescued or closed, never left hanging).
  const fresh = content.generation_state === "generating" || now - new Date(content.updated_at ?? content.created_at).getTime() < 10 * 60_000;
  // Stop anything still being made, right on its card (2026-10-25). A span, as the card itself can be a button.
  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (stopping) return;
    setStopping(true);
    void stopPosts([content.id]).finally(() => setStopping(false));
  };
  return (
    <div className="absolute inset-0 grid place-items-center p-3 text-center text-[12px]" style={{ background: "rgba(10,11,13,.6)", color: "var(--s-soft)" }}>
      {content.generation_state === "failed" ? <span>{content.generation_status_text}</span> : fresh
        ? <span className="grid justify-items-center gap-2">
            <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {content.generation_status_text}</span>
            {(content.generation_state === "generating" || (content.creation_metadata as { operation?: unknown } | null)?.operation === "ai_edit") && (
              <span role="button" tabIndex={0} className="s-btn sm" aria-label="Stop" title="Stop: what the AI service hasn't already billed comes back"
                onClick={stop} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") stop(e); }}>
                {stopping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" fill="currentColor" />} {stopping ? "Stopping…" : "Stop"}
              </span>
            )}
          </span>
        : <span>This one didn&apos;t finish. If credits were taken they were refunded; you can delete it.</span>}
    </div>
  );
}

export function MediaCard({ content, href, actions, selected, aspect = "4 / 3", onOpen }: {
  content: Content;
  href: string;
  actions?: React.ReactNode;
  selected?: boolean;
  aspect?: string;
  /** Opens the post in a viewer instead of going to its page (the Library, 2026-10-16). */
  onOpen?: () => void;
}) {
  const media = resolveMedia(content);
  const status = STATUS_LABEL[content.status] ?? { label: content.status };
  const title = cleanCaption(content.caption) || (media.isVideo ? "Video" : "Image");
  // A carousel (several pictures): swipe through it right on the card (2026-10-16).
  const slides = !media.isVideo && media.images.length > 1 ? media.images : null;
  const [slide, setSlide] = useState(0);
  const swipeX = useRef<number | null>(null);
  const swiped = useRef(false);
  const go = (e: React.SyntheticEvent, by: number) => { e.preventDefault(); e.stopPropagation(); if (slides) setSlide((i) => (i + by + slides.length) % slides.length); };
  return (
    <div className={`s-media${selected ? " sel" : ""}`}>
      {(() => {
        const inner = (
          <div className="m" style={{ aspectRatio: aspect }}
            onPointerDown={slides ? (e) => { swipeX.current = e.clientX; swiped.current = false; } : undefined}
            onPointerUp={slides ? (e) => { const x = swipeX.current; swipeX.current = null; if (x !== null && Math.abs(e.clientX - x) > 40) { swiped.current = true; setSlide((i) => (i + (e.clientX < x ? 1 : -1) + slides.length) % slides.length); } } : undefined}
            onClickCapture={slides ? (e) => { if (swiped.current) { e.preventDefault(); e.stopPropagation(); swiped.current = false; } } : undefined}>
            <MediaThumb {...media} url={slides ? slides[slide] : media.url} alt={title} />
            {slides && (
              <>
                <span className="s-badge absolute top-2 right-2 flex items-center gap-1" style={{ background: "rgba(12,13,15,.7)", color: "#fff" }}><GalleryHorizontal className="h-3 w-3" /> {slide + 1}/{slides.length}</span>
                <span role="button" tabIndex={-1} aria-label="Previous slide" className="s-cslide l" onClick={(e) => go(e, -1)}><ChevronLeft className="h-4 w-4" /></span>
                <span role="button" tabIndex={-1} aria-label="Next slide" className="s-cslide r" onClick={(e) => go(e, 1)}><ChevronRight className="h-4 w-4" /></span>
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">{slides.map((_, i) => <i key={i} className="block h-1.5 w-1.5 rounded-full" style={{ background: i === slide ? "#fff" : "rgba(255,255,255,.45)" }} />)}</span>
              </>
            )}
            {!media.url && content.generation_status_text && <PendingNote content={content} />}
            <div className="tl">
              {media.isVideo && <span className="s-badge"><Play className="inline h-2.5 w-2.5 -mt-px" /> VIDEO</span>}
              <span className={`s-badge ${status.tone ?? ""}`}>{status.label}</span>
            </div>
          </div>
        );
        return onOpen
          ? <button type="button" className="block w-full text-left" aria-label={`View ${title}`} onClick={onOpen}>{inner}</button>
          : <Link href={href} className="block" aria-label={title}>{inner}</Link>;
      })()}
      {actions && <div className="hov">{actions}</div>}
      <div className="ft">
        <b title={title}>{title}</b>
        <span>{timeAgo(content.created_at)}</span>
      </div>
    </div>
  );
}
