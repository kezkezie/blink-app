/**
 * The owner's admin dashboard (Kezie, 2026-10-23: "a simple dashboard that would tell me how many
 * people are logged into the website ... what if we have so many people and I will not be able to
 * handle the traffic"). Pure parts: who may see it, which accounts are tests, how busy it is.
 */

/** Who may open /studio/admin: ADMIN_EMAILS (comma-separated), else the owner. */
export const DEFAULT_ADMINS = ["keziefred@gmail.com"];
export function adminEmails(env: string | undefined = process.env.ADMIN_EMAILS): string[] {
  const list = (env ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.includes("@"));
  return list.length ? list : DEFAULT_ADMINS;
}
export const isAdminEmail = (email: string | null | undefined, env?: string) => !!email && adminEmails(env).includes(email.trim().toLowerCase());

/** Accounts made by tests and QA, kept out of the people counts (2026-10-23: 36 + 48 + a few). */
export const TEST_DOMAINS = ["blinkspot-test.dev", "blinkspot.local", "evil.com", "example.com", "brand.com"];
export const isTestEmail = (email: string | null | undefined) => !email || TEST_DOMAINS.some((d) => email.trim().toLowerCase().endsWith(`@${d}`));

/**
 * How busy the platform is, from the capacity plan (Kezie-OS projects/blinkspot/capacity-3000-users.md):
 * n8n is comfortable at about 10 images being made at once and starts failing at 20 to 30; the load
 * test target before a launch push is 60 people at once.
 */
export type Load = "quiet" | "comfortable" | "busy" | "strained";
export function loadLevel(online: number, running: number): Load {
  if (running > 20 || online > 60) return "strained";
  if (running > 10 || online > 30) return "busy";
  if (running > 0 || online > 3) return "comfortable";
  return "quiet";
}
export const LOAD_LINE: Record<Load, string> = {
  quiet: "Hardly anyone on. All good.",
  comfortable: "People are working. Everything has room.",
  busy: "Busy. Pictures may queue for a moment; keep an eye on failures.",
  strained: "Past what one n8n server handles well. Time to scale (queue mode, a bigger VPS) and check failures.",
};

/** Midnight in Nairobi (UTC+3), as an ISO time, for "today" and "this month" in the owner's day. */
export function nairobiDayStart(now = new Date(), daysBack = 0): string {
  const local = new Date(now.getTime() + 3 * 3_600_000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - 3 * 3_600_000 - daysBack * 86_400_000).toISOString();
}
export function nairobiMonthStart(now = new Date()): string {
  const local = new Date(now.getTime() + 3 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 3 * 3_600_000).toISOString();
}

/** What a studio tab shares on the live channel: never an email, never the full user id. */
export type PresenceMeta = { u: string; p: string; v: boolean };
export function summarizePresence(state: Record<string, PresenceMeta[]>) {
  const metas = Object.values(state).flat();
  const people = new Set(metas.map((m) => m.u));
  const looking = new Set(metas.filter((m) => m.v).map((m) => m.u));
  const bySection: Record<string, number> = {};
  for (const m of metas) bySection[m.p] = (bySection[m.p] ?? 0) + 1;
  return { people: people.size, looking: looking.size, tabs: metas.length, bySection };
}
