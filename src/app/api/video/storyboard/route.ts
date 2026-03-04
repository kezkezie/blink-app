import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { concept, brandName, industry } = await req.json();

    const systemPrompt = `
    You are an elite Commercial Director for '${brandName}' (Industry: ${industry}).
    The user will provide a concept for a commercial video.
    Your job is to break this concept down into a highly engaging, multi-scene storyboard sequence.
    
    You must return a STRICT JSON array of objects. Do not use markdown blocks.
    
    Each object in the array must have exactly these keys:
    - "mode": Must be exactly one of: "showcase", "logo_reveal", "ugc", "clothing", or "kling_keyframe".
    - "duration": Must be exactly "5" or "10".
    - "prompt": A highly technical, cinematic 30-word visual description of what happens in this specific scene.
    
    Rules for Modes:
    - Use "logo_reveal" for dramatic 3D product intros.
    - Use "showcase" for cinematic camera pans.
    - Use "kling_keyframe" if the scene requires dynamic human/object motion and physics.
    
    Example Output:
    {
      "scenes": [
        { "mode": "logo_reveal", "duration": "5", "prompt": "Dynamic 3D reveal bursting from liquid gold..." },
        { "mode": "kling_keyframe", "duration": "10", "prompt": "Slow macro pan across the surface texture..." }
      ]
    }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Create a storyboard for this concept: ${concept}`,
        },
      ],
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Storyboard generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate storyboard" },
      { status: 500 }
    );
  }
}
