import { NextResponse } from 'next/server';
import { Agent, fetch as undiciFetch } from 'undici';

// Vercel: allow the function to run the full fluid-compute window (raise to 800 on Pro).
export const maxDuration = 300;

// n8n replies only when the whole generation finishes (5-9 min with multiple
// character sheets under load). Node fetch's default headersTimeout is 300s,
// which killed long runs with "fetch failed" even though n8n succeeded and the
// asset landed in Cloudinary. Dedicated agent raises the ceiling to 15 min.
const n8nAgent = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 });

const N8N_DIRECTOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/ai-director-prompts";
const N8N_GENERATOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/generate-single-frame";
const N8N_VIDEO_GENERATOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-generate-video-v1";
const N8N_MOTION_BRUSH_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-motion-brush-v1";
const N8N_MOTION_TRANSFER_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-motion-transfer-v1";
const N8N_XRAY_IMAGE_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-xray-image-v1";
const N8N_JSON_EDIT_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-json-edit-v1";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log(`[API Proxy] Routing mode '${body.mode}' to n8n.`);

    let targetUrl = N8N_GENERATOR_URL;

    if (body.mode === 'director') {
      targetUrl = N8N_DIRECTOR_URL;
    } else if (body.mode === 'scene_video_generator') {

      // Safely extract the exact video mode
      const videoMode = body.video_mode || (body.scene_data && body.scene_data.video_mode) || 'standard';

      if (videoMode === 'motion_brush') {
        targetUrl = N8N_MOTION_BRUSH_URL;
      } else if (videoMode === 'motion_transfer') {
        targetUrl = N8N_MOTION_TRANSFER_URL;
      } else if (videoMode === 'xray_image') {
        targetUrl = N8N_XRAY_IMAGE_URL;
      } else if (videoMode === 'json_image_edit') {
        targetUrl = N8N_JSON_EDIT_URL;
      } else {
        targetUrl = N8N_VIDEO_GENERATOR_URL;
      }
    }

    // ✨ THE FIX: We AWAIT everything. undiciFetch + n8nAgent bypasses Node fetch's
    // 300s headersTimeout so long generations don't die with "fetch failed".
    const n8nRes = await undiciFetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      dispatcher: n8nAgent
    });

    const rawText = await n8nRes.text();
    let data;

    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      if (n8nRes.ok) {
        data = { success: true, message: rawText };
      } else {
        console.error("Raw n8n error response:", rawText);
        throw new Error(`n8n backend failed: ${rawText}`);
      }
    }

    if (!n8nRes.ok) {
      throw new Error(data.message || data.error || `n8n responded with status ${n8nRes.status}`);
    }

    return NextResponse.json(data);

  } catch (error: any) {
    console.error("API Route Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}