import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { field, companyName, industry, context } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY environment variable" },
        { status: 500 }
      );
    }

    const prompt = `You are an expert brand identity strategist. Your client is "${companyName}", operating in the "${industry}" industry.
    Please write a professional, high-quality suggestion for their brand's ${context}. 
    Keep it concise (1 to 3 sentences max). 
    Return ONLY the suggested text. Do not include quotes, markdown, or conversational filler.`;

    // Standard fetch to OpenAI so you don't have to install any new npm packages
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "OpenAI API Error");
    }

    const suggestion = data.choices[0].message.content.trim();

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error("AI Suggestion Error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
