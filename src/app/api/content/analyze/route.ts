import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server"; // ✨ IMPORT THE ADMIN CLIENT

export async function POST(req: Request) {
  let clientIdForRefund = null; // Store this globally so the catch block can refund if necessary

  try {
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
    const mediaType = body.mediaType || (mediaUrl?.match(/\.(mp4|mov|webm)$/i) ? "video/mp4" : "image/jpeg");
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

    clientIdForRefund = clientId; // Save it for error handling
    const captionCost = 0.1; // ✨ Set the price for a caption generation

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

    const isImage = mediaType.startsWith("image/");

    // ✨ Dynamic length instruction
    const lengthInstruction = lengthPreference === "short"
      ? "Write a punchy, 1-2 sentence hook or short caption."
      : "Write a detailed, engaging multi-paragraph social media caption. Tell a story.";

    let prompt = `You are a world-class Social Media Manager. I need a highly engaging post for this media.
    
    BRAND RULES:
    - Voice/Tone: ${voice}
    - DOs: ${dos}
    - DONTs: ${donts}
    
    MEDIA CONTEXT: 
    ${userContext ? `The user described this as: "${userContext}"` : "Analyze the media visually."}
    
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

    if (isImage && mediaUrl) {
      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: mediaUrl } },
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
          p_amount: 0.1, // Refund the exact amount charged
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