/**
 * Dates and positions for the calendar's views (2026-10-27 redesign, from Kezie's two Dribbble picks:
 * a dark week grid with a "now" line and picture blocks, and an Apple TV agenda with day chips).
 * Monday-first weeks, local time. Pure, so the views and tests agree.
 */
export type CalView = "week" | "month" | "list";

const pad = (n: number) => String(n).padStart(2, "0");
export const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
export const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function startOfWeek(d: Date) {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}

/** Six-ish rows of Monday-first weeks around the anchor's month. */
export function monthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  const weeks = Math.ceil((((first.getDay() + 6) % 7) + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

/** The list view's span: four weeks from the anchor's week. */
export const LIST_DAYS = 28;

/** The days a view shows, first to last. */
export function daysOf(view: CalView, anchor: Date) {
  if (view === "month") return monthGrid(anchor);
  const start = startOfWeek(anchor);
  return Array.from({ length: view === "week" ? 7 : LIST_DAYS }, (_, i) => addDays(start, i));
}

/** Previous or next period. */
export function shift(view: CalView, anchor: Date, by: 1 | -1) {
  if (view === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + by, 1);
  return addDays(anchor, by * (view === "week" ? 7 : LIST_DAYS));
}

/** "26 Oct – 1 Nov 2026", "October 2026". */
export function rangeLabel(view: CalView, anchor: Date) {
  if (view === "month") return anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const days = daysOf(view, anchor), a = days[0], z = days[days.length - 1];
  const sameMonth = a.getMonth() === z.getMonth();
  const left = a.toLocaleDateString("en-GB", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  return `${left} – ${z.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

/** The week grid: pixels per hour, and the length a post is drawn as (posts are moments, not meetings). */
export const HOUR_PX = 56;
export const BLOCK_MIN = 45;

export const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const topFor = (d: Date) => (minutesOf(d) / 60) * HOUR_PX;

/** The time at y pixels down a day's column: the quarter hour that was touched. */
export function timeFromY(day: Date, y: number, snap = 15) {
  const mins = Math.max(0, Math.min(24 * 60 - snap, Math.floor(((y / HOUR_PX) * 60) / snap) * snap));
  const d = startOfDay(day);
  d.setMinutes(mins);
  return d;
}

/**
 * Posts that would overlap in a day's column, side by side: each gets its lane and the number of
 * lanes in its cluster (like a calendar app lays out meetings).
 */
export function lanes(items: Array<{ id: string; at: Date }>, blockMin = BLOCK_MIN) {
  const out = new Map<string, { lane: number; of: number }>();
  const sorted = [...items].sort((a, b) => a.at.getTime() - b.at.getTime());
  let cluster: Array<{ id: string; end: number; lane: number }> = [];
  let clusterEnd = -1;
  const close = () => { const of = Math.max(1, ...cluster.map((c) => c.lane + 1)); for (const c of cluster) out.set(c.id, { lane: c.lane, of }); cluster = []; };
  for (const it of sorted) {
    const start = minutesOf(it.at), end = start + blockMin;
    if (cluster.length && start >= clusterEnd) close();
    const used = new Set(cluster.filter((c) => c.end > start).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    cluster.push({ id: it.id, end, lane });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length) close();
  return out;
}

/** "16:20" */
export const hhmm = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
