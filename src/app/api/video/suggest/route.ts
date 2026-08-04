import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { consumeExecutionRateLimit } from "@/lib/execution-rate-limit";
import { parseVideoSuggestRequest } from "@/lib/video-execution";
import { hasOpenAiKey, openAiChat } from "@/lib/openai-proxy";

// Fallback suggestions served when OpenAI is unavailable (quota, network, etc.)
const FALLBACKS: Record<string, string[]> = {
  showcase: [
    "Luxury product on a dark reflective surface with dramatic studio light",
    "Hero product emerging from fog with cinematic depth of field",
    "Product on marble with soft natural window light and clean shadows",
  ],
  ugc: [
    "Person unboxing and reacting to product with genuine excitement",
    "Casual hands-on review in a bright modern living room",
    "Before and after transformation showing real product results",
  ],
  clothing: [
    "Model walking confidently in natural golden-hour outdoor light",
    "Fashion editorial with wind-blown fabric in an urban setting",
    "Close-up texture reveal with soft diffused studio lighting",
  ],
  logo_reveal: [
    "Product rises dramatically from darkness into a single spotlight",
    "Brand mark materialises from a burst of light particles",
    "Product emerges from water in crisp slow-motion",
  ],
  standard: [
    "Compelling product moment with clean composition and natural light",
  ],
};

function pickFallback(mode: string): string {
  const pool = FALLBACKS[mode] ?? FALLBACKS.standard;
  return pool[Math.floor(Math.random() * pool.length)];
}

function tooMany(retryAfterSeconds: number, resetAt: string) {
  return NextResponse.json(
    { error: "Too many suggestion requests. Please try again later.", retryAt: resetAt },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const authenticated = await authenticateExecutionRequest(req);
  if (!authenticated.ok) return NextResponse.json({ error: authenticated.error }, { status: authenticated.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const input = parseVideoSuggestRequest(body);
  if (!input) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const rateLimit = await consumeExecutionRateLimit(authenticated.value, "video_suggest");
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Suggestions are temporarily unavailable" },
      { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } }
    );
  }
  if (!rateLimit.allowed) return tooMany(rateLimit.retryAfterSeconds, rateLimit.resetAt);

  if (!hasOpenAiKey()) {
    return NextResponse.json({ suggestion: pickFallback(input.mode) });
  }

  const promptContext = input.userConcept.trim()
    ? `The user typed this rough idea: "${input.userConcept}". Polish it into a clean, short concept.`
    : `Suggest a generic short concept suitable for a ${input.industry || "general"} brand.`;

  try {
    const content = await openAiChat({
      system: `You are a helpful assistant for a SaaS video platform. Write a SHORT "Visual Concept" (max 15 words) for the user's video.

RULES:
1. NO camera instructions (no "4k", "pan", "macro lens", "dolly").
2. NO lighting instructions.
3. Maximum 15 words.
4. Describe only the basic subject, action, or setting.

Brand: ${input.companyName || "A brand"} (${input.industry || "General"})
${promptContext}`,
      user: promptContext,
    });
    return NextResponse.json({ suggestion: content.trim() || pickFallback(input.mode) });
  } catch {
    // Never surface provider errors to the UI — serve a safe fallback.
    return NextResponse.json({ suggestion: pickFallback(input.mode) });
  }
}
