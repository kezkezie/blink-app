import { NextRequest, NextResponse } from "next/server";
import { settleFromWebhook, validWebhookSignature } from "@/lib/upscale-server";

/**
 * Replicate calls this when an upscale finishes, so the result lands even if nobody is watching.
 * The link is signed per job; what happened is read back from Replicate, never from this body.
 */
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const job = request.nextUrl.searchParams.get("job") ?? "";
  const sig = request.nextUrl.searchParams.get("sig") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(job) || !validWebhookSignature(job, sig)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const found = await settleFromWebhook(job).catch(() => false);
  return NextResponse.json({ ok: found }, { status: found ? 200 : 404 });
}
