import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { complete } from "@/lib/llm";

/** Every mode the two real callers send (Image Studio + content detail page). */
const HELPER_MODES = new Set([
  "standard", "edit", "grid", "organic_blend", "product_drop",
  "generate", "style_transfer", "gpt_image_2_t2i", "gpt_image_2_i2i",
]);

type BrandContextInput = { name?: string; description?: string; industry?: string; websiteUrl?: string };

const str = (v: unknown, max: number): string | null | undefined =>
  v === undefined || v === null ? undefined : typeof v === "string" && v.length <= max ? v : null;

/**
 * Bounds everything that is interpolated into the model prompt. Present-but-invalid
 * is rejected, never silently truncated. Unknown style ids still fall back to the
 * studio hint, as before; unknown MODES are rejected because the mode picks the
 * instruction block.
 */
function parseHelperRequest(body: Record<string, unknown>) {
  const prompt = str(body?.prompt, 2000);
  if (prompt === null) return null;
  const mode = str(body?.mode, 40);
  if (mode === null || (mode !== undefined && !HELPER_MODES.has(mode))) return null;
  let brandContext: BrandContextInput | undefined;
  if (body?.brandContext !== undefined && body.brandContext !== null) {
    if (typeof body.brandContext !== "object") return null;
    const b = body.brandContext as Record<string, unknown>;
    const name = str(b.name, 200), description = str(b.description, 2000), industry = str(b.industry, 200), websiteUrl = str(b.websiteUrl, 500);
    if ([name, description, industry, websiteUrl].some((x) => x === null)) return null;
    brandContext = { name: name ?? undefined, description: description ?? undefined, industry: industry ?? undefined, websiteUrl: websiteUrl ?? undefined };
  }
  const styleObj = body?.style && typeof body.style === "object" ? (body.style as Record<string, unknown>) : null;
  const styleId = styleObj ? str(styleObj.id, 40) : undefined;
  if (styleId === null) return null;
  return { prompt: prompt ?? "", brandContext, useBrand: body?.useBrand === true, mode, style: styleId ? { id: styleId } : undefined };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const parsed = parseHelperRequest(body);
    if (!parsed) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const { prompt, brandContext, useBrand, mode, style } = parsed;

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

    const activeHint = (mode && modeHints[mode]) || styleHints[styleKey] || styleHints.studio;

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

    // Model, 80-token cap and temperature live in LLM_TASKS.conceptSeed. The cap is
    // deliberate: this is a 15-40 word seed; the Creative Direction Engine adds the rest.
    const suggestion = (await complete({ task: "conceptSeed", system: systemPrompt, user: userMessage })).trim();
    return NextResponse.json({ suggestion });

  } catch (error) {
    // Logged server-side only. Provider error text never reaches the client.
    console.error("AI Prompt Helper Error:", error);
    return NextResponse.json({ error: "Failed to generate prompt" }, { status: 500 });
  }
}
