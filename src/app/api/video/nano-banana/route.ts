import { NextResponse } from 'next/server';

const N8N_DIRECTOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/ai-director-prompts";
const N8N_GENERATOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/generate-single-frame";
const N8N_VIDEO_GENERATOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-generate-video-v1";
const N8N_MOTION_BRUSH_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-motion-brush-v1";
const N8N_MOTION_TRANSFER_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-motion-transfer-v1";

// Dedicated Webhooks for the JSON Image Studio
const N8N_XRAY_IMAGE_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-xray-image-v1";
const N8N_JSON_EDIT_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-json-edit-v1";

// Long-running video modes that should fire-and-forget (5-15 min AI tasks).
// n8n will PATCH the Supabase row when done. Frontend listens via supabase.channel().
const FIRE_AND_FORGET_VIDEO_MODES = new Set([
  'standard',         // default video generation
  'motion_brush',
  'motion_transfer',
]);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 🐛 DEBUG LOG
    console.log(`[API Proxy] Routing mode '${body.mode}' to n8n. Payload contains client_id:`, !!body.client_id || !!body.clientId);

    let targetUrl = N8N_GENERATOR_URL;
    let isLongRunning = false;

    if (body.mode === 'director') {
      targetUrl = N8N_DIRECTOR_URL;
    } else if (body.mode === 'scene_video_generator') {

      // ✨ THE BUG FIX: Extract video_mode safely, checking inside scene_data if necessary
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

      // Determine if this is a long-running mode
      if (FIRE_AND_FORGET_VIDEO_MODES.has(videoMode)) {
        isLongRunning = true;
      }
    }

    // ─── FIRE-AND-FORGET for long-running AI video generation ───
    if (isLongRunning) {
      fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch((err) => console.error("Fire-and-forget n8n error:", err));

      return NextResponse.json({
        success: true,
        message: "Generation started. You'll be notified when it's ready.",
      });
    }

    // ─── AWAIT for fast operations (director prompts, xray, json edits, image gen) ───
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