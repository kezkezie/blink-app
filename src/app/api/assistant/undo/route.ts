import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { requestWorkspace } from "@/lib/brand-access";
import { undoAssistantChange } from "@/lib/assistant/actions";

/**
 * POST { undo }: put back what Ask BlinkSpot changed (lib/assistant/actions.ts). Only the brand's
 * own fields, products it added or changed, and posts' captions, hashtags and status; scoped to the
 * workspace the caller can edit.
 */
export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 64_000)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { undo?: { brandId?: unknown } };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const client = await requestWorkspace(request, auth.value, body.undo?.brandId);
  if (!client?.id) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const r = await undoAssistantChange(client.id, body.undo);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
}
