import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase-server";
import { cloudinaryVideoPoster } from "@/lib/utils";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { complete } from "@/lib/llm";


const LENGTHS = new Set(["short", "long"]);

/** https-only, parseable, bounded. The vision model fetches this URL. */
function isSafeMediaUrl(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true; // media is optional
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const boundedOrAbsent = (v: unknown, max: number) =>
  v === undefined || v === null || (typeof v === "string" && v.length <= max);

function isValidAnalyzeRequest(body: Record<string, any>): boolean {
  if (!body || typeof body !== "object") return false;
  if (!isSafeMediaUrl(body.mediaUrl) || !isSafeMediaUrl(body.imageUrl)) return false;
  if (body.lengthPreference !== undefined && !LENGTHS.has(body.lengthPreference)) return false;
  for (const [key, max] of [["brandVoice", 2000], ["context", 4000], ["dos", 2000], ["donts", 2000], ["mediaType", 100]] as const) {
    if (!boundedOrAbsent(body[key], max)) return false;
  }
  const bc = body.brandContext;
  if (bc !== undefined && bc !== null) {
    if (typeof bc !== "object") return false;
    if (!boundedOrAbsent(bc.brandVoice, 2000) || !boundedOrAbsent(bc.description, 4000)) return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  let clientIdForRefund = null;

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    // Validated BEFORE any ownership check or charge. Every field below is either
    // sent to the vision model (mediaUrl) or interpolated into its prompt.
    if (!isValidAnalyzeRequest(body)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // ✨ Support payloads from BOTH the Upload Page and the Content Detail Page
    const mediaUrl = body.mediaUrl || body.imageUrl;
    const isVideo = !!mediaUrl && (/\.(mp4|mov|webm)(\?.*)?$/i.test(mediaUrl) || mediaUrl.includes("/video/upload/") || body.mediaType?.startsWith("video"));
    // GPT-4o can't watch a video, but it can read a still frame. For Cloudinary
    // videos we derive a representative keyframe so video posts get a caption that
    // actually reflects what's on screen instead of a generic blurb.
    const visionUrl = isVideo ? cloudinaryVideoPoster(mediaUrl) : mediaUrl;
    const canSeeMedia = !!visionUrl;
    const lengthPreference = body.lengthPreference || "long";
    const voice = body.brandVoice || body.brandContext?.brandVoice || "Professional, engaging, and modern";
    const userContext = body.context || body.brandContext?.description || "";
    const dos = body.dos || "Use engaging hooks";
    const donts = body.donts || "No cringey sales language";

    // We need the clientId to charge them!
    const clientId = body.clientId;

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId for billing." }, { status: 400 });
    }

    clientIdForRefund = clientId;

    const { data: clientOwner } = await supabaseAdmin.from("clients")
      .select("id").eq("user_id", user.id).eq("id", clientId).single();
    if (!clientOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const captionCost = 1;

    // ─── BILLING: DEDUCT CREDITS UPFRONT ───
    const { data: deductData, error: deductError } = await supabaseAdmin.rpc(
      "deduct_credits",
      {
        p_client_id: clientId,
        p_amount: captionCost,
        p_operation: "caption_generation",
        p_description: `AI Caption Generation (${lengthPreference})`
      }
    );

    // If the RPC fails or returns false (insufficient balance), halt the operation
    if (!isDeductionSuccessful(deductData, deductError)) {
      return NextResponse.json(
        { error: "Insufficient credits to generate caption. Please top up." },
        { status: 402 } // 402 Payment Required
      );
    }
    // ────────────────────────────────────────

    // ✨ Dynamic length instruction
    const lengthInstruction = lengthPreference === "short"
      ? "Write a punchy, 1-2 sentence hook or short caption."
      : "Write a detailed, engaging multi-paragraph social media caption. Tell a story.";

    // The visual analysis directive is what makes the caption SPECIFIC to this
    // exact post. Brand voice shapes the tone but must NOT override what's shown.
    const visualDirective = canSeeMedia
      ? `FIRST, look closely at the attached ${isVideo ? "video keyframe" : "image"} and note exactly what is shown — the real subject/product, the setting, colours, mood, and any visible text or logos. Your caption MUST be specific to what is actually in THIS visual: reference the real subject and concrete details you can see. Do NOT write a generic brand blurb that could apply to any post.`
      : `No media preview is available, so write from the context below.`;

    let prompt = `You are a world-class Social Media Manager writing a post for ONE specific piece of media.

${visualDirective}

BRAND VOICE (controls tone/style only — it must not replace what is in the media):
- Voice/Tone: ${voice}
- DOs: ${dos}
- DONTs: ${donts}
${userContext ? `\nSECONDARY CONTEXT (use only to support what you see, never instead of it): "${userContext}"` : ""}

CRITICAL INSTRUCTION:
${lengthInstruction}

You MUST return ONLY a valid JSON object. Do not include markdown formatting like \`\`\`json.
The JSON object must have EXACTLY these 4 keys:
{
  "caption_long": "The main engaging body of the post (if requested long, make it 2-3 paragraphs. If short, just repeat the short hook here).",
  "caption_short": "A punchy 1-sentence hook or title.",
  "hashtags": "A single string of 3-5 relevant hashtags (e.g., '#viral #trending').",
  "call_to_action": "A 1-sentence Call to Action."
}`;

    // Vision when media is available. Model/limits: LLM_TASKS.contentAnalyze.
    const content = await complete({
      task: "contentAnalyze",
      system: "You are a world-class social media manager. Respond with a JSON object only.",
      user: prompt,
      json: true,
      ...(canSeeMedia ? { images: [{ url: visionUrl }] } : {}),
    });

    const result = JSON.parse(content.trim());

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI Analysis Error:", error);

    // ─── BILLING: REFUND ON CRASH ───
    if (clientIdForRefund) {
      try {
        await supabaseAdmin.rpc("refund_credits", {
          p_client_id: clientIdForRefund,
          p_amount: 1,
          p_operation: "refund",
          p_description: "Refund: Caption generation failed"
        });
        console.log(`Refunded 0.1 credits to ${clientIdForRefund}`);
      } catch (refundError) {
        console.error("Critical failure: Could not refund credits after crash.", refundError);
      }
    }
    // ────────────────────────────────────────

    return NextResponse.json(
      { error: "Failed to analyze media" },
      { status: 500 }
    );
  }
}