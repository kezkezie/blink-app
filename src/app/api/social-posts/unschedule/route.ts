import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase-server";
import { cancelPendingPost, pfmApiKey } from "@/lib/social-schedule";
import { requestWorkspace } from "@/lib/brand-access";

/**
 * Take a post off the calendar (2026-10-11). Cancels its PostForMe post if it hasn't started
 * publishing (before this, "Remove" only cleared our date and the post still went out), then
 * clears the date. Refuses if PostForMe is already publishing it.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { contentId?: unknown; evenIfPosted?: unknown };
  // 2026-10-21: any post can come off the calendar. One that already went out stays on the platform.
  const evenIfPosted = body.evenIfPosted === true;
  const contentId = typeof body.contentId === "string" ? body.contentId : "";
  if (!/^[0-9a-f-]{36}$/i.test(contentId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const client = await requestWorkspace(req, user.id, null, { contentId });
  if (!client) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const { data: content } = await supabaseAdmin
    .from("content").select("id, postforme_tracking_id").eq("id", contentId).eq("client_id", client.id).maybeSingle();
  if (!content) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  let cancelled = false;
  if (content.postforme_tracking_id) {
    const apiKey = pfmApiKey();
    if (!apiKey) return NextResponse.json({ error: "PostForMe isn't configured, so the queued post couldn't be cancelled." }, { status: 500 });
    const r = await cancelPendingPost(apiKey, content.postforme_tracking_id);
    if (r.outcome === "published" && !(evenIfPosted && r.status !== "processing")) {
      return NextResponse.json({ error: r.status === "processing" ? "It's being published right now, so it can't be taken off." : "It has already been published.", code: "published" }, { status: 409 });
    }
    if (r.outcome === "error") return NextResponse.json({ error: "Couldn't reach PostForMe to cancel it. Nothing was changed; try again." }, { status: 502 });
    cancelled = r.outcome === "cancelled";
  }

  const { error } = await supabaseAdmin
    .from("content").update({ scheduled_at: null, postforme_tracking_id: null }).eq("id", contentId).eq("client_id", client.id);
  if (error) return NextResponse.json({ error: "Couldn't update the post." }, { status: 500 });
  return NextResponse.json({ success: true, cancelled });
}
