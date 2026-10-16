/** Shared brands: helpers used by the sharing API and the Share panel (no server imports). */

export type ShareRole = "editor" | "viewer";

/** People a brand can be shared with (open invites count) come from the owner's plan: SHARE_SEATS in lib/plans. */

export const ROLE_INFO: Record<ShareRole, { label: string; line: string }> = {
  editor: { label: "Editor", line: "Makes, edits and schedules posts for this brand, using your credits." },
  viewer: { label: "Viewer", line: "Sees the brand, its posts and the calendar. Can't make or change anything." },
};

export function isShareRole(v: unknown): v is ShareRole {
  return v === "editor" || v === "viewer";
}

/** Lower-case and trimmed; "" when it isn't an email. */
export function normaliseEmail(v: string) {
  const e = v.trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(e) ? e : "";
}

/** "brian@gmail.com" → "b•••n@gmail.com", so a link shows who it's for without giving it away. */
export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return "that email";
  const shown = name.length <= 2 ? `${name[0]}•••` : `${name[0]}•••${name[name.length - 1]}`;
  return `${shown}@${domain}`;
}

/** A WhatsApp message carrying the invite link. */
export function whatsappShareUrl(link: string, brandName: string, role: ShareRole) {
  const text = `Join me on BlinkSpot to work on ${brandName}${role === "viewer" ? " (view only)" : ""}: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Studio pages a viewer can open. Everything else makes or changes things. */
export function viewerCanOpen(pathname: string) {
  if (pathname.startsWith("/studio/library/upload") || pathname.startsWith("/studio/plan/approvals")) return false;
  return pathname === "/studio"
    || pathname.startsWith("/studio/library")
    || pathname.startsWith("/studio/plan")
    || pathname.startsWith("/studio/brand")
    || pathname.startsWith("/studio/account");
}

/** How long a share lasts (Kezie, 2026-10-16): presets, no end, or a date the owner picks. */
export const SHARE_DURATIONS: Array<{ id: string; label: string; days: number | null }> = [
  { id: "14d", label: "14 days", days: 14 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "1y", label: "1 year", days: 365 },
  { id: "none", label: "No end", days: null },
];
const MAX_SHARE_DAYS = 5 * 365;

/**
 * When access ends, from what the owner chose: { days }, { at } (an exact time, the end of a picked
 * day in the owner's timezone), { until: "YYYY-MM-DD" } (the end of that day, UTC) or nothing (no end). Undefined when the choice isn't valid (in the past, over 5 years).
 */
export function accessUntilFrom(raw: unknown, now = Date.now()): string | null | undefined {
  if (raw === null || raw === undefined || raw === "none") return null;
  if (typeof raw !== "object") return undefined;
  const r = raw as { days?: unknown; until?: unknown; at?: unknown };
  let end: number;
  // { at }: the end of the picked day in the owner's own timezone, worked out in their browser.
  if (typeof r.at === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(r.at)) {
    end = Date.parse(r.at);
    if (!Number.isFinite(end) || end <= now || end > now + MAX_SHARE_DAYS * 86_400_000) return undefined;
    return new Date(end).toISOString();
  }
  if (typeof r.days === "number" && Number.isInteger(r.days)) {
    if (r.days < 1 || r.days > MAX_SHARE_DAYS) return undefined;
    end = now + r.days * 86_400_000;
  } else if (typeof r.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.until)) {
    end = Date.parse(`${r.until}T23:59:59Z`);
    if (!Number.isFinite(end) || end <= now || end > now + MAX_SHARE_DAYS * 86_400_000) return undefined;
  } else return undefined;
  return new Date(end).toISOString();
}

/** "until 12 Nov 2026" or "no end". */
export function accessLabel(until: string | null | undefined) {
  if (!until) return "no end";
  return `until ${new Date(until).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

/** An invite link works for 30 days, or until the access it gives would end, if sooner. */
export function inviteLinkExpiry(accessUntil: string | null, now = Date.now()) {
  const month = now + 30 * 86_400_000;
  return new Date(accessUntil ? Math.min(month, Date.parse(accessUntil)) : month).toISOString();
}

/** The end of a picked day ("YYYY-MM-DD") in this browser's timezone, for { at }. */
export function endOfLocalDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}
