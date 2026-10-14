import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { workspaceFor } from "@/lib/brand-access";
import { scanPost } from "@/lib/ai-edit-server";
import { keptScan } from "@/lib/ai-edit";
import { supabaseAdmin } from "@/lib/supabase-server";

/**
 * Edit with AI's scan (2026-10-15). GET ?content= gives the kept scan for the post's current
 * picture, or null (free, never scans). POST { contentId, refresh? } scans when there is none
 * (charged) and answers the kept one otherwise; refresh scans again.
 */
export const maxDuration = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const contentId = request.nextUrl.searchParams.get("content") ?? "";
  if (!UUID.test(contentId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const ws = await workspaceFor(auth.value, { contentId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const { data } = await supabaseAdmin.from("content").select("image_urls, xray").eq("id", contentId).eq("client_id", ws.clientId).maybeSingle();
  if (!data) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const urls = Array.isArray(data.image_urls) ? data.image_urls : [];
  const kept = typeof urls[0] === "string" ? keptScan(data.xray, urls[0]) : null;
  return NextResponse.json(kept ? { scan: kept.scan, from: kept.from, size: kept.size ?? null } : { scan: null });
}

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 2_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { contentId?: unknown; refresh?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const contentId = typeof body.contentId === "string" && UUID.test(body.contentId) ? body.contentId : null;
  if (!contentId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  // The post's workspace: yours, or the owner's for a brand shared with you as an editor (who pays).
  const ws = await workspaceFor(auth.value, { contentId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["ai_edit"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });
  const r = await scanPost(ws.clientId, contentId, body.refresh === true);
  return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.error }, { status: r.status });
}
