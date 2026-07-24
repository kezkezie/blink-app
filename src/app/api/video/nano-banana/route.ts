import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch } from "undici";
import {
  authenticateExecutionRequest,
  authorizeGenericExecutionPayload,
  authorizeSemanticImage,
  isExecutionBodySizeAllowed,
  parseSemanticImageRequest,
} from "@/lib/execution-security";

export const maxDuration = 300;

const n8nAgent = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 });
const N8N_DIRECTOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/ai-director-prompts";
const N8N_GENERATOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/generate-single-frame";
const N8N_VIDEO_GENERATOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-generate-video-v1";
const N8N_MOTION_BRUSH_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-motion-brush-v1";
const N8N_MOTION_TRANSFER_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-motion-transfer-v1";
const N8N_XRAY_IMAGE_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-xray-image-v1";
const N8N_JSON_EDIT_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-json-edit-v1";
const ALLOWED_MODES = new Set(["director", "generator", "manual", "scene_video_generator"]);

function securityResponse(result: { status: number; error: string }) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

export function resolveNanoBananaTarget(body: Record<string, unknown>) {
  if (body.mode === "director") return N8N_DIRECTOR_URL;
  if (body.mode !== "scene_video_generator") return N8N_GENERATOR_URL;
  const sceneData = body.scene_data && typeof body.scene_data === "object"
    ? body.scene_data as Record<string, unknown>
    : null;
  const videoMode = body.video_mode || sceneData?.video_mode || "standard";
  if (videoMode === "motion_brush") return N8N_MOTION_BRUSH_URL;
  if (videoMode === "motion_transfer") return N8N_MOTION_TRANSFER_URL;
  if (videoMode === "xray_image") return N8N_XRAY_IMAGE_URL;
  if (videoMode === "json_image_edit") return N8N_JSON_EDIT_URL;
  return N8N_VIDEO_GENERATOR_URL;
}

export async function POST(req: NextRequest) {
  try {
    const authenticated = await authenticateExecutionRequest(req);
    if (!authenticated.ok) return securityResponse(authenticated);
    if (!isExecutionBodySizeAllowed(req)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    if (!(req.headers.get("content-type") || "").includes("application/json")) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const raw = body as Record<string, unknown>;

    let payload: Record<string, unknown>;
    if (raw.video_mode === "xray_image" || raw.video_mode === "json_image_edit") {
      const parsed = parseSemanticImageRequest(raw);
      if (!parsed) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      const authorized = await authorizeSemanticImage(authenticated.value, parsed);
      if (!authorized.ok) return securityResponse(authorized);
      payload = authorized.value;
    } else {
      if (typeof raw.mode !== "string" || !ALLOWED_MODES.has(raw.mode)) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const authorized = await authorizeGenericExecutionPayload(authenticated.value, raw);
      if (!authorized.ok) return securityResponse(authorized);
      payload = authorized.value;
    }

    const n8nRes = await undiciFetch(resolveNanoBananaTarget(payload), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      dispatcher: n8nAgent,
    });
    const rawText = await n8nRes.text();
    if (!n8nRes.ok) {
      return NextResponse.json({ error: "Generation service request failed" }, { status: 502 });
    }
    try {
      return NextResponse.json(JSON.parse(rawText));
    } catch {
      return NextResponse.json({ success: true, message: rawText.slice(0, 500) });
    }
  } catch {
    return NextResponse.json({ error: "Generation service unavailable" }, { status: 502 });
  }
}
