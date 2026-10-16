import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { requestWorkspace } from "@/lib/brand-access";
import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { videoKindOf, videoLinkProblem } from "@/lib/video-inspo/links";

/**
 * Video Inspo: a pasted link to a video file becomes a copy in the user's storage folder
 * (2026-10-16: most sites don't let a browser read another site's video frames, so a direct MP4
 * link showed "This browser can't open that video"). SSRF-safe fetch, video files only (checked
 * by their first bytes), 45 MB (storage refuses over 50). App links (Pinterest, TikTok, Instagram,
 * YouTube) are answered with how to save the video instead: those apps don't allow reading them.
 */
export const maxDuration = 60;
const MAX_BYTES = 45 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 4_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { url?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const problem = videoLinkProblem(url);
  if (problem) return NextResponse.json({ error: problem.message, app: problem.app ?? null }, { status: 422 });
  const ws = await requestWorkspace(request, auth.value);
  if (!ws?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["media_import"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  const got = await safeFetchBytes(url, { maxBytes: MAX_BYTES, timeoutMs: 40_000 });
  if (!got.ok) {
    const big = /large|size|limit/i.test(got.reason);
    return NextResponse.json({ error: big ? "That video is over 45 MB. Download it, trim it, and drop the file here." : "Couldn't download that link. Check it opens as a video, or download it and drop the file here." }, { status: 422 });
  }
  const kind = videoKindOf(got.bytes);
  if (!kind) return NextResponse.json({ error: "That link is a web page, not a video file. Open the video, save it, and drop the file here." }, { status: 422 });
  const path = `videos/${ws.id}/inspo_${Date.now()}.${kind.ext}`;
  const up = await supabaseAdmin.storage.from("assets").upload(path, got.bytes, { contentType: kind.type });
  if (up.error) return NextResponse.json({ error: "Couldn't keep a copy of that video. Try again." }, { status: 500 });
  const name = decodeURIComponent(new URL(got.finalUrl || url).pathname.split("/").pop() || "video").slice(0, 80);
  return NextResponse.json({ url: supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl, name });
}
