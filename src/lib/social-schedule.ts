/**
 * Scheduling helpers shared by /api/social-posts/schedule and /unschedule (2026-10-11).
 *
 * Two bugs these exist to prevent:
 * - Moving a scheduled post created a second PostForMe post and left the first one queued, so
 *   it could publish twice. Any earlier post that is still waiting is now cancelled first.
 * - "Remove" only cleared our date; the PostForMe post still went out. Unschedule cancels it.
 * And posts only go to the accounts connected to the post's own brand (an agency's brand A
 * post used to go to every brand's account on that platform).
 */

export type PfmStatus = "draft" | "scheduled" | "processing" | "processed";
export type SocialAccountRow = { postforme_account_id: string | null; platform: string; brand_id?: string | null };

const PFM_BASE = "https://api.postforme.dev/v1";

export function pfmApiKey() {
  return process.env.POSTFORME_API_KEY || process.env.NEXT_PUBLIC_POSTFORME_API_KEY || "";
}

/** The PostForMe account ids a post goes to: enabled platforms, the post's brand only (deduplicated). */
export function accountsForPost(accounts: SocialAccountRow[], platforms: string[], brandId: string | null | undefined): string[] {
  const wanted = new Set(platforms.map((p) => p.toLowerCase()));
  const matched = accounts.filter((a) => wanted.has(a.platform.toLowerCase()) && (!brandId || a.brand_id === brandId));
  return [...new Set(matched.map((a) => a.postforme_account_id).filter((x): x is string => !!x))];
}

/** Only a post that hasn't started publishing can be cancelled. */
export function isCancellable(status: unknown): boolean {
  return status === "scheduled" || status === "draft";
}

async function pfm(apiKey: string, method: "GET" | "DELETE", path: string) {
  const res = await fetch(`${PFM_BASE}${path}`, { method, headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: body as Record<string, unknown> };
}

/**
 * Cancel an earlier PostForMe post if it is still waiting. Returns what happened so callers can
 * refuse to reschedule something that is already publishing.
 */
export async function cancelPendingPost(apiKey: string, postId: string | null | undefined): Promise<{ outcome: "none" | "cancelled" | "gone" | "published" | "error"; status?: string }> {
  if (!postId) return { outcome: "none" };
  const got = await pfm(apiKey, "GET", `/social-posts/${encodeURIComponent(postId)}`);
  if (got.status === 404) return { outcome: "gone" };
  if (!got.ok) return { outcome: "error" };
  const status = typeof got.body.status === "string" ? got.body.status : undefined;
  if (!isCancellable(status)) return { outcome: "published", status };
  const del = await pfm(apiKey, "DELETE", `/social-posts/${encodeURIComponent(postId)}`);
  if (del.ok || del.status === 404) return { outcome: "cancelled", status };
  return { outcome: "error", status };
}
