import { NextResponse } from 'next/server';

// ✨ Paste your EXACT "Blink - 4. Video Studio" Production Webhook URL here
const N8N_VIDEO_WEBHOOK = "https://n8n.srv1166077.hstgr.cloud/webhook/generate-video";

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const n8nRes = await fetch(N8N_VIDEO_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!n8nRes.ok) {
            throw new Error(`n8n Video Webhook responded with status ${n8nRes.status}`);
        }

        // Since n8n "responds instantly" for videos, we don't need complex parsing here.
        return NextResponse.json({ success: true, message: "Video generation started" });

    } catch (error: any) {
        console.error("Video API Route Error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}