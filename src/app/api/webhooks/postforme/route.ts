import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { statusFromResults, type PostResult } from "@/lib/social-media-rules";

/**
 * PostForMe's events (2026-10-27). Before this, the handler read `payload.event`, but PostForMe sends
 * `{ event_type, data }`, so nothing was ever recorded: a YouTube post that failed ("Only videos are
 * supported") stayed "posted". It also didn't check who was calling.
 * - Every call must carry the webhook's secret in Post-For-Me-Webhook-Secret (POSTFORME_WEBHOOK_SECRET).
 * - social.post.result.created: one network's answer for one of our posts. It is kept on the post
 *   (creation_metadata.post_results, keyed by account), and the post becomes "failed" only when every
 *   network it went to refused it (lib/social-media-rules.ts statusFromResults).
 * - Account events are acknowledged only: connecting accounts is handled by the studio's sync
 *   (/api/social-accounts/sync), which knows the brand from the connection's brand tag.
 */
export const dynamic = "force-dynamic";

// Use the admin client so RLS doesn't block updates from the webhook
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function fromPostForMe(req: Request) {
  const want = process.env.POSTFORME_WEBHOOK_SECRET;
  const got = req.headers.get("post-for-me-webhook-secret");
  if (!want || !got) return false;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : v && typeof v === "object" ? JSON.stringify(v).slice(0, max) : "");

export async function POST(req: Request) {
  if (!fromPostForMe(req)) return NextResponse.json({ error: "Not from PostForMe" }, { status: 401 });
  let payload: { event_type?: unknown; event?: unknown; data?: Record<string, unknown> };
  try { payload = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const event = payload.event_type ?? payload.event;
  if (event !== "social.post.result.created") return NextResponse.json({ received: true });

  try {
    const r = payload.data ?? {};
    const postId = typeof r.post_id === "string" ? r.post_id : null;
    const accountId = typeof r.social_account_id === "string" ? r.social_account_id : null;
    if (!postId || !accountId) return NextResponse.json({ received: true });
    const { data: content } = await supabaseAdmin.from("content").select("id, client_id, status, creation_metadata").eq("postforme_tracking_id", postId).maybeSingle();
    if (!content) return NextResponse.json({ received: true });
    const { data: account } = await supabaseAdmin.from("social_accounts").select("platform").eq("postforme_account_id", accountId).limit(1).maybeSingle();
    const platformData = (r.platform_data && typeof r.platform_data === "object" ? r.platform_data : {}) as { url?: unknown };
    const result: PostResult = {
      platform: String(account?.platform ?? "account"), ok: r.success === true, at: new Date().toISOString(),
      ...(r.success === true ? {} : { error: text(r.error, 300) || "The network refused it." }),
      ...(typeof platformData.url === "string" && platformData.url.startsWith("https://") ? { url: platformData.url } : {}),
    };
    const meta = (content.creation_metadata && typeof content.creation_metadata === "object" ? content.creation_metadata : {}) as Record<string, unknown>;
    const sent = (meta.post_sent && typeof meta.post_sent === "object" ? meta.post_sent : {}) as { id?: string; accounts?: number };
    const results = { ...(sent.id === postId && meta.post_results && typeof meta.post_results === "object" ? meta.post_results as Record<string, PostResult> : {}), [accountId]: result };
    const status = statusFromResults(Object.values(results), sent.id === postId ? sent.accounts ?? 1 : 1);
    await supabaseAdmin.from("content").update({
      creation_metadata: { ...meta, post_results: results },
      ...(status && status !== content.status ? { status } : {}),
    } as Record<string, unknown>).eq("id", content.id).eq("client_id", content.client_id);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[PostForMe webhook]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
