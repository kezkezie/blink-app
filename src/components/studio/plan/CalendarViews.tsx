"use client";

import { useEffect, useMemo, useRef } from "react";
import { Clock, MessageCircle } from "lucide-react";
import { MediaThumb, cleanCaption, resolveMedia } from "@/components/studio/media";
import { PlatformGlyph } from "./PlatformGlyph";
import { enabledPlatforms, postState, type CalRow, type PostState } from "./schedule";
import { BLOCK_MIN, HOUR_PX, hhmm, keyOf, lanes, startOfDay, timeFromY, topFor } from "./calendar-time";

/**
 * The calendar's three views (2026-10-27 redesign). Kezie's picks: a dark week grid with a "now"
 * line and picture blocks (Metafy's live sessions), and an Apple TV agenda with day chips and one
 * card lit up. The parent keeps the data, the side panel and every action; these only draw and
 * report what was touched.
 */

export const toneColor = (t: PostState["tone"]) => (t === "ok" ? "var(--s-ok)" : t === "warn" ? "var(--s-warn)" : t === "danger" ? "var(--s-danger)" : "var(--s-mute)");
const thumb = (p: CalRow) => { const m = resolveMedia(p); return <MediaThumb url={m.url} isVideo={m.isVideo} poster={m.poster} />; };
const titleOf = (p: CalRow) => cleanCaption(p.caption_short || p.caption).split("\n")[0] || "Untitled post";
export const movable = (p: CalRow) => p.status !== "posted" && (!p.scheduled_at || new Date(p.scheduled_at).getTime() > Date.now());
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Common = {
  byDay: Map<string, CalRow[]>;
  now: Date;
  dragId: string | null;
  openCard: (p: CalRow, el: HTMLElement) => void;
  cardId: string | null;
  dragProps: (p: CalRow, enabled?: boolean) => Record<string, unknown>;
};

/* ---------- Week: a time grid, posts as picture blocks, a line at "now" ---------- */

export function WeekView({ days, byDay, now, dragId, openCard, cardId, dragProps, slot, pickSlot, overAt, setOverAt, dropAt, selectDay }: Common & {
  days: Date[];
  slot: Date | null;
  pickSlot: (at: Date) => void;
  overAt: Date | null;
  setOverAt: (d: Date | null) => void;
  dropAt: (e: React.DragEvent, at: Date) => void;
  selectDay: (d: Date) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const today = keyOf(now);
  const weekKey = keyOf(days[0]);
  // Open where it matters, like a calendar app: a little before now when today is in view, else an
  // hour before the week's first post, else the morning.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const t = new Date();
    const first = days.flatMap((d) => byDay.get(keyOf(d)) ?? []).map((p) => new Date(p.scheduled_at!)).sort((a, b) => a.getTime() - b.getTime())[0];
    const hour = days.some((d) => keyOf(d) === keyOf(t)) ? t.getHours() + t.getMinutes() / 60 - 3 : first ? first.getHours() - 1 : 8;
    el.scrollTop = Math.max(0, Math.min(17, hour)) * HOUR_PX - 10;
    // Only when the week changes, not on every reload of its posts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey]);
  const yIn = (e: React.MouseEvent | React.DragEvent) => e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;

  return (
    <div className="wk" style={{ ["--hour" as string]: `${HOUR_PX}px` }}>
      <div className="wk-head" role="row">
        <span />
        {days.map((d, i) => {
          const k = keyOf(d);
          const n = (byDay.get(k) ?? []).length;
          return (
            <button key={k} type="button" className={`wk-dow${k === today ? " today" : ""}${d < startOfDay(now) ? " past" : ""}`} onClick={() => selectDay(d)} aria-label={`${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${n} post${n === 1 ? "" : "s"}`}>
              <span className="d">{DOW[i]}</span>
              <span className="n">{d.getDate()}</span>
              {n > 0 && <span className="c">{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="wk-scroll" ref={scroller}>
        <div className="wk-body">
          <div className="wk-hours" aria-hidden>
            {Array.from({ length: 23 }, (_, h) => <span key={h} className="wk-hour" style={{ top: (h + 1) * HOUR_PX }}>{String(h + 1).padStart(2, "0")}:00</span>)}
            {days.some((d) => keyOf(d) === today) && <span className="wk-nowpill" style={{ top: topFor(now) }}>{hhmm(now)}</span>}
          </div>
          {days.map((d) => {
            const k = keyOf(d);
            const posts = (byDay.get(k) ?? []).filter((p) => p.scheduled_at);
            const lane = lanes(posts.map((p) => ({ id: p.id, at: new Date(p.scheduled_at!) })));
            const isToday = k === today, isPast = d < startOfDay(now);
            return (
              <div key={k} className={`wk-col${overAt && keyOf(overAt) === k ? " over" : ""}`} role="gridcell" aria-label={d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                onClick={(e) => { if (e.target === e.currentTarget) pickSlot(timeFromY(d, yIn(e))); }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; const at = timeFromY(d, yIn(e)); if (!overAt || overAt.getTime() !== at.getTime()) setOverAt(at); }}
                onDragLeave={(e) => { if (e.target === e.currentTarget) setOverAt(null); }}
                onDrop={(e) => dropAt(e, timeFromY(d, yIn(e)))}>
                {(isPast || isToday) && <span className="wk-past" style={{ height: isPast ? "100%" : topFor(now) }} />}
                {isToday && <span className="wk-now" style={{ top: topFor(now) }} />}
                {overAt && keyOf(overAt) === k && <span className="wk-slot" style={{ top: topFor(overAt) }}>{hhmm(overAt)}</span>}
                {slot && keyOf(slot) === k && <span className="wk-slot picked" style={{ top: topFor(slot) }}>{hhmm(slot)} · pick a post</span>}
                {posts.map((p) => {
                  const at = new Date(p.scheduled_at!);
                  const st = postState(p);
                  const l = lane.get(p.id) ?? { lane: 0, of: 1 };
                  const plats = enabledPlatforms(p.target_platforms);
                  return (
                    <button key={p.id} type="button"
                      className={`wk-block${l.of > 1 ? " narrow" : ""}${p.status === "posted" || at < now ? " done" : ""}${cardId === p.id ? " sel" : ""}${dragId === p.id ? " drag" : ""}`}
                      style={{ top: topFor(at), height: (BLOCK_MIN / 60) * HOUR_PX - 3, left: `calc(${(l.lane / l.of) * 100}% + 3px)`, width: `calc(${100 / l.of}% - 6px)`, ["--tone" as string]: toneColor(st.tone) }}
                      title={`${cleanCaption(p.caption) || "Post"} · ${st.label}`}
                      onClick={(e) => openCard(p, e.currentTarget)} {...dragProps(p, movable(p))}>
                      <span className="th">{thumb(p)}</span>
                      <span className="min-w-0 grid">
                        <span className="t">{hhmm(at)}{plats.length > 0 && <span className="p">{plats.slice(0, 3).map((x) => <PlatformGlyph key={x} platform={x} size={10} />)}</span>}</span>
                        <span className="c">{titleOf(p)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- Month: the familiar grid, with pictures ---------- */

export function MonthView({ days, month, byDay, now, dragId, openCard, cardId, dragProps, selected, selectDay, over, setOver, dropDay }: Common & {
  days: Date[];
  month: number;
  selected: string | null;
  selectDay: (d: Date) => void;
  over: string | null;
  setOver: (k: string | null) => void;
  dropDay: (e: React.DragEvent, d: Date) => void;
}) {
  const today = startOfDay(now);
  return (
    <div className="cal-grid" role="grid">
      {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
      {days.map((d) => {
        const k = keyOf(d);
        const posts = byDay.get(k) ?? [];
        const cls = ["cal-day", d.getMonth() !== month && "out", d < today && "past", k === keyOf(today) && "today", selected === k && "sel", over === k && "over"].filter(Boolean).join(" ");
        return (
          <div key={k} role="gridcell" tabIndex={0} className={cls}
            aria-label={`${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${posts.length} post${posts.length === 1 ? "" : "s"}`}
            onClick={() => selectDay(d)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectDay(d); } }}
            onDragOver={(e) => { if (d >= today) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== k) setOver(k); } }}
            onDragLeave={() => setOver(over === k ? null : over)}
            onDrop={(e) => dropDay(e, d)}>
            <span className="cal-n">{d.getDate()}</span>
            {posts.slice(0, 3).map((p) => {
              const st = postState(p);
              return (
                <div key={p.id} className={`cal-chip${dragId === p.id ? " drag" : ""}${cardId === p.id ? " sel" : ""}`} {...dragProps(p, movable(p))} title={`${cleanCaption(p.caption) || "Post"} · ${st.label}`}
                  style={{ ["--tone" as string]: toneColor(st.tone) }}
                  onClick={(e) => { e.stopPropagation(); openCard(p, e.currentTarget); }}>
                  <span className="th">{thumb(p)}</span>
                  <span className="t">{hhmm(new Date(p.scheduled_at!))}</span>
                  <span className="p">{enabledPlatforms(p.target_platforms).slice(0, 2).map((x) => <PlatformGlyph key={x} platform={x} size={11} />)}</span>
                </div>
              );
            })}
            {posts.length > 3 && <span className="cal-more">+{posts.length - 3} more</span>}
            {posts.length > 0 && <span className="cal-dots">{posts.slice(0, 4).map((p) => <span key={p.id} className="cal-dot" style={{ background: toneColor(postState(p).tone) }} />)}</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- List: day chips, and cards with the next one lit up ---------- */

export function ListView({ days, byDay, now, openCard, cardId, selected, selectDay, onPlan }: Omit<Common, "dragId" | "dragProps"> & {
  days: Date[];
  selected: string | null;
  selectDay: (d: Date) => void;
  onPlan: () => void;
}) {
  const groups = useRef(new Map<string, HTMLDivElement | null>());
  const withPosts = useMemo(() => days.filter((d) => (byDay.get(keyOf(d)) ?? []).length), [days, byDay]);
  // The next post to go out: the one lit up, like the selected card on the Apple TV.
  const next = useMemo(() => withPosts.flatMap((d) => byDay.get(keyOf(d)) ?? []).find((p) => p.status !== "posted" && new Date(p.scheduled_at!) > now)?.id ?? null, [withPosts, byDay, now]);
  const today = keyOf(now);
  const pick = (d: Date) => { selectDay(d); groups.current.get(keyOf(d))?.scrollIntoView({ behavior: "smooth", block: "nearest" }); };

  return (
    <div className="ag">
      <div className="ag-strip" role="group" aria-label="Days">
        {days.map((d) => {
          const k = keyOf(d), n = (byDay.get(k) ?? []).length;
          return (
            <button key={k} type="button" className={`ag-day${selected === k ? " on" : ""}${k === today ? " today" : ""}`} aria-pressed={selected === k} onClick={() => pick(d)} aria-label={`${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${n} post${n === 1 ? "" : "s"}`}>
              <span className="n">{d.getDate()}</span>
              <span className="d">{d.toLocaleDateString("en-GB", { weekday: "short" })}</span>
              {n > 0 && <span className="dot" />}
            </button>
          );
        })}
      </div>
      {withPosts.length === 0 ? (
        <div className="ag-empty">
          <b className="text-[15px]">Nothing planned in these four weeks</b>
          <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>Put a ready post on a day, or let Ask BlinkSpot spread them out at good times.</p>
          <button type="button" className="s-btn sm justify-self-center" onClick={onPlan}><MessageCircle className="h-3.5 w-3.5" style={{ color: "var(--s-ai)" }} /> Ask BlinkSpot to plan them</button>
        </div>
      ) : (
        <div className="ag-list">
          {withPosts.map((d) => {
            const k = keyOf(d);
            return (
              <div key={k} ref={(el) => { groups.current.set(k, el); }} className={`grid gap-2${selected === k ? " ag-sel" : ""}`}>
                <div className="ag-group">{k === today ? "Today" : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
                {(byDay.get(k) ?? []).map((p) => {
                  const st = postState(p);
                  const plats = enabledPlatforms(p.target_platforms);
                  return (
                    <button key={p.id} type="button" className={`ag-card${p.id === next ? " next" : ""}${cardId === p.id ? " sel" : ""}`} title={`${cleanCaption(p.caption) || "Post"} · ${st.label}`} onClick={(e) => openCard(p, e.currentTarget)}>
                      <span className="th">{thumb(p)}</span>
                      <span className="min-w-0 grid gap-0.5">
                        <span className="title"><span className="dot" style={{ background: toneColor(st.tone) }} /><span className="truncate">{titleOf(p)}</span></span>
                        <span className="sub">{st.label}{plats.length ? " · " : ""}{plats.map((x) => <PlatformGlyph key={x} platform={x} size={11} />)}</span>
                      </span>
                      <span className="when"><Clock className="h-3.5 w-3.5" />{hhmm(new Date(p.scheduled_at!))}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
