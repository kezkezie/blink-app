"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, ExternalLink, Loader2, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useAskStore } from "@/components/studio/ask-store";
import { Modal } from "@/components/studio/Modal";
import { MediaThumb, NOT_STORYBOARD_FRAME, PART_TYPES, STATUS_LABEL, cleanCaption, resolveMedia } from "@/components/studio/media";
import { BetaTag } from "@/components/studio/AutoPostBeta";
import { useKept } from "@/lib/drafts";
import { PlatformGlyph } from "./PlatformGlyph";
import { VIDEO_ONLY, VIDEO_ONLY_LINE } from "@/lib/social-media-rules";
import { PLATFORM_LABEL, enabledPlatforms, placeOnCalendar, postState, savePlatforms, takeOffCalendar, toLocalInput, whenLabel, type CalRow, type PlaceResult } from "./schedule";
import { daysOf, fromKey, hhmm, keyOf, rangeLabel, shift, startOfDay, type CalView } from "./calendar-time";
import { ListView, MonthView, WeekView, movable, toneColor } from "./CalendarViews";
import { PostCard } from "./PostCard";
import "./calendar.css";
import { CalendarSkeleton } from "@/components/studio/Skeletons";

/**
 * The calendar in the studio look (2026-10-11; the classic one stays at /dashboard/calendar),
 * redesigned 2026-10-27 from Kezie's two picks: a header with the time and date, Week (a time grid
 * with a "now" line and picture blocks), Month and List (day chips, the next post lit up). Tap a post
 * for its card; tap an empty time in Week, then a ready post, to put it there (drag works too, but
 * not on an iPad). A post's state is shown honestly: queued with PostForMe, on the calendar but not
 * queued (pick platforms, or the queueing failed), or already sent. Auto-posting is in beta.
 */

const COLS = "id, client_id, brand_id, caption, caption_short, content_type, status, image_urls, video_urls, reference_image_url, scheduled_at, target_platforms, postforme_tracking_id, created_at";
const VIEWS: Array<{ id: CalView; label: string }> = [{ id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "list", label: "List" }];

/** Where a post dropped on `day` lands: its own time of day, else 10:00; never in the past. */
function timeOnDay(day: Date, existing?: string | null) {
  const d = new Date(day);
  if (existing) { const e = new Date(existing); d.setHours(e.getHours(), e.getMinutes(), 0, 0); } else d.setHours(10, 0, 0, 0);
  if (d.getTime() < Date.now() + 10 * 60_000) {
    const soon = new Date(Date.now() + 30 * 60_000);
    soon.setMinutes(Math.ceil(soon.getMinutes() / 5) * 5, 0, 0);
    if (keyOf(soon) === keyOf(day)) return soon;
  }
  return d;
}

/** The time now, ticking each half minute (the header clock and the week's "now" line). */
function useNow(every = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), every); return () => clearInterval(t); }, [every]);
  return now;
}

export function Calendar() {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const now = useNow();
  const [view, setView] = useKept<CalView>("plan:view", "week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [scheduled, setScheduled] = useState<CalRow[] | null>(null);
  const [ready, setReady] = useState<CalRow[] | null>(null);
  const [readyLimit, setReadyLimit] = useState(24);
  const [moreReady, setMoreReady] = useState(false);
  const [connected, setConnected] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [overAt, setOverAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [whenFor, setWhenFor] = useState<CalRow | null>(null);
  const [whenValue, setWhenValue] = useState("");
  const [platformsFor, setPlatformsFor] = useState<CalRow | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  // Tap-to-place (Week): an empty time picked, waiting for a ready post.
  const [slot, setSlot] = useState<Date | null>(null);
  // The opened post: floating next to it, or a sheet on phones.
  const [card, setCard] = useState<{ id: string; x: number; y: number; sheet: boolean } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLElement>(null);

  const days = useMemo(() => daysOf(view, anchor), [view, anchor]);

  const load = useCallback(async () => {
    if (!activeBrand) return;
    const from = days[0], to = new Date(days[days.length - 1]); to.setDate(to.getDate() + 1);
    const [s, r, a] = await Promise.all([
      supabase.from("content").select(COLS).eq("brand_id", activeBrand.id).not("content_type", "in", `(${PART_TYPES.join(",")})`)
        .gte("scheduled_at", from.toISOString()).lt("scheduled_at", to.toISOString()).order("scheduled_at"),
      supabase.from("content").select(COLS).eq("brand_id", activeBrand.id).is("scheduled_at", null).not("content_type", "in", `(${PART_TYPES.join(",")})`)
        .or(NOT_STORYBOARD_FRAME).in("status", ["draft", "approved", "pending_approval"]).order("created_at", { ascending: false }).limit(readyLimit),
      // Connected platforms without tokens (works in a brand shared with you too).
      supabase.rpc("brand_platforms", { p_brand: activeBrand.id }),
    ]);
    if (s.error || r.error) toast.error("Couldn't load the calendar. Try again.");
    setScheduled((s.data ?? []) as unknown as CalRow[]);
    const rows = (r.data ?? []) as unknown as CalRow[];
    setMoreReady(rows.length === readyLimit);
    setReady(rows.filter((c) => resolveMedia(c).url));
    setConnected([...new Set(((a.data ?? []) as Array<{ platform: string }>).map((x) => String(x.platform).toLowerCase()))]);
  }, [activeBrand, days, readyLimit]);
  useEffect(() => { void load(); }, [load]);
  // Ask BlinkSpot's "Put these on the calendar" fires this when it's done.
  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener("blink:calendar-changed", onChange);
    return () => window.removeEventListener("blink:calendar-changed", onChange);
  }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalRow[]>();
    for (const p of scheduled ?? []) { if (!p.scheduled_at) continue; const k = keyOf(new Date(p.scheduled_at)); m.set(k, [...(m.get(k) ?? []), p]); }
    return m;
  }, [scheduled]);
  const all = useMemo(() => [...(scheduled ?? []), ...(ready ?? [])], [scheduled, ready]);
  const today = startOfDay(now);

  function report(r: PlaceResult, iso: string, item: CalRow) {
    if (!r.ok) { toast.error(r.error || "Couldn't schedule it."); return; }
    const platforms = enabledPlatforms(item.target_platforms);
    const sent = platforms.filter((p) => !(r.note && VIDEO_ONLY.has(p) && !resolveMedia(item).isVideo));
    if (r.queued) toast.success(`Scheduled for ${whenLabel(iso)} on ${sent.map((p) => PLATFORM_LABEL[p] ?? p).join(", ")}.${r.note ? ` ${r.note}` : ""}`, { duration: r.note ? 9000 : 4000 });
    else if (!platforms.length) toast(`On the calendar for ${whenLabel(iso)}. Pick where it posts so it goes out.`, { action: { label: "Pick platforms", onClick: () => openPlatforms({ ...item, scheduled_at: iso }) } });
    else if (r.code === "needs_caption") toast.error(`On the calendar, but not queued: ${r.error}`, { duration: 12000, action: { label: "Write it", onClick: () => { window.location.href = `/studio/library/${item.id}`; } } });
    else toast.error(`On the calendar, but not queued: ${r.error}`, { duration: 9000 });
  }

  async function place(item: CalRow, at: Date) {
    if (!clientId) return;
    if (at.getTime() < Date.now()) { toast.info("That time has passed. Pick a later one."); return; }
    const iso = at.toISOString();
    setBusy(item.id);
    const r = await placeOnCalendar(clientId, item, iso);
    setBusy(null);
    setSlot(null);
    report(r, iso, item);
    await load();
  }
  async function unschedule(item: CalRow, evenIfPosted = false) {
    setBusy(item.id);
    const r = await takeOffCalendar(item.id, evenIfPosted);
    setBusy(null);
    setConfirmOff(null);
    setCard(null);
    if (!r.ok) { toast.error(r.error || "Couldn't take it off the calendar."); return; }
    toast.success(evenIfPosted ? "Taken off the calendar. It's still in your Library, and still on the platform it went to." : "Taken off the calendar. It's back in Ready.");
    await load();
  }
  function openWhen(item: CalRow) { setWhenFor(item); setWhenValue(toLocalInput(item.scheduled_at)); }
  // A picture can't go to YouTube (videos only), so it isn't picked for one.
  function openPlatforms(item: CalRow) { const video = resolveMedia(item).isVideo; setPlatformsFor(item); setPicked(enabledPlatforms(item.target_platforms).filter((p) => connected.includes(p) && (video || !VIDEO_ONLY.has(p)))); }
  async function savePicked() {
    if (!clientId || !platformsFor) return;
    const item = platformsFor;
    setBusy(item.id);
    const r = await savePlatforms(clientId, item, picked);
    setBusy(null);
    setPlatformsFor(null);
    if (!r.ok) toast.error(r.error || "Couldn't save the platforms.");
    else if (item.scheduled_at && r.queued) toast.success(`Queued for ${whenLabel(item.scheduled_at)}.${r.note ? ` ${r.note}` : ""}`, { duration: r.note ? 9000 : 4000 });
    else if (item.scheduled_at && r.error) toast.error(`Saved, but not queued: ${r.error}`, { duration: 9000, ...(r.code === "needs_caption" ? { action: { label: "Write it", onClick: () => { window.location.href = `/studio/library/${item.id}`; } } } : {}) });
    else toast.success("Platforms saved.");
    await load();
  }

  const dragged = (e: React.DragEvent) => { const id = e.dataTransfer.getData("text/blink-post") || dragId; setDragId(null); setOver(null); setOverAt(null); return all.find((p) => p.id === id) ?? null; };
  function dropDay(e: React.DragEvent, day: Date) {
    e.preventDefault();
    const item = dragged(e);
    if (!item) return;
    if (day < today) { toast.info("That day has passed."); return; }
    void place(item, timeOnDay(day, item.scheduled_at));
  }
  function dropAt(e: React.DragEvent, at: Date) {
    e.preventDefault();
    const item = dragged(e);
    if (item) void place(item, at);
  }
  function onDropReady(e: React.DragEvent) {
    e.preventDefault();
    const item = dragged(e);
    if (item && (scheduled ?? []).some((p) => p.id === item.id)) void unschedule(item);
  }
  const dragProps = (p: CalRow, enabled = true) => enabled ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData("text/blink-post", p.id); e.dataTransfer.effectAllowed = "move"; setDragId(p.id); setCard(null); },
    onDragEnd: () => { setDragId(null); setOver(null); setOverAt(null); },
  } : {};

  /** Open a post's card next to what was tapped (inside the calendar), or as a sheet on a phone. */
  const openCard = useCallback((p: CalRow, el: HTMLElement) => {
    setConfirmOff(null);
    const box = wrap.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!box || window.matchMedia("(max-width: 639px)").matches) { setCard({ id: p.id, x: 0, y: 0, sheet: true }); return; }
    const W = 304;
    let x = r.right - box.left + 10;
    if (x + W > box.width) x = r.left - box.left - W - 10;
    if (x < 8) x = Math.max(8, Math.min(box.width - W - 8, r.left - box.left));
    const y = Math.max(8, Math.min(r.top - box.top - 20, Math.max(8, box.height - 420)));
    setCard((c) => (c?.id === p.id ? null : { id: p.id, x, y, sheet: false }));
  }, []);
  const closeCard = useCallback(() => { setCard(null); setConfirmOff(null); }, []);

  function pickSlot(at: Date) {
    setCard(null);
    if (at.getTime() < Date.now() + 5 * 60_000) { toast.info("That time has passed. Pick a later one."); return; }
    setSelected(null);
    setSlot(at);
    if (window.matchMedia("(max-width: 1099px)").matches) side.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function selectDay(d: Date) { setSlot(null); setCard(null); setSelected(keyOf(d)); }
  function go(by: 1 | -1) { setCard(null); setAnchor((a) => shift(view, a, by)); }
  function goToday() { setCard(null); const d = startOfDay(new Date()); setAnchor(d); setSelected(keyOf(d)); }

  if (!activeBrand) return <div className="s-empty"><h3>No brand open</h3><p className="text-[13px]">Pick a brand in the top bar to see its calendar.</p></div>;
  if (!scheduled || !ready) return <CalendarSkeleton />;

  const range = rangeLabel(view, anchor);
  const shown = scheduled.filter((p) => p.scheduled_at && (view !== "month" || new Date(p.scheduled_at).getMonth() === anchor.getMonth()));
  const queued = shown.filter((p) => postState(p).label === "Queued").length;
  const needs = shown.filter((p) => ["Pick platforms", "Not queued"].includes(postState(p).label)).length;
  const selectedPosts = selected ? byDay.get(selected) ?? [] : [];
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })();
  const draggingScheduled = !!dragId && scheduled.some((p) => p.id === dragId);
  const opened = card ? scheduled.find((p) => p.id === card.id) ?? null : null;
  const unit = view === "week" ? "this week" : view === "month" ? "this month" : "in these four weeks";

  // A plain call (not a component defined in render), so thumbnails aren't remounted on every render.
  const thumb = (p: CalRow) => { const m = resolveMedia(p); return <MediaThumb url={m.url} isVideo={m.isVideo} poster={m.poster} />; };
  const common = { byDay, now, dragId, openCard, cardId: card?.id ?? null, dragProps };

  return (
    <div className="cal">
      <div className="s-card overflow-hidden relative calx" ref={wrap}>
        <div className="calx-head">
          <div className="grid gap-0.5 min-w-0">
            <span className="calx-clock" aria-label={`It's ${hhmm(now)}`}>{hhmm(now)}</span>
            <span className="calx-date">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}{tz ? <span className="mono"> · {tz}</span> : null}</span>
          </div>
          <div className="flex-1" />
          <div className="grid gap-2 justify-items-start sm:justify-items-end">
            <div className="s-seg calx-seg" role="group" aria-label="View">
              {VIEWS.map((v) => <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => { setCard(null); setSlot(null); setView(v.id); }}>{v.label}</button>)}
            </div>
            <div className="flex items-center gap-1.5">
              <button className="s-btn sm" onClick={goToday}>Today</button>
              <button className="s-btn ghost sm" style={{ width: 28, padding: 0 }} onClick={() => go(-1)} aria-label={`Previous ${view === "list" ? "weeks" : view}`}><ChevronLeft className="h-4 w-4" /></button>
              <button className="s-btn ghost sm" style={{ width: 28, padding: 0 }} onClick={() => go(1)} aria-label={`Next ${view === "list" ? "weeks" : view}`}><ChevronRight className="h-4 w-4" /></button>
              <h2 className="text-[15px] font-semibold ml-1 whitespace-nowrap">{range}</h2>
            </div>
          </div>
        </div>
        <div className="calx-sub">
          <span><b>{shown.length}</b> {unit}</span>
          {queued > 0 && <span className="flex items-center gap-1"><span className="cal-dot" style={{ background: "var(--s-ok)" }} /><b>{queued}</b> queued</span>}
          {needs > 0 && <span className="flex items-center gap-1"><span className="cal-dot" style={{ background: "var(--s-warn)" }} /><b>{needs}</b> need{needs === 1 ? "s" : ""} platforms</span>}
          <span className="flex-1" />
          <span className="flex items-center gap-1.5">Auto-posting <BetaTag /></span>
        </div>

        {view === "week" && <WeekView {...common} days={days} slot={slot} pickSlot={pickSlot} overAt={overAt} setOverAt={setOverAt} dropAt={dropAt} selectDay={selectDay} />}
        {view === "month" && <MonthView {...common} days={days} month={anchor.getMonth()} selected={selected} selectDay={selectDay} over={over} setOver={setOver} dropDay={dropDay} />}
        {view === "list" && <ListView byDay={byDay} now={now} openCard={openCard} cardId={card?.id ?? null} days={days} selected={selected} selectDay={selectDay} onPlan={() => useAskStore.getState().ask("Plan my ready posts on the calendar for the next two weeks, at the best times for my audience")} />}

        {opened && card && !card.sheet && (
          <PostCard post={opened} at={card} busy={busy === opened.id} confirmOff={confirmOff === opened.id} setConfirmOff={(v) => setConfirmOff(v ? opened.id : null)}
            onTime={() => { closeCard(); openWhen(opened); }} onPlatforms={() => { closeCard(); openPlatforms(opened); }} onRemove={(even) => void unschedule(opened, even)} onClose={closeCard} />
        )}
      </div>

      <aside ref={side}
        className={`s-card cal-side${draggingScheduled && !selected ? " drop" : ""}`}
        onDragOver={(e) => { if (draggingScheduled && !selected) e.preventDefault(); }}
        onDrop={(e) => { if (!selected) onDropReady(e); }}
      >
        {slot ? (
          <>
            <div className="p-4 grid gap-1" style={{ borderBottom: "1px solid var(--s-line)" }}>
              <button className="s-btn ghost sm justify-self-start -ml-2" onClick={() => setSlot(null)}><X className="h-3.5 w-3.5" /> Cancel</button>
              <b className="text-[15px]">Put a post at {whenLabel(slot.toISOString())}</b>
              <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{ready.length ? "Pick one of your ready posts." : "Nothing ready yet. Make something, then come back."}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 grid gap-2 content-start" role="list" aria-label="Ready posts">
              {ready.map((p) => (
                <div key={p.id} role="listitem" className="cal-ready">
                  <div className="th">{thumb(p)}</div>
                  <div className="min-w-0 grid gap-1 content-start">
                    <p className="text-[12.5px] leading-snug line-clamp-2" style={{ color: p.caption ? "var(--s-text)" : "var(--s-mute)" }}>{cleanCaption(p.caption) || "No caption yet"}</p>
                    <button className="s-btn primary sm justify-self-start" style={{ height: 26 }} disabled={busy === p.id} onClick={() => void place(p, slot)}>{busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3 w-3" />} Put it at {hhmm(slot)}</button>
                  </div>
                </div>
              ))}
              {ready.length === 0 && <Link href="/studio" className="s-btn sm justify-self-center mt-2">Create</Link>}
            </div>
          </>
        ) : selected ? (
          <>
            <div className="p-4 grid gap-1" style={{ borderBottom: "1px solid var(--s-line)" }}>
              <button className="s-btn ghost sm justify-self-start -ml-2" onClick={() => setSelected(null)}><ArrowLeft className="h-3.5 w-3.5" /> Ready to schedule</button>
              <b className="text-[15px]">{fromKey(selected).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</b>
              <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{selectedPosts.length ? `${selectedPosts.length} post${selectedPosts.length === 1 ? "" : "s"}` : fromKey(selected) < today ? "Nothing went out this day." : "Nothing yet. Drag a post here, or press Schedule on one."}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 grid gap-2 content-start">
              {selectedPosts.map((p) => {
                const st = postState(p);
                const editable = movable(p) && !!p.scheduled_at;
                const plats = enabledPlatforms(p.target_platforms);
                return (
                  <div key={p.id} className="rounded-xl p-2.5 grid gap-2" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)" }} {...dragProps(p, editable)}>
                    <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2.5">
                      <div className="relative h-[52px] w-[52px] rounded-lg overflow-hidden bg-black [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_video]:h-full [&_video]:w-full [&_video]:object-cover">{thumb(p)}</div>
                      <div className="min-w-0 grid gap-1 content-start">
                        <div className="flex items-center gap-1.5">
                          <span className="mono text-[12px]">{hhmm(new Date(p.scheduled_at!))}</span>
                          <span className="s-badge" style={{ color: toneColor(st.tone), background: `color-mix(in oklab, ${toneColor(st.tone)} 14%, transparent)` }}>{st.label}</span>
                        </div>
                        <p className="text-[12.5px] leading-snug line-clamp-2" style={{ color: p.caption ? "var(--s-text)" : "var(--s-mute)" }}>{cleanCaption(p.caption) || "No caption yet"}</p>
                        {plats.length > 0 && <span className="flex gap-1.5" style={{ color: "var(--s-mute)" }}>{plats.map((x) => <PlatformGlyph key={x} platform={x} />)}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {editable && <button className="s-btn sm" disabled={busy === p.id} onClick={() => openWhen(p)}><Clock className="h-3.5 w-3.5" /> Time</button>}
                      {editable && <button className={`s-btn sm${plats.length ? "" : " primary"}`} disabled={busy === p.id} onClick={() => openPlatforms(p)}><Send className="h-3.5 w-3.5" /> {plats.length ? "Platforms" : "Pick platforms"}</button>}
                      {editable
                        ? <button className="s-btn ghost sm" disabled={busy === p.id} onClick={() => unschedule(p)}>{busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Remove</button>
                        : <button className="s-btn ghost sm" disabled={busy === p.id} onClick={() => setConfirmOff(confirmOff === p.id ? null : p.id)} aria-expanded={confirmOff === p.id}><X className="h-3.5 w-3.5" /> Remove</button>}
                      <Link href={`/studio/library/${p.id}`} className="s-btn ghost sm ml-auto"><ExternalLink className="h-3.5 w-3.5" /> Open</Link>
                    </div>
                    {confirmOff === p.id && (
                      <div className="rounded-lg p-2.5 grid gap-2 text-[12px]" role="alertdialog" aria-label="Remove from the calendar" style={{ background: "color-mix(in oklab, var(--s-danger) 8%, transparent)", border: "1px solid color-mix(in oklab, var(--s-danger) 30%, var(--s-line))", color: "var(--s-soft)" }}>
                        <span>{st.label === "Not sent" ? "This one didn't go out." : `This one already went out${plats.length ? ` to ${plats.map((x) => PLATFORM_LABEL[x] ?? x).join(", ")}` : ""}.`} Removing it takes it off your calendar; {st.label === "Not sent" ? "it stays in your Library." : "it stays on the platform (delete it there if you want it gone) and in your Library."}</span>
                        <div className="flex gap-1.5">
                          <button className="s-btn sm" style={{ color: "var(--s-danger)" }} disabled={busy === p.id} onClick={() => unschedule(p, true)}>{busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Remove from the calendar</button>
                          <button className="s-btn ghost sm" onClick={() => setConfirmOff(null)}>Keep it</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="p-4 grid gap-1" style={{ borderBottom: "1px solid var(--s-line)" }}>
              <div className="flex items-center gap-2"><b className="text-[15px]">Ready to schedule</b><span className="s-badge">{ready.length}{moreReady ? "+" : ""}</span></div>
              <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{draggingScheduled ? "Drop here to take it off the calendar." : view === "week" ? "Drag a post onto a time, tap a time then a post, or press Schedule." : "Drag a post onto a day, or press Schedule."}</span>
              <button className="s-btn ghost sm justify-self-start -ml-2 mt-1" onClick={() => useAskStore.getState().ask("Plan my ready posts on the calendar for the next two weeks, at the best times for my audience")}>
                <MessageCircle className="h-3.5 w-3.5" style={{ color: "var(--s-ai)" }} /> Ask BlinkSpot to plan them
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 grid gap-2 content-start">
              {ready.length === 0 ? (
                <div className="text-center py-10 px-4 grid gap-2">
                  <b className="text-[14px]">Nothing waiting</b>
                  <p className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>Everything you&apos;ve made is on the calendar. Make something new and it shows up here.</p>
                  <Link href="/studio" className="s-btn sm justify-self-center mt-1">Create</Link>
                </div>
              ) : ready.map((p) => {
                const status = STATUS_LABEL[p.status] ?? { label: p.status };
                const plats = enabledPlatforms(p.target_platforms);
                return (
                  <div key={p.id} className={`cal-ready${dragId === p.id ? " opacity-40" : ""}`} {...dragProps(p)}>
                    <div className="th">{thumb(p)}</div>
                    <div className="min-w-0 grid gap-1 content-start">
                      <p className="text-[12.5px] leading-snug line-clamp-2" style={{ color: p.caption ? "var(--s-text)" : "var(--s-mute)" }}>{cleanCaption(p.caption) || "No caption yet"}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`s-badge ${status.tone ?? ""}`}>{status.label}</span>
                        {plats.map((x) => <span key={x} style={{ color: "var(--s-mute)" }}><PlatformGlyph platform={x} /></span>)}
                        <button className="s-btn sm ml-auto" style={{ height: 24 }} disabled={busy === p.id} onClick={() => openWhen(p)}>{busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3 w-3" />} Schedule</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {moreReady && <button className="s-btn sm justify-self-center" onClick={() => setReadyLimit((n) => n + 24)}>Show more</button>}
            </div>
          </>
        )}
      </aside>

      <Modal open={!!(opened && card?.sheet)} onClose={closeCard} label="Post on the calendar" width={420}>
        {opened && card?.sheet && (
          <PostCard sheet post={opened} at={null} busy={busy === opened.id} confirmOff={confirmOff === opened.id} setConfirmOff={(v) => setConfirmOff(v ? opened.id : null)}
            onTime={() => { closeCard(); openWhen(opened); }} onPlatforms={() => { closeCard(); openPlatforms(opened); }} onRemove={(even) => void unschedule(opened, even)} onClose={closeCard} />
        )}
      </Modal>

      <Modal open={!!whenFor} onClose={() => setWhenFor(null)} label="Pick a date and time" width={420} padded>
        <div className="flex items-center justify-between mb-3"><b className="text-sm">When should it go out?</b><button className="s-btn ghost sm" onClick={() => setWhenFor(null)} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <input type="datetime-local" className="s-input" value={whenValue} min={toLocalInput(new Date(Date.now() + 10 * 60_000).toISOString())} onChange={(e) => setWhenValue(e.target.value)} aria-label="Date and time" style={{ colorScheme: "dark" }} />
        {whenFor && !enabledPlatforms(whenFor.target_platforms).length && <p className="text-[12px] mt-2" style={{ color: "var(--s-warn)" }}>This post has no platforms yet. It goes on the calendar; pick platforms so it actually posts.</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button className="s-btn ghost sm" onClick={() => setWhenFor(null)}>Cancel</button>
          <button className="s-btn primary sm" disabled={!whenValue} onClick={() => { const item = whenFor!; setWhenFor(null); void place(item, new Date(whenValue)); }}>Schedule</button>
        </div>
      </Modal>

      <Modal open={!!platformsFor} onClose={() => setPlatformsFor(null)} label="Where it posts" width={440} padded>
        <div className="flex items-center justify-between mb-1"><b className="text-sm flex items-center gap-2">Where should it post? <BetaTag /></b><button className="s-btn ghost sm" onClick={() => setPlatformsFor(null)} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <p className="text-[12px] mb-3" style={{ color: "var(--s-mute)" }}>Accounts connected to {activeBrand.brand_name}.</p>
        {connected.length === 0 ? (
          <div className="s-empty" style={{ padding: "24px 16px" }}><p className="text-[13px]">No social accounts connected for this brand yet.</p><Link href="/studio/account/settings" className="s-btn sm mt-3">Connect accounts</Link></div>
        ) : (
          <div className="grid gap-2">
            {connected.map((p) => {
              const on = picked.includes(p);
              const videosOnly = VIDEO_ONLY.has(p) && !!platformsFor && !resolveMedia(platformsFor).isVideo;
              return (
                <button key={p} role="checkbox" aria-checked={on} className="flex items-center gap-3 rounded-xl px-3 h-11 text-left" style={{ background: on ? "color-mix(in oklab, var(--s-accent) 9%, var(--s-bg))" : "var(--s-bg)", border: `1px solid ${on ? "var(--s-accent)" : "var(--s-line-2)"}`, opacity: videosOnly ? 0.55 : 1 }} disabled={videosOnly} title={videosOnly ? `${PLATFORM_LABEL[p] ?? p} only takes videos, and this post is a picture.` : undefined} onClick={() => setPicked((x) => (on ? x.filter((y) => y !== p) : [...x, p]))}>
                  <PlatformGlyph platform={p} size={16} /><span className="text-[13px] flex-1">{PLATFORM_LABEL[p] ?? p}{videosOnly && <span className="text-[11.5px] ml-1.5" style={{ color: "var(--s-mute)" }}>· {VIDEO_ONLY_LINE}</span>}</span>
                  <span aria-hidden className="h-5 w-5 rounded-md grid place-items-center" style={{ background: on ? "var(--s-accent)" : "transparent", border: `1.5px solid ${on ? "var(--s-accent)" : "var(--s-line-2)"}` }}>{on && <Check className="h-3.5 w-3.5" style={{ color: "var(--s-accent-ink)" }} />}</span>
                </button>
              );
            })}
          </div>
        )}
        {/* What the ticks add up to (Kezie, 2026-10-27: picked only YouTube, saw every account on the post). */}
        {connected.length > 0 && <p className="text-[12.5px] mt-3" style={{ color: picked.length ? "var(--s-soft)" : "var(--s-warn)" }}>{picked.length ? <>Posts to <b style={{ color: "var(--s-text)" }}>{picked.map((x) => PLATFORM_LABEL[x] ?? x).join(", ").replace(/, ([^,]*)$/, " and $1")}{picked.length === 1 && connected.length > 1 ? " only" : ""}</b>.</> : "Nothing ticked: it goes on the calendar but won't post."}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button className="s-btn ghost sm" onClick={() => setPlatformsFor(null)}>Cancel</button>
          <button className="s-btn primary sm" disabled={!connected.length || busy === platformsFor?.id} onClick={savePicked}>{platformsFor?.scheduled_at ? "Save and queue" : "Save"}</button>
        </div>
      </Modal>
    </div>
  );
}
