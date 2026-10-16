"use client";

import { useEffect, useRef, useState } from "react";
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
