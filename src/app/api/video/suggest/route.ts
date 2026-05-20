import { NextResponse } from "next/server";
import OpenAI from "openai";

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

function pickFallback(mode?: string): string {
  const pool = FALLBACKS[mode ?? "standard"] ?? FALLBACKS.standard;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function POST(req: Request) {
  // Parse body first so it's available in the catch block
  let mode = "showcase";
  let companyName = "";
  let industry = "";
  let description = "";
  let userConcept = "";

  try {
    const body = await req.json();
    mode        = body.mode        ?? "showcase";
    companyName = body.companyName ?? "";
    industry    = body.industry    ?? "";
    description = body.description ?? "";
    userConcept = body.userConcept ?? "";
  } catch {
    return NextResponse.json({ suggestion: pickFallback(mode) });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[suggest] OPENAI_API_KEY not set — serving fallback");
    return NextResponse.json({ suggestion: pickFallback(mode) });
  }

  try {
    const openai = new OpenAI({ apiKey });

    const promptContext = userConcept.trim()
      ? `The user typed this rough idea: "${userConcept}". Polish it into a clean, short concept.`
      : `Suggest a generic short concept suitable for a ${industry || "general"} brand.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant for a SaaS video platform. Write a SHORT "Visual Concept" (max 15 words) for the user's video.

RULES:
1. NO camera instructions (no "4k", "pan", "macro lens", "dolly").
2. NO lighting instructions.
3. Maximum 15 words.
4. Describe only the basic subject, action, or setting.

Brand: ${companyName || "A brand"} (${industry || "General"})
${promptContext}`,
        },
      ],
    });

    return NextResponse.json({
      suggestion: completion.choices[0].message.content?.trim() ?? pickFallback(mode),
    });
  } catch (error: any) {
    const status: number = error?.status ?? 0;
    const code: string   = error?.code   ?? "";

    if (status === 429 || code === "insufficient_quota") {
      console.warn("[suggest] OpenAI quota exceeded — serving fallback suggestion");
      return NextResponse.json({ suggestion: pickFallback(mode) });
    }

    // All other errors (auth, network, model unavailable) — never 500 the UI
    console.error("[suggest] OpenAI error:", status, code, error?.message);
    return NextResponse.json({ suggestion: pickFallback(mode) });
  }
}
