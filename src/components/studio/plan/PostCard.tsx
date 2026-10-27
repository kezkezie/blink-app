"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Clock, ExternalLink, Loader2, Send, X } from "lucide-react";
import { MediaThumb, cleanCaption, resolveMedia } from "@/components/studio/media";
import { PlatformGlyph } from "./PlatformGlyph";
import { PLATFORM_LABEL, enabledPlatforms, postState, type CalRow } from "./schedule";
import { movable, toneColor } from "./CalendarViews";

/**
 * A post on the calendar, opened (2026-10-27, like the session card in Kezie's Metafy pick): its
 * picture across the top, where it stands, when it goes, where to, and what you can do with it.
 * Floats next to what was tapped; a sheet from the bottom on phones (the parent decides).
 */
export function PostCard({ post, at, busy, confirmOff, setConfirmOff, onTime, onPlatforms, onRemove, onClose, sheet = false }: {
  post: CalRow;
  at: { x: number; y: number } | null;
  busy: boolean;
  confirmOff: boolean;
  setConfirmOff: (v: boolean) => void;
  onTime: () => void;
  onPlatforms: () => void;
  onRemove: (evenIfPosted: boolean) => void;
  onClose: () => void;
  sheet?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const m = resolveMedia(post);
  const st = postState(post);
  const plats = enabledPlatforms(post.target_platforms);
  const when = post.scheduled_at ? new Date(post.scheduled_at) : null;
  const editable = movable(post) && !!when;

  useEffect(() => {
    if (sheet) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (ref.current?.contains(t) || t?.closest(".wk-block, .cal-chip, .ag-card, [role='dialog']")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose, sheet]);

  const day = when ? when.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "";
  const time = when ? when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
  // "Today at 10:00", like the session card ("Today at 3:00pm").
  const daysAway = when ? Math.round((new Date(when).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000) : 0;
  const dayWord = !when ? "" : daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : daysAway === -1 ? "Yesterday" : when.toLocaleDateString("en-GB", { weekday: "long" });
  return (
    <div ref={ref} className={sheet ? "pc pc-sheet" : "pc"} style={at && !sheet ? { left: at.x, top: at.y } : undefined} role="dialog" aria-label="Post on the calendar">
      <div className="pc-media">
        <MediaThumb url={m.url} isVideo={m.isVideo} poster={m.poster} />
        <span className="pc-badge" style={{ color: toneColor(st.tone), background: `color-mix(in oklab, ${toneColor(st.tone)} 18%, rgba(12,13,15,.78))` }}>{st.label}</span>
        <button type="button" className="pc-close" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="pc-body">
        <div>
          <b className="text-[17px] block leading-tight">{when ? `${dayWord} at ${time}` : "Not on the calendar"}</b>
          <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{day}</span>
        </div>
        <p className="text-[13px] leading-snug line-clamp-3" style={{ color: post.caption ? "var(--s-soft)" : "var(--s-mute)" }}>{cleanCaption(post.caption) || "No caption yet"}</p>
        <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--s-mute)" }}>
          {plats.length ? <>{plats.map((x) => <span key={x} className="pc-plat"><PlatformGlyph platform={x} size={12} />{PLATFORM_LABEL[x] ?? x}</span>)}</> : <span style={{ color: "var(--s-warn)" }}>No platforms picked: it won&apos;t post.</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {editable && <button className="s-btn sm" disabled={busy} onClick={onTime}><Clock className="h-3.5 w-3.5" /> Time</button>}
          {editable && <button className={`s-btn sm${plats.length ? "" : " primary"}`} disabled={busy} onClick={onPlatforms}><Send className="h-3.5 w-3.5" /> {plats.length ? "Platforms" : "Pick platforms"}</button>}
          {editable
            ? <button className="s-btn ghost sm" disabled={busy} onClick={() => onRemove(false)}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Remove</button>
            : <button className="s-btn ghost sm" disabled={busy} onClick={() => setConfirmOff(!confirmOff)} aria-expanded={confirmOff}><X className="h-3.5 w-3.5" /> Remove</button>}
          <Link href={`/studio/library/${post.id}`} className="s-btn ghost sm ml-auto"><ExternalLink className="h-3.5 w-3.5" /> Open</Link>
        </div>
        {confirmOff && (
          <div className="rounded-lg p-2.5 grid gap-2 text-[12px]" role="alertdialog" aria-label="Remove from the calendar" style={{ background: "color-mix(in oklab, var(--s-danger) 8%, transparent)", border: "1px solid color-mix(in oklab, var(--s-danger) 30%, var(--s-line))", color: "var(--s-soft)" }}>
            <span>{st.label === "Not sent" ? "This one didn't go out." : `This one already went out${plats.length ? ` to ${plats.map((x) => PLATFORM_LABEL[x] ?? x).join(", ")}` : ""}.`} Removing it takes it off your calendar; {st.label === "Not sent" ? "it stays in your Library." : "it stays on the platform (delete it there if you want it gone) and in your Library."}</span>
            <div className="flex gap-1.5">
              <button className="s-btn sm" style={{ color: "var(--s-danger)" }} disabled={busy} onClick={() => onRemove(true)}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Remove from the calendar</button>
              <button className="s-btn ghost sm" onClick={() => setConfirmOff(false)}>Keep it</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
