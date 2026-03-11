import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        // ✨ ADDED: We now receive the style object from the frontend
        const { prompt, brandContext, useBrand, mode, style } = await req.json();
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { error: "Missing OPENAI_API_KEY environment variable" },
                { status: 500 }
            );
        }

        let persona =
            "You are an expert AI visual director. Your goal is to take a user's rough idea and turn it into a detailed, vivid, photographic prompt for an image generator like Midjourney or Stable Diffusion.";

        if (mode === "product_drop") {
            persona =
                "You are an expert product photographer. The user wants to place their product into a scene. Describe the scene in detail, focusing on lighting, shadows, and realism to ensure a perfect composite.";
        } else if (mode === "grid") {
            persona =
                "You are an expert social media curator. The user wants an aesthetic moodboard grid. Describe a cohesive visual theme, color palette, and vibe for a collection of images.";
        }

        const brandConstraints =
            useBrand && brandContext
                ? `\n\nCRITICAL BRAND GUIDELINES (MUST FOLLOW):
        - Brand Name: ${brandContext.name}
        - Industry: ${brandContext.industry}
        - Visual Style: ${brandContext.imageStyle || "Not specified"}
        - Brand Voice/Vibe: ${brandContext.brandVoice || "Professional"}
        Ensure the visual description aligns perfectly with this brand identity.`
                : "\n\nIgnore any specific brand guidelines. Focus purely on making the user's current input visually spectacular.";

        // ✨ ADDED: Injecting the selected visual style into the AI's brain
        const styleConstraints = style ? `\n\nREQUIRED VISUAL AESTHETIC: You must heavily emphasize this specific style in your prompt: "${style.label}". Add lighting, camera angles, and texture keywords that match this definition: "${style.promptAddon}".` : "";

        const systemPrompt = `${persona}
    ${brandConstraints}
    ${styleConstraints}

    IMPORTANT: Output ONLY the final detailed image prompt. Do not add conversational text like "Here is a prompt:".`;

        const userMessage = `User Input: "${prompt || "Make something amazing"}"\n\nDetailed Photographic Prompt:`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.7,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || "OpenAI API Error");
        }

        const suggestion = data.choices[0].message.content.trim();

        return NextResponse.json({ suggestion });

    } catch (error: any) {
        console.error("AI Prompt Helper Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to generate prompt" },
            { status: 500 }
        );
    }
}