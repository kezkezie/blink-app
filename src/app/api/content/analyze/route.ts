import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { mediaUrl, mediaType, brandVoice, dos, donts, context } =
      await req.json();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const isImage = mediaType.startsWith("image/");

    let prompt = `You are a world-class Social Media Manager. I need a highly engaging post for this media.
    
    BRAND RULES:
    - Voice/Tone: ${brandVoice || "Professional, engaging, and modern"}
    - DOs: ${dos || "Use engaging hooks"}
    - DONTs: ${donts || "No cringey sales language"}
    
    MEDIA CONTEXT: 
    ${
      context
        ? `The user described this media as: "${context}"`
        : "Analyze the media visually."
    }
    
    CRITICAL INSTRUCTION:
    You MUST return ONLY a valid JSON object. Do not include markdown formatting like \`\`\`json. 
    The JSON object must have EXACTLY these 4 keys:
    {
      "caption_long": "The main engaging body of the post (2-3 paragraphs). Do not include hashtags here.",
      "caption_short": "A punchy 1-sentence hook or title.",
      "hashtags": "A single string of 3-5 relevant hashtags (e.g., '#viral #trending').",
      "call_to_action": "A 1-sentence Call to Action."
    }`;

    let messages: any[] = [];

    if (isImage) {
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
        max_tokens: 500,
      }),
    });

    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error?.message || "OpenAI API Error");

    // Parse the JSON returned by OpenAI
    const result = JSON.parse(data.choices[0].message.content.trim());

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return NextResponse.json(
      { error: "Failed to analyze media" },
      { status: 500 }
    );
  }
}
