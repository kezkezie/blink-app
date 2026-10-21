"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * The studio's dialog. Rendered into <body>: the top bar uses backdrop-filter, which turns any
 * `position: fixed` child into a child of the 56 px bar, so dialogs opened from it (Manage brands)
 * only covered the bar and could only be closed by clicking it (Kezie, 2026-10-11).
 * Click outside or press Esc to close; with one dialog over another, Esc closes only the top one. <body> carries .studio while the studio is open, so the
 * theme still applies.
 */
export function Modal({
  open, onClose, label, children, width = 560, className = "", padded = false,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  width?: number;
  className?: string;
  padded?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (box.current && dialogs.length && dialogs[dialogs.length - 1] !== box.current) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  // Dialogs open after a click, never during the server render, so document is always there.
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-3 md:p-6 s-modal-backdrop" style={{ background: "rgba(0,0,0,.62)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={label} className={`s-card w-full max-h-[90dvh] overflow-y-auto shadow-2xl ${padded ? "p-4" : ""} ${className}`} style={{ maxWidth: width }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Just the backdrop, rendered into <body>, for dialogs that bring their own card. */
export function Overlay({ onClose, children, dim = 0.62 }: { onClose: () => void; children: React.ReactNode; dim?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-3 md:p-6" style={{ background: `rgba(0,0,0,${dim})` }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {children}
    </div>,
    document.body,
  );
}
