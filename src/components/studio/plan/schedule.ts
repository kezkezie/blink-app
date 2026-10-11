"use client";

import { supabase } from "@/lib/supabase";
import type { Content } from "@/types/database";

/**
 * Putting posts on the calendar, one way for the studio's calendar, the post page and Ask
 * BlinkSpot (2026-10-11). The date is saved first (that is the plan); then, if the post has
 * platforms, it is queued at PostForMe. The schedule route cancels any earlier queued copy, so
 * moving a post never publishes it twice; taking it off cancels the queued post too.
 */

export type PublishSettings = Record<string, { enabled: boolean; format: string }>;
export type SchedulablePost = { id: string; target_platforms?: unknown; postforme_tracking_id?: string | null };

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook", twitter: "X", linkedin: "LinkedIn",
  pinterest: "Pinterest", threads: "Threads", bluesky: "Bluesky",
};
/** The one format PostForMe's current tier accepts for each platform (others are commented out in the classic UI). */
export const DEFAULT_FORMAT: Record<string, string> = { tiktok: "post", instagram: "feed", youtube: "standard" };

/** Same rules as the classic calendar, including the old array format (["tiktok", ...]). */
export function parsePublishSettings(data: unknown): PublishSettings {
  let parsed = data;
  if (typeof data === "string") { try { parsed = JSON.parse(data); } catch { return {}; } }
  if (Array.isArray(parsed)) {
    const out: PublishSettings = {};
    for (const p of parsed) if (typeof p === "string") out[p.toLowerCase()] = { enabled: true, format: DEFAULT_FORMAT[p.toLowerCase()] ?? "post" };
    return out;
  }
  return parsed && typeof parsed === "object" ? (parsed as PublishSettings) : {};
}

export function enabledPlatforms(data: unknown): string[] {
  const s = parsePublishSettings(data);
  return Object.keys(s).filter((k) => s[k]?.enabled);
}

export function settingsFor(platforms: string[]): PublishSettings {
  return Object.fromEntries(platforms.map((p) => [p, { enabled: true, format: DEFAULT_FORMAT[p] ?? "post" }]));
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: res.ok, error: data.error };
}

export type PlaceResult = { ok: boolean; queued: boolean; error?: string };

/** Put a post on the calendar at `iso` (and queue it if it has platforms). */
export async function placeOnCalendar(clientId: string, item: SchedulablePost, iso: string, opts: { captionChoice?: "long" | "short" } = {}): Promise<PlaceResult> {
  const platforms = enabledPlatforms(item.target_platforms);
  if (!platforms.length && item.postforme_tracking_id) {
    // Queued earlier but its platforms were removed: cancel that one first.
    const off = await post("/api/social-posts/unschedule", { contentId: item.id });
    if (!off.ok) return { ok: false, queued: false, error: off.error };
  }
  const { error } = await supabase.from("content").update({ scheduled_at: iso } as Record<string, unknown>).eq("id", item.id).eq("client_id", clientId);
  if (error) return { ok: false, queued: false, error: "Couldn't save the date." };
  if (!platforms.length) return { ok: true, queued: false };
  const queued = await post("/api/social-posts/schedule", { contentId: item.id, clientId, scheduledAt: iso, ...(opts.captionChoice ? { captionChoice: opts.captionChoice } : {}) });
  return { ok: true, queued: queued.ok, error: queued.ok ? undefined : queued.error || "Couldn't queue it with your social accounts." };
}

/** Take a post off the calendar, cancelling its queued PostForMe post. */
export async function takeOffCalendar(contentId: string) {
  return post("/api/social-posts/unschedule", { contentId });
}

/** Save the platforms a post goes to (and approve it when it is already on the calendar, as the classic calendar does). */
export async function savePlatforms(clientId: string, item: SchedulablePost & { status?: string; scheduled_at?: string | null }, platforms: string[]): Promise<PlaceResult> {
  const settings = settingsFor(platforms);
  // jsonb: stored as an object (the classic calendar stored a JSON string; both are read back).
  const update: Record<string, unknown> = { target_platforms: settings };
  if (item.scheduled_at && (item.status === "draft" || item.status === "pending_approval")) {
    update.status = "approved"; update.approved_at = new Date().toISOString(); update.approved_by = "owner";
  }
  const { error } = await supabase.from("content").update(update).eq("id", item.id).eq("client_id", clientId);
  if (error) return { ok: false, queued: false, error: "Couldn't save the platforms." };
  if (!item.scheduled_at || new Date(item.scheduled_at).getTime() < Date.now()) return { ok: true, queued: false };
  return placeOnCalendar(clientId, { ...item, target_platforms: settings }, item.scheduled_at);
}

/** "Tue 14 Oct, 18:30" in the viewer's time zone. */
export function whenLabel(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** A datetime-local value ("2026-10-14T18:30") for an ISO date, in local time. */
export function toLocalInput(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Publish right away (cancels a queued copy first, server side). */
export async function publishNow(clientId: string, contentId: string, settings: PublishSettings, captionChoice: "long" | "short") {
  return post("/api/social-posts/schedule", { contentId, clientId, scheduledAt: null, publishSettings: settings, captionChoice });
}

// target_platforms is jsonb: an object now, a JSON string or an array on older rows.
export type CalRow = Omit<Content, "target_platforms" | "scheduled_at"> & { scheduled_at?: string | null; postforme_tracking_id?: string | null; target_platforms?: unknown };

/** Queued with PostForMe, on the calendar but not queued, or already sent. */
export type PostState = { tone: "ok" | "warn" | "danger" | "mute"; label: string };
export function postState(p: CalRow): PostState {
  const at = p.scheduled_at ? new Date(p.scheduled_at).getTime() : null;
  const platforms = enabledPlatforms(p.target_platforms);
  if (p.status === "posted") return { tone: "ok", label: "Posted" };
  if (at !== null && at < Date.now()) return p.postforme_tracking_id ? { tone: "ok", label: "Sent" } : { tone: "danger", label: "Not sent" };
  if (p.postforme_tracking_id) return { tone: "ok", label: "Queued" };
  if (!platforms.length) return { tone: "warn", label: "Pick platforms" };
  return { tone: "warn", label: "Not queued" };
}
