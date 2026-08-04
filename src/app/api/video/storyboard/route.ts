import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { consumeExecutionRateLimit } from "@/lib/execution-rate-limit";
import { parseVideoStoryboardRequest } from "@/lib/video-execution";
import { openAiChat } from "@/lib/openai-proxy";

export async function POST(req: NextRequest) {
  const authenticated = await authenticateExecutionRequest(req);
  if (!authenticated.ok) return NextResponse.json({ error: authenticated.error }, { status: authenticated.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const input = parseVideoStoryboardRequest(body);
  if (!input) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const rateLimit = await consumeExecutionRateLimit(authenticated.value, "video_storyboard");
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Storyboard generation is temporarily unavailable" },
      { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } }
    );
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many storyboard requests. Please try again later.", retryAt: rateLimit.resetAt },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" } }
    );
  }

  const systemPrompt = `
    You are an elite Commercial Director for '${input.brandName || "the brand"}' (Industry: ${input.industry || "General"}).
    The user will provide a concept for a commercial video.
    Your job is to break this concept down into a highly engaging, multi-scene storyboard sequence.

    You must return a STRICT JSON array of objects. Do not use markdown blocks.

    Each object in the array must have exactly these keys:
    - "mode": Must be exactly one of: "showcase", "logo_reveal", "ugc", "clothing", or "kling_keyframe".
    - "duration": Must be exactly "5" or "10".
    - "prompt": A highly technical, cinematic 30-word visual description of what happens in this specific scene.

    Rules for Modes:
    - Use "logo_reveal" for dramatic 3D product intros.
    - Use "showcase" for cinematic camera pans.
    - Use "kling_keyframe" if the scene requires dynamic human/object motion and physics.

    Example Output:
    {
      "scenes": [
        { "mode": "logo_reveal", "duration": "5", "prompt": "Dynamic 3D reveal bursting from liquid gold..." },
        { "mode": "kling_keyframe", "duration": "10", "prompt": "Slow macro pan across the surface texture..." }
      ]
    }
    `;

  try {
    const content = await openAiChat({
      system: systemPrompt,
      user: `Create a storyboard for this concept: ${input.concept}`,
      jsonObject: true,
    });
    const result = JSON.parse(content || "{}");
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to generate storyboard" }, { status: 502 });
  }
}
