import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { requestWorkspace, workspaceFor } from "@/lib/brand-access";
import { checkUpscale, startUpscale } from "@/lib/upscale-server";

/**
 * Upscale a Library post (2026-10-13). POST { contentId, factor: 2 | 4 } for a picture or
 * { contentId, target: "1080p" | "4k" } for a video: charged first, refunded if it fails, and the
 * result is a new Library post. GET ?job= reports progress (pictures usually finish inside the POST).
 */
export const maxDuration = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 4_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { contentId?: unknown; factor?: unknown; target?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const contentId = typeof body.contentId === "string" && UUID.test(body.contentId) ? body.contentId : null;
  if (!contentId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  // The post's workspace: yours, or the owner's for a brand shared with you as an editor (who pays).
  const ws = await workspaceFor(auth.value, { contentId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["upscale"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const r = await startUpscale({
    userId: auth.value, clientId: ws.clientId, contentId,
    factor: body.factor === 4 ? 4 : 2, target: body.target === "4k" ? "4k" : "1080p", appUrl,
  });
  return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.error }, { status: r.status });
}

export async function GET(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const job = request.nextUrl.searchParams.get("job") ?? "";
  if (!UUID.test(job)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const ws = await requestWorkspace(request, auth.value).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  let r = await checkUpscale(job, ws.clientId);
  if (!r.ok && ws.ownClientId && ws.ownClientId !== ws.clientId) r = await checkUpscale(job, ws.ownClientId);
  return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.error }, { status: r.status });
}
