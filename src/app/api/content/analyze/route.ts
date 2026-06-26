import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase-server";
import { cloudinaryVideoPoster } from "@/lib/utils";

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

    const body = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
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
    if (deductError || deductData === false) {
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

    let messages: any[] = [];

    if (canSeeMedia) {
      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: visionUrl } },
          ],
        },
      ];
    } else {
      messages = [{ role: "user", content: prompt }];
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: messages,
        temperature: 0.7,
        response_format: { type: "json_object" }, // Forces JSON output
        max_tokens: 600,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "OpenAI API Error");

    const result = JSON.parse(data.choices[0].message.content.trim());

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