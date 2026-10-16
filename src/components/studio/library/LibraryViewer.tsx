"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clapperboard, Download, ExternalLink, Film, LayoutTemplate, Loader2, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import type { Content } from "@/types/database";
import { cleanCaption, resolveMedia, thumbUrl } from "@/components/studio/media";

/**
 * The Library viewer (Kezie, 2026-10-16: "tap on any of the images and it displaying on a modal").
 * Full screen, one post at a time: arrows, keys (← → Esc) and swipes to move through the Library,
 * with what you'd do next (open the post, Edit with AI, the Editor, a motion graphic, download).
 */
export function LibraryViewer({ items, index, onIndex, onClose, onDelete, hasMore, onLoadMore }: {
  items: Content[]; index: number; onIndex: (i: number) => void; onClose: () => void;
  onDelete: (id: string) => Promise<boolean>; hasMore: boolean; onLoadMore: () => Promise<void>;
}) {
  const item = items[index];
  const media = item ? resolveMedia(item) : null;
  const [downloading, setDownloading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const swipe = useRef<number | null>(null);
  const atEnd = index >= items.length - 1;

  const go = useCallback(async (by: number) => {
    const next = index + by;
    if (next < 0) return;
    if (next >= items.length) {
      if (!hasMore || loadingMore) return;
      setLoadingMore(true);
      try { await onLoadMore(); } finally { setLoadingMore(false); }
      onIndex(next);
      return;
    }
    onIndex(next);
  }, [index, items.length, hasMore, loadingMore, onLoadMore, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") void go(1);
      else if (e.key === "ArrowLeft") void go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [go, onClose]);

  // The next and previous pictures are fetched ahead, so moving through is instant.
  useEffect(() => {
    for (const n of [index - 1, index + 1]) {
      const m = items[n] ? resolveMedia(items[n]) : null;
      if (m?.url && !m.isVideo) { const im = new Image(); im.src = thumbUrl(m.url, 1600); }
    }
  }, [index, items]);

  async function download() {
    if (!media?.url) return;
    setDownloading(true);
    try {
      const blob = await (await fetch(media.url)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(cleanCaption(item.caption) || "blinkspot").slice(0, 40).replace(/[^\w\- ]+/g, "").trim() || "blinkspot"}.${media.isVideo ? "mp4" : blob.type.includes("png") ? "png" : "jpg"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { window.open(media.url, "_blank", "noopener"); }
    finally { setDownloading(false); }
  }

  if (!item || !media || typeof document === "undefined") return null;
  const title = cleanCaption(item.caption) || (media.isVideo ? "Video" : "Image");
  const image = !media.isVideo && media.url ? media.url : null;
  const made = item.ai_model && item.ai_model !== "caption-ai" ? "Made with AI" : "Uploaded";

  return createPortal(
    <div className="studio fixed inset-0 z-[80] flex flex-col" style={{ background: "rgba(8,9,11,.94)" }} role="dialog" aria-modal="true" aria-label={title}
      onPointerDown={(e) => { swipe.current = e.clientX; }}
      onPointerUp={(e) => { const s = swipe.current; swipe.current = null; if (s !== null && Math.abs(e.clientX - s) > 60 && (e.target as HTMLElement).tagName !== "VIDEO") void go(e.clientX < s ? 1 : -1); }}>
      <div className="flex items-center gap-3 px-4 py-3" style={{ color: "#f2f3f5" }}>
        <span className="mono text-[12px]" style={{ color: "#a0a4ad" }}>{index + 1} / {items.length}{hasMore ? "+" : ""}</span>
        <b className="text-[14px] truncate flex-1">{title}</b>
        <span className="s-badge hidden sm:inline">{made}</span>
        <button className="s-btn ghost sm" onClick={onClose} aria-label="Close" style={{ color: "#f2f3f5" }}><X className="h-5 w-5" /></button>
      </div>
      <div className="relative flex-1 min-h-0 grid place-items-center px-14">
        {media.isVideo
          ? <video key={item.id} src={media.url!} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" style={{ maxHeight: "calc(100dvh - 170px)" }} />
          : media.url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img key={item.id} src={thumbUrl(media.url, 1600)} alt={title} className="max-h-full max-w-full object-contain rounded-lg select-none" draggable={false} style={{ maxHeight: "calc(100dvh - 170px)" }} />
            : <span style={{ color: "#a0a4ad" }}>{item.generation_status_text || "No picture yet"}</span>}
        <button className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full grid place-items-center disabled:opacity-30" style={{ background: "rgba(255,255,255,.1)", color: "#fff" }} disabled={index === 0} onClick={() => void go(-1)} aria-label="Previous"><ChevronLeft className="h-6 w-6" /></button>
        <button className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full grid place-items-center disabled:opacity-30" style={{ background: "rgba(255,255,255,.1)", color: "#fff" }} disabled={atEnd && !hasMore} onClick={() => void go(1)} aria-label="Next">
          {loadingMore ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronRight className="h-6 w-6" />}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-3">
        <Link href={`/studio/library/${item.id}`} className="s-btn sm"><ExternalLink className="h-3.5 w-3.5" /> Open the post</Link>
        {image && <Link href={`/studio/library/${item.id}/edit`} className="s-btn sm"><Wand2 className="h-3.5 w-3.5" /> Edit with AI</Link>}
        {image && <Link href={`/studio/image?mode=design&content=${item.id}`} className="s-btn sm"><LayoutTemplate className="h-3.5 w-3.5" /> Editor</Link>}
        {image && <Link href={`/studio/video?tab=editor&rail=motion&motionPicture=${item.id}&motion=${encodeURIComponent(`Animate this picture${title ? `: ${title.slice(0, 120)}` : ""}`)}`} className="s-btn sm"><Clapperboard className="h-3.5 w-3.5" /> Motion graphic</Link>}
        {image && <Link href={`/studio/video?mode=showcase&start=${encodeURIComponent(image)}`} className="s-btn sm"><Film className="h-3.5 w-3.5" /> Animate</Link>}
        <button className="s-btn sm" disabled={!media.url || downloading} onClick={download}>{downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download</button>
        <button className="s-btn sm" style={{ color: "var(--s-danger)" }} onClick={async () => { if (await onDelete(item.id)) { toast.message("Deleted"); if (items.length <= 1) onClose(); else if (index >= items.length - 1) onIndex(index - 1); } }}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
      </div>
    </div>,
    document.body,
  );
}
