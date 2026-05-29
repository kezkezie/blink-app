import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt, brandContext, useBrand, mode, style } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY environment variable" }, { status: 500 });
    }

    const brand = useBrand && brandContext ? brandContext : null;
    const isZeroPrompt = !prompt || prompt.trim().length < 5;
    const styleKey = style?.id || "studio";

    // Brand context block — concise
    const brandBlock = brand
      ? `Brand: "${brand.name}" — ${brand.description || "premium brand"}. Industry: ${brand.industry || "not specified"}. Website: ${brand.websiteUrl || "n/a"}.`
      : "";

    // Style hints — what type of visual we're directing toward
    const styleHints: Record<string, string> = {
      studio:   "Pure product photography — no people, no scene narrative. Focus on the object itself.",
      lifestyle: "The product in a real, lived-in environment. A moment, not a setup.",
      cinematic: "A single frame from a film that doesn't exist yet. Subject, environment, and tension.",
      poster:   "An image that works as an editorial campaign poster — subject, scene, atmosphere.",
      brand:    "The brand mark integrated naturally into the scene as a physical material.",
      flatlay:  "Objects arranged from directly above — surface, objects, breathing room.",
      abstract: "A single 3D-rendered form — material, light, and geometry as the entire story.",
    };

    const modeHints: Record<string, string> = {
      product_drop: "The subject is a product that will be composited into a scene — describe the SCENE, not the product.",
      organic_blend: "Multiple objects will be merged into one environment — describe the overall scene and mood.",
      grid: "A moodboard of related visuals — describe the visual theme and feeling.",
    };

    const activeHint = modeHints[mode] || styleHints[styleKey] || styleHints.studio;

    const zeroPromptInstruction = isZeroPrompt
      ? `The user has not written anything. Invent a compelling, specific visual concept that would work for this brand and style. Choose a concrete subject and mood.`
      : `The user wrote: "${prompt.trim()}". Refine this into a clear, evocative concept.`;

    const systemPrompt = `You are an art director generating the CONCEPT SEED for an AI image generation system.

Your job is to write ONE short, evocative concept — 15 to 40 words maximum.

This concept is the SUBJECT and SCENE of the image. Nothing more.

DO NOT include:
- Composition zones or percentages
- Lighting setup instructions
- Camera or lens specifications
- Typography or text overlay instructions
- Rules about thirds, safe zones, or layout grids
- Multiple sentences describing different aspects

The creative direction engine (separate system) will handle:
  composition, lighting, typography, camera, atmosphere, depth, and restraint.

Your ONLY job: describe WHAT is in the image and WHY it's interesting.

${brandBlock}
${activeHint}

Examples of good output:
- "A single espresso cup on a warm concrete surface, steam curling upward, early morning window light"
- "A runner at the moment of full extension, mid-air, against a dark empty road at dusk"
- "The dining table set for one, a single wine glass, candlelight, something just ended"
- "A smartphone screen reflected in a puddle on a night street, city lights bleeding around it"

Output ONLY the concept. No preamble, no labels, no explanation.`;

    const userMessage = zeroPromptInstruction + "\n\nWrite the concept now:";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.9,
        max_tokens: 80,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "OpenAI API Error");

    const suggestion = data.choices[0].message.content.trim();
    return NextResponse.json({ suggestion });

  } catch (error: any) {
    console.error("AI Prompt Helper Error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate prompt" }, { status: 500 });
  }
}
