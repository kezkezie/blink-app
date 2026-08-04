import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { consumeExecutionRateLimit } from "@/lib/execution-rate-limit";
import { parseTtsRequest } from "@/lib/video-execution";
import { openAiSpeech } from "@/lib/openai-proxy";

export async function POST(req: NextRequest) {
  const authenticated = await authenticateExecutionRequest(req);
  if (!authenticated.ok) return NextResponse.json({ error: authenticated.error }, { status: authenticated.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const input = parseTtsRequest(body);
  if (!input) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const rateLimit = await consumeExecutionRateLimit(authenticated.value, "video_tts");
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Narration is temporarily unavailable" },
      { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } }
    );
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many narration requests. Please try again later.", retryAt: rateLimit.resetAt },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" } }
    );
  }

  try {
    const audio = await openAiSpeech(input.text, input.voice);
    return new NextResponse(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="narration.mp3"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate narration" }, { status: 502 });
  }
}
