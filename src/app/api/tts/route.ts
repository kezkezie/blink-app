import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { text, voice = "onyx" } = await req.json();

        if (!text) return new NextResponse("Missing text", { status: 400 });
        if (!process.env.OPENAI_API_KEY) return new NextResponse("Missing OpenAI API Key in env", { status: 500 });

        const response = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "tts-1",
                input: text,
                voice: voice,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Disposition": `attachment; filename="narration.mp3"`,
            },
        });
    } catch (error: any) {
        console.error("TTS API Error:", error);
        return new NextResponse(error.message, { status: 500 });
    }
}