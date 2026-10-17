"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Laptop, Maximize2, Smartphone, X } from "lucide-react";
import { previewDoc } from "@/lib/sites/code";

/**
 * A website studio page, sandboxed (2026-10-16): its own opaque origin, no access to the app,
 * no network calls or forms (lib/sites/code.ts PAGE_CSP). The live preview runs its script; the
 * gallery thumbnails don't (pages are complete without JavaScript), so a grid of them stays light.
 */
export function SitePreview({ html, device = "desktop", title = "Website preview" }: { html: string; device?: "desktop" | "phone"; title?: string }) {
  return (
    <iframe
      title={title} srcDoc={previewDoc(html)} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className="block mx-auto bg-white transition-[width] duration-300"
      style={{ width: device === "phone" ? 390 : "100%", maxWidth: "100%", height: "100%", border: 0, borderRadius: device === "phone" ? 28 : 12 }}
    />
  );
}

/** A page drawn at desktop width (1280 × 800) and scaled to the card. */
export function SiteThumb({ html, title }: { html: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1280));
    ro.observe(el);
    // Drawn once the card is near the screen (our own check: the browser's lazy iframes can stay blank here).
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: "600px" });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);
  return (
    <div ref={box} className="relative w-full overflow-hidden bg-white" style={{ aspectRatio: "16 / 10" }}>
      {scale > 0 && near && (
        <iframe
          title={title} srcDoc={previewDoc(html)} sandbox="" tabIndex={-1} aria-hidden referrerPolicy="no-referrer"
          style={{ width: 1280, height: 800, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0", pointerEvents: "none", position: "absolute", inset: 0 }}
        />
      )}
    </div>
  );
}

/** The page filling the screen (Kezie, 2026-10-17: "a button that will make it full screen"). */
export function SiteFullscreen({ html, title, onClose }: { html: string; title: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.fullscreenElement) onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); };
  }, [onClose]);
  return createPortal(
    <div ref={box} role="dialog" aria-modal="true" aria-label={`${title}, full screen`} className="studio fixed inset-0 z-[90] flex flex-col" style={{ background: "#07080a" }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ color: "#d6d8dd" }}>
        <b className="text-[13px] truncate min-w-0">{title}</b>
        <div className="flex-1" />
        <div className="flex gap-1" role="group" aria-label="Preview size">
          <button className="s-chip" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Laptop className="h-3.5 w-3.5 inline -mt-0.5" /> Desktop</button>
          <button className="s-chip" aria-pressed={device === "phone"} onClick={() => setDevice("phone")}><Smartphone className="h-3.5 w-3.5 inline -mt-0.5" /> Phone</button>
        </div>
        <button type="button" className="s-btn ghost sm" style={{ color: "#fff" }} aria-label="Fill the screen" title="Fill the screen"
          onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void box.current?.requestFullscreen?.().catch(() => {}); }}><Maximize2 className="h-4 w-4" /></button>
        <button type="button" className="s-btn ghost sm" style={{ color: "#fff" }} onClick={onClose} aria-label="Close full screen"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 min-h-0 px-2 pb-2"><SitePreview html={html} device={device} title="Website full screen" /></div>
    </div>,
    document.body,
  );
}
