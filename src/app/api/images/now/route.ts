import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { makeImageNow } from "@/lib/image-jobs-server";

/**
 * POST { request }: one picture made inside this request (the Editor's AI edits, video first
 * frames: they don't become a Library post). Same two tries as /api/images, waited for here.
 * A request the browser stops gets its credits back.
 */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 64_000)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { request?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const made = await makeImageNow(auth.value, body.request, request.signal);
  return made.ok ? NextResponse.json(made.value) : NextResponse.json({ error: made.error }, { status: made.status });
}
