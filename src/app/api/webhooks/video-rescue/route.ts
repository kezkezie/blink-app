import { NextRequest, NextResponse, after } from "next/server";
import { checkVideoRescueSignature, finishVideoRescue } from "@/lib/video-rescue-server";

/**
 * Replicate calls this when a video second try finishes (lib/video-rescue-server.ts). The link is
 * signed per post; the body is not trusted: the result is read back from Replicate itself.
 */
export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const sig = request.nextUrl.searchParams.get("sig") ?? "";
  if (!UUID.test(id) || !checkVideoRescueSignature(id, sig)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  after(finishVideoRescue(id).catch((e) => console.error("video rescue finish", id, e instanceof Error ? e.message : e)));
  return NextResponse.json({ ok: true });
}
