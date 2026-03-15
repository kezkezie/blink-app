import { NextResponse } from 'next/server';

const N8N_DIRECTOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/ai-director-prompts";
const N8N_GENERATOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/generate-single-frame";

// The standard video generator
const N8N_VIDEO_GENERATOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-generate-video-v1";

// ✨ NEW: Dedicated Webhooks for the Animation Studio tools
const N8N_MOTION_BRUSH_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-motion-brush-v1";
const N8N_MOTION_TRANSFER_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-motion-transfer-v1";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 🚦 Traffic Cop Routing Logic
    let targetUrl = N8N_GENERATOR_URL; // Default to images

    if (body.mode === 'director') {
      targetUrl = N8N_DIRECTOR_URL;
    } else if (body.mode === 'scene_video_generator') {

      // ✨ THE NEW TRAFFIC COP FOR VIDEO SUB-MODES ✨
      if (body.video_mode === 'motion_brush') {
        targetUrl = N8N_MOTION_BRUSH_URL;
      } else if (body.video_mode === 'motion_transfer') {
        targetUrl = N8N_MOTION_TRANSFER_URL;
      } else {
        targetUrl = N8N_VIDEO_GENERATOR_URL; // Standard Video Studio route
      }

    }

    const n8nRes = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const rawText = await n8nRes.text();
    let data;

    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      // If n8n replies with plain text like "Workflow was started" instead of JSON
      if (n8nRes.ok) {
        data = { success: true, message: rawText };
      } else {
        console.error("Raw n8n error response:", rawText);
        throw new Error(`n8n backend failed: ${rawText}`);
      }
    }

    if (!n8nRes.ok) {
      throw new Error(data.message || `n8n responded with status ${n8nRes.status}`);
    }

    return NextResponse.json(data);

  } catch (error: any) {
    console.error("API Route Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}