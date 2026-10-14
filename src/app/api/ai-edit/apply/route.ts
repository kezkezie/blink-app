import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { workspaceFor } from "@/lib/brand-access";
import { applyEdit } from "@/lib/ai-edit-server";

/**
 * Edit with AI: POST { contentId, changes: { objects, light?, instruction? }, swaps: { [objectId]:
 * { contentId } | { productId } | { upload } }, engine } (2026-10-15). Checked against the post's
 * kept scan, charged first, refunded if it fails; the result is a new Library post.
 */
export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 40_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { contentId?: unknown; changes?: unknown; swaps?: unknown; engine?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const contentId = typeof body.contentId === "string" && UUID.test(body.contentId) ? body.contentId : null;
  if (!contentId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const ws = await workspaceFor(auth.value, { contentId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["ai_edit"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });
  const r = await applyEdit({ clientId: ws.clientId, contentId, changes: body.changes, swaps: body.swaps, engine: body.engine });
  return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.error }, { status: r.status });
}
