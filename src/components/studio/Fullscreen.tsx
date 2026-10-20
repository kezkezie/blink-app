"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Maximize2, Minimize2, X } from "lucide-react";

/**
 * Full screen anywhere in the studio (Kezie, 2026-10-17: "a button that will make them full
 * screen... it's so much work to go all the way to the Library"). Any picture in the studio big
 * enough to look at gets a small expand button (on hover; on phones, after a tap). It opens this
 * viewer: the full-size picture, the others next to it (arrows, keys, swipe), download, and the
 * browser's own full screen. Other code can open it with openFullscreen(...).
 */
type Item = { url: string; kind: "image" | "video" };
const EVENT = "blink:fullscreen";

export function openFullscreen(items: Item[] | string, index = 0) {
  const list = typeof items === "string" ? [{ url: items, kind: /\.(mp4|webm|mov)(\?|$)/i.test(items) ? "video" as const : "image" as const }] : items;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { items: list, index } }));
}

/** The full-size picture behind a thumbnail (Cloudinary transforms dropped). */
export const fullSize = (url: string) => url.replace(/\/image\/upload\/(?:[a-z]{1,2}_[^/]+\/)+(?=v\d+\/)/, "/image/upload/");

const MIN = 120;
/** Pictures that are part of the chrome or a picker, not something to look at. */
const SKIP = "nav, header, [data-no-fullscreen], button[aria-pressed], .s-nav, [role=dialog] [role=listbox]";

export function FullscreenHost() {
  const [open, setOpen] = useState<{ items: Item[]; index: number } | null>(null);
  const [anchor, setAnchor] = useState<{ img: HTMLImageElement; x: number; y: number } | null>(null);
  const hideAt = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => { const d = (e as CustomEvent).detail as { items: Item[]; index: number }; if (d?.items?.length) setOpen({ items: d.items, index: Math.min(d.index, d.items.length - 1) }); };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  // The floating expand button: follows the picture under the pointer (or the one just tapped).
  useEffect(() => {
    const place = (img: HTMLImageElement, linger: number) => {
      const r = img.getBoundingClientRect();
      if (r.width < MIN || r.height < MIN || img.closest(SKIP) || !img.currentSrc) return;
      if (hideAt.current) clearTimeout(hideAt.current);
      setAnchor({ img, x: r.right - 40, y: r.top + 8 });
      if (linger) hideAt.current = setTimeout(() => setAnchor(null), linger);
    };
    // Follows the mouse (not just pointerover): after a scroll hides it, the next move brings it back.
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || frame) return;
      const t = e.target as HTMLElement;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (t instanceof HTMLImageElement) place(t, 0);
        else if (!t.closest?.("[data-fullscreen-button]")) { if (hideAt.current) clearTimeout(hideAt.current); hideAt.current = setTimeout(() => setAnchor(null), 250); }
      });
    };
    const onDown = (e: PointerEvent) => { if (e.pointerType !== "mouse" && e.target instanceof HTMLImageElement) place(e.target, 4000); };
    const onScroll = () => setAnchor(null);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerover", onMove, true);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointermove", onMove, true); document.removeEventListener("pointerover", onMove, true); document.removeEventListener("pointerdown", onDown, true); window.removeEventListener("scroll", onScroll, true); };
  }, []);

  const openFrom = (img: HTMLImageElement) => {
    // The pictures next to it (same grid or list) come along, so you can move through them.
    const group = img.closest("[data-fullscreen-group], .grid, ul, ol") ?? img.parentElement;
    const imgs = [...(group?.querySelectorAll("img") ?? [img])].filter((i) => { const r = i.getBoundingClientRect(); return r.width >= MIN && r.height >= MIN && i.currentSrc && !i.closest(SKIP); });
    const list = (imgs.length ? imgs : [img]).map((i) => ({ url: fullSize(i.currentSrc || i.src), kind: "image" as const }));
    const seen = new Set<string>(); const items = list.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)));
    setOpen({ items, index: Math.max(0, items.findIndex((x) => x.url === fullSize(img.currentSrc || img.src))) });
    setAnchor(null);
  };

  return (
    <>
      {anchor && !open && createPortal(
        <button type="button" data-fullscreen-button aria-label="View full screen" title="View full screen"
          className="fixed z-[85] grid place-items-center h-8 w-8 rounded-lg"
          style={{ left: anchor.x, top: anchor.y, background: "rgba(12,13,15,.72)", color: "#fff", border: "1px solid rgba(255,255,255,.18)", backdropFilter: "blur(6px)" }}
          onPointerEnter={() => { if (hideAt.current) clearTimeout(hideAt.current); }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openFrom(anchor.img); }}>
          <Maximize2 className="h-4 w-4" />
        </button>, document.body)}
      {open && <Viewer items={open.items} index={open.index} onIndex={(index) => setOpen((o) => (o ? { ...o, index } : o))} onClose={() => setOpen(null)} />}
    </>
  );
}

function Viewer({ items, index, onIndex, onClose }: { items: Item[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [native, setNative] = useState(false);
  const swipe = useRef<number | null>(null);
  const item = items[index];
  const go = useCallback((by: number) => onIndex((index + by + items.length) % items.length), [index, items.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
      else if (e.key === "ArrowRight" && items.length > 1) go(1);
      else if (e.key === "ArrowLeft" && items.length > 1) go(-1);
    };
    const onFs = () => setNative(!!document.fullscreenElement);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFs); document.body.style.overflow = prev; if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); };
  }, [go, onClose, items.length]);

  const toggleNative = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void box.current?.requestFullscreen?.().catch(() => {});
  };
  async function download() {
    try {
      const blob = await (await fetch(item.url)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `blinkspot-${Date.now()}.${item.kind === "video" ? "mp4" : blob.type.includes("png") ? "png" : "jpg"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch { window.open(item.url, "_blank", "noopener"); }
  }

  return createPortal(
    <div ref={box} role="dialog" aria-modal="true" aria-label="Full screen view" className="fixed inset-0 z-[90] flex flex-col" style={{ background: "#07080a" }}
      onPointerDown={(e) => { swipe.current = e.clientX; }}
      onPointerUp={(e) => { const x = swipe.current; swipe.current = null; if (x !== null && Math.abs(e.clientX - x) > 50 && items.length > 1) go(e.clientX < x ? 1 : -1); }}>
      <div className="flex items-center gap-2 p-3" style={{ color: "#d6d8dd" }}>
        {items.length > 1 && <span className="text-[12.5px]" style={{ color: "#a0a4ad" }}>{index + 1} of {items.length}</span>}
        <div className="flex-1" />
        <button type="button" className="s-btn ghost sm" style={{ color: "#fff" }} onClick={download}><Download className="h-4 w-4" /> Download</button>
        <a className="s-btn ghost sm" style={{ color: "#fff" }} href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Open</a>
        <button type="button" className="s-btn ghost sm" style={{ color: "#fff" }} onClick={toggleNative} aria-label={native ? "Exit full screen" : "Fill the screen"}>{native ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        <button type="button" className="s-btn ghost sm" style={{ color: "#fff" }} onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      {/* The picture always fits whole (2026-10-20: a tall one ran past the bottom: max-height
          in a grid cell had no fixed height to measure against). */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 pb-3 overflow-hidden">
        {item.kind === "video"
          ? <video key={item.url} src={item.url} controls autoPlay playsInline style={{ maxWidth: "100%", maxHeight: "calc(100dvh - 76px)" }} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img key={item.url} src={item.url} alt="" className="object-contain select-none" style={{ maxWidth: "100%", maxHeight: "calc(100dvh - 76px)", width: "auto", height: "auto" }} draggable={false} data-no-fullscreen />}
        {items.length > 1 && (
          <>
            <button type="button" aria-label="Previous" onClick={() => go(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full grid place-items-center" style={{ background: "rgba(255,255,255,.1)", color: "#fff" }}><ChevronLeft className="h-6 w-6" /></button>
            <button type="button" aria-label="Next" onClick={() => go(1)} className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full grid place-items-center" style={{ background: "rgba(255,255,255,.1)", color: "#fff" }}><ChevronRight className="h-6 w-6" /></button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
