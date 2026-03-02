import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { mode, companyName, industry, description, userConcept } =
      await req.json();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const promptContext = userConcept
      ? `The user typed this rough idea: "${userConcept}". Polish it into a clean, short concept.`
      : `The user hasn't specified an item. Suggest a generic short concept suitable for a ${industry} brand.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant for a SaaS platform. Your job is ONLY to help the user write a SHORT "Visual Concept" (Maximum 15 words) for their video.
          
          CRITICAL RULES:
          1. DO NOT write camera instructions (no "4k", "pan", "macro lens").
          2. DO NOT write lighting instructions.
          3. Keep it to a maximum of 15 words.
          4. Just describe the basic action or the setting cleanly.
          
          Brand Context: ${companyName || "A brand"} (${industry || "General"})
          ${promptContext}`,
        },
      ],
    });

    return NextResponse.json({
      suggestion: completion.choices[0].message.content?.trim(),
    });
  } catch (error) {
    console.error("AI Video Suggest Error:", error);
    return NextResponse.json(
      { error: "Failed to generate video script" },
      { status: 500 }
    );
  }
}
