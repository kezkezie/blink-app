import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { concept } = await req.json();

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

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Format this concept for an image frame: ${concept}`,
        },
      ],
      max_tokens: 200,
    });

    const suggestion = response.choices[0].message.content?.trim() || "";

    return NextResponse.json({ suggestion });
  } catch (error: any) {
    console.error("Frame prompt format error:", error);
    return NextResponse.json(
      { error: "Failed to format prompt" },
      { status: 500 }
    );
  }
}
