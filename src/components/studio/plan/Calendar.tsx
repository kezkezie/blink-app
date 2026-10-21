"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, ChevronLeft, ChevronRight, Clock, ExternalLink, Loader2, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useAskStore } from "@/components/studio/ask-store";
import { Modal } from "@/components/studio/Modal";
import { MediaThumb, NOT_STORYBOARD_FRAME, PART_TYPES, STATUS_LABEL, cleanCaption, resolveMedia } from "@/components/studio/media";
import { PlatformGlyph } from "./PlatformGlyph";
import { PLATFORM_LABEL, enabledPlatforms, placeOnCalendar, postState, savePlatforms, takeOffCalendar, toLocalInput, whenLabel, type CalRow, type PlaceResult, type PostState } from "./schedule";
import "./calendar.css";
import { CalendarSkeleton } from "@/components/studio/Skeletons";

/**
 * The calendar in the studio look (2026-10-11; the classic one stays at /dashboard/calendar).
 * Drag a ready post onto a day, or press Schedule (works on phones too). "Magic Auto-Schedule"
 * (one post a day at 10:00) is gone: Ask BlinkSpot plans the dates and times instead.
 * A post's state is shown honestly: queued with PostForMe, on the calendar but not queued
 * (pick platforms, or the queueing failed), or already sent.
 */

const COLS = "id, client_id, brand_id, caption, caption_short, content_type, status, image_urls, video_urls, reference_image_url, scheduled_at, target_platforms, postforme_tracking_id, created_at";
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const toneColor = (t: PostState["tone"]) => (t === "ok" ? "var(--s-ok)" : t === "warn" ? "var(--s-warn)" : t === "danger" ? "var(--s-danger)" : "var(--s-mute)");

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

export function Calendar() {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [scheduled, setScheduled] = useState<CalRow[] | null>(null);
  const [ready, setReady] = useState<CalRow[] | null>(null);
  const [readyLimit, setReadyLimit] = useState(24);
  const [moreReady, setMoreReady] = useState(false);
  const [connected, setConnected] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [whenFor, setWhenFor] = useState<CalRow | null>(null);
  const [whenValue, setWhenValue] = useState("");
  const [platformsFor, setPlatformsFor] = useState<CalRow | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  // Six rows of Monday-first weeks around the month.
  const days = useMemo(() => {
    const first = new Date(month);
    const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const weeks = Math.ceil((((first.getDay() + 6) % 7) + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);

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
  const today = startOfToday();

  function report(r: PlaceResult, iso: string, item: CalRow) {
    if (!r.ok) { toast.error(r.error || "Couldn't schedule it."); return; }
    const platforms = enabledPlatforms(item.target_platforms);
    if (r.queued) toast.success(`Scheduled for ${whenLabel(iso)} on ${platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(", ")}.`);
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
    report(r, iso, item);
    await load();
  }
  async function unschedule(item: CalRow, evenIfPosted = false) {
    setBusy(item.id);
    const r = await takeOffCalendar(item.id, evenIfPosted);
    setBusy(null);
    setConfirmOff(null);
    if (!r.ok) { toast.error(r.error || "Couldn't take it off the calendar."); return; }
    toast.success(evenIfPosted ? "Taken off the calendar. It's still in your Library, and still on the platform it went to." : "Taken off the calendar. It's back in Ready.");
    await load();
  }
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  function openWhen(item: CalRow) { setWhenFor(item); setWhenValue(toLocalInput(item.scheduled_at)); }
  function openPlatforms(item: CalRow) { setPlatformsFor(item); setPicked(enabledPlatforms(item.target_platforms).filter((p) => connected.includes(p))); }
  async function savePicked() {
    if (!clientId || !platformsFor) return;
    const item = platformsFor;
    setBusy(item.id);
    const r = await savePlatforms(clientId, item, picked);
    setBusy(null);
    setPlatformsFor(null);
    if (!r.ok) toast.error(r.error || "Couldn't save the platforms.");
    else if (item.scheduled_at && r.queued) toast.success(`Queued for ${whenLabel(item.scheduled_at)}.`);
    else if (item.scheduled_at && r.error) toast.error(`Saved, but not queued: ${r.error}`, { duration: 9000, ...(r.code === "needs_caption" ? { action: { label: "Write it", onClick: () => { window.location.href = `/studio/library/${item.id}`; } } } : {}) });
    else toast.success("Platforms saved.");
    await load();
  }

  function onDropDay(e: React.DragEvent, day: Date) {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData("text/blink-post") || dragId; setDragId(null);
    const item = all.find((p) => p.id === id);
    if (!item) return;
    if (day < today) { toast.info("That day has passed."); return; }
    void place(item, timeOnDay(day, item.scheduled_at));
  }
  function onDropReady(e: React.DragEvent) {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData("text/blink-post") || dragId; setDragId(null);
    const item = (scheduled ?? []).find((p) => p.id === id);
    if (item) void unschedule(item);
  }
  const dragProps = (p: CalRow, enabled = true) => enabled ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData("text/blink-post", p.id); e.dataTransfer.effectAllowed = "move"; setDragId(p.id); },
    onDragEnd: () => { setDragId(null); setOver(null); },
  } : {};

  if (!activeBrand) return <div className="s-empty"><h3>No brand open</h3><p className="text-[13px]">Pick a brand in the top bar to see its calendar.</p></div>;
  if (!scheduled || !ready) return <CalendarSkeleton />;

  const monthName = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const inMonth = scheduled.filter((p) => p.scheduled_at && new Date(p.scheduled_at).getMonth() === month.getMonth()).length;
  const selectedPosts = selected ? byDay.get(selected) ?? [] : [];
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })();
  const draggingScheduled = !!dragId && scheduled.some((p) => p.id === dragId);

  // A plain call (not a component defined in render), so thumbnails aren't remounted on every render.
  const thumb = (p: CalRow) => { const m = resolveMedia(p); return <MediaThumb url={m.url} isVideo={m.isVideo} poster={m.poster} />; };

  return (
    <div className="cal">
      <div className="s-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--s-line)" }}>
          <h2 className="text-[16px] font-semibold mr-1">{monthName}</h2>
          <button className="s-btn ghost sm" style={{ width: 28, padding: 0 }} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <button className="s-btn ghost sm" style={{ width: 28, padding: 0 }} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
          <button className="s-btn sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(keyOf(d)); }}>Today</button>
          <div className="flex-1" />
          <span className="text-[12px] mono" style={{ color: "var(--s-mute)" }}>{inMonth} on the calendar this month{tz ? ` · times in ${tz}` : ""}</span>
        </div>
        <div className="cal-grid" role="grid" aria-label={`Calendar for ${monthName}`}>
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {days.map((d) => {
            const k = keyOf(d);
            const posts = byDay.get(k) ?? [];
            const cls = ["cal-day", d.getMonth() !== month.getMonth() && "out", d < today && "past", k === keyOf(today) && "today", selected === k && "sel", over === k && "over"].filter(Boolean).join(" ");
            return (
              <div
                key={k}
                role="gridcell"
                tabIndex={0}
                aria-label={`${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${posts.length} post${posts.length === 1 ? "" : "s"}`}
                className={cls}
                onClick={() => setSelected(k)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(k); } }}
                onDragOver={(e) => { if (d >= today) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== k) setOver(k); } }}
                onDragLeave={() => setOver((o) => (o === k ? null : o))}
                onDrop={(e) => onDropDay(e, d)}
              >
                <span className="cal-n">{d.getDate()}</span>
                {posts.slice(0, 3).map((p) => {
                  const st = postState(p);
                  const movable = p.status !== "posted" && (!p.scheduled_at || new Date(p.scheduled_at).getTime() > Date.now());
                  return (
                    <div key={p.id} className={`cal-chip${dragId === p.id ? " drag" : ""}`} {...dragProps(p, movable)} title={`${cleanCaption(p.caption) || "Post"} · ${st.label}`}>
                      <span className="th">{thumb(p)}</span>
                      <span className="t">{new Date(p.scheduled_at!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="p">{enabledPlatforms(p.target_platforms).slice(0, 2).map((x) => <PlatformGlyph key={x} platform={x} size={11} />)}</span>
                      <span className="cal-dot" style={{ background: toneColor(st.tone) }} aria-label={st.label} />
                    </div>
                  );
                })}
                {posts.length > 3 && <span className="cal-more">+{posts.length - 3} more</span>}
                {posts.length > 0 && <span className="cal-dots">{posts.slice(0, 4).map((p) => <span key={p.id} className="cal-dot" style={{ background: toneColor(postState(p).tone) }} />)}</span>}
              </div>
            );
          })}
        </div>
      </div>

      <aside
        className={`s-card cal-side${draggingScheduled && !selected ? " drop" : ""}`}
        onDragOver={(e) => { if (draggingScheduled && !selected) e.preventDefault(); }}
        onDrop={(e) => { if (!selected) onDropReady(e); }}
      >
        {selected ? (
          <>
            <div className="p-4 grid gap-1" style={{ borderBottom: "1px solid var(--s-line)" }}>
              <button className="s-btn ghost sm justify-self-start -ml-2" onClick={() => setSelected(null)}><ArrowLeft className="h-3.5 w-3.5" /> Ready to schedule</button>
              <b className="text-[15px]">{fromKey(selected).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</b>
              <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{selectedPosts.length ? `${selectedPosts.length} post${selectedPosts.length === 1 ? "" : "s"}` : fromKey(selected) < today ? "Nothing went out this day." : "Nothing yet. Drag a post here, or press Schedule on one."}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 grid gap-2 content-start">
              {selectedPosts.map((p) => {
                const st = postState(p);
                const editable = p.status !== "posted" && !!p.scheduled_at && new Date(p.scheduled_at).getTime() > Date.now();
                const plats = enabledPlatforms(p.target_platforms);
                return (
                  <div key={p.id} className="rounded-xl p-2.5 grid gap-2" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)" }} {...dragProps(p, editable)}>
                    <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2.5">
                      <div className="relative h-[52px] w-[52px] rounded-lg overflow-hidden bg-black [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_video]:h-full [&_video]:w-full [&_video]:object-cover">{thumb(p)}</div>
                      <div className="min-w-0 grid gap-1 content-start">
                        <div className="flex items-center gap-1.5">
                          <span className="mono text-[12px]">{new Date(p.scheduled_at!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
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
              <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{draggingScheduled ? "Drop here to take it off the calendar." : "Drag a post onto a day, or press Schedule."}</span>
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
        <div className="flex items-center justify-between mb-1"><b className="text-sm">Where should it post?</b><button className="s-btn ghost sm" onClick={() => setPlatformsFor(null)} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <p className="text-[12px] mb-3" style={{ color: "var(--s-mute)" }}>Accounts connected to {activeBrand.brand_name}.</p>
        {connected.length === 0 ? (
          <div className="s-empty" style={{ padding: "24px 16px" }}><p className="text-[13px]">No social accounts connected for this brand yet.</p><Link href="/studio/account/settings" className="s-btn sm mt-3">Connect accounts</Link></div>
        ) : (
          <div className="grid gap-2">
            {connected.map((p) => {
              const on = picked.includes(p);
              return (
                <button key={p} className="flex items-center gap-3 rounded-xl px-3 h-11 text-left" style={{ background: on ? "var(--s-raised)" : "var(--s-bg)", border: `1px solid ${on ? "var(--s-text)" : "var(--s-line-2)"}` }} aria-pressed={on} onClick={() => setPicked((x) => (on ? x.filter((y) => y !== p) : [...x, p]))}>
                  <PlatformGlyph platform={p} size={16} /><span className="text-[13px] flex-1">{PLATFORM_LABEL[p] ?? p}</span>
                  <span className="h-4 w-4 rounded grid place-items-center" style={{ background: on ? "var(--s-accent)" : "transparent", border: `1px solid ${on ? "var(--s-accent)" : "var(--s-line-2)"}` }}>{on && <span className="block h-1.5 w-1.5 rounded-sm" style={{ background: "var(--s-accent-ink)" }} />}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button className="s-btn ghost sm" onClick={() => setPlatformsFor(null)}>Cancel</button>
          <button className="s-btn primary sm" disabled={!connected.length || busy === platformsFor?.id} onClick={savePicked}>{platformsFor?.scheduled_at ? "Save and queue" : "Save"}</button>
        </div>
      </Modal>
    </div>
  );
}
