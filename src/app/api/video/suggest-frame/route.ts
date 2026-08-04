import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { consumeExecutionRateLimit } from "@/lib/execution-rate-limit";
import { parseVideoSuggestFrameRequest } from "@/lib/video-execution";
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
  const input = parseVideoSuggestFrameRequest(body);
  if (!input) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const rateLimit = await consumeExecutionRateLimit(authenticated.value, "video_suggest_frame");
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Prompt formatting is temporarily unavailable" },
      { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } }
    );
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many prompt requests. Please try again later.", retryAt: rateLimit.resetAt },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" } }
    );
  }

  const systemPrompt = `
    You are an AI Prompt Engineer specializing in formatting prompts for the "Nano Banana 2" image generation model.
    The user will provide a basic concept or a piece of a story storyboard.

    You must rewrite their concept into a highly detailed image generation prompt using strict bracketed categories.
    Do not add conversational filler. Output ONLY the formatted prompt.

    FORMAT REQUIRED:
    [AESTHETIC: High-end editorial photography, 35mm lens, cinematic lighting...]
    [SUBJECT: Highly detailed description of the character, clothing, or product...]
    [ACTION/SETTING: Description of the environment, pose, and background...]
    [COLOR PALETTE: Description of the lighting tone, mood, and color grading...]

    Example Output:
    [AESTHETIC: Cinematic photography, 8k resolution, photorealistic] [SUBJECT: A young woman with curly brown hair wearing a green velvet blazer] [ACTION/SETTING: Sitting in a modern cafe, drinking espresso, looking thoughtfully out the window] [COLOR PALETTE: Warm golden hour sunlight, deep teal shadows]
    `;

  try {
    const content = await openAiChat({
      system: systemPrompt,
      user: `Format this concept for an image frame: ${input.concept}`,
      maxTokens: 200,
    });
    return NextResponse.json({ suggestion: content.trim() });
  } catch {
    return NextResponse.json({ error: "Failed to format prompt" }, { status: 502 });
  }
}
