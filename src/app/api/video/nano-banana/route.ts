import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch } from "undici";
import {
  authenticateExecutionRequest,
  authorizeGenericExecutionPayload,
  authorizeSemanticImage,
  isExecutionBodySizeAllowed,
  parseSemanticImageRequest,
} from "@/lib/execution-security";
import { consumeExecutionRateLimit } from "@/lib/execution-rate-limit";
import { validateNanoVideoPayload } from "@/lib/video-execution";
import { loadOwnedBrandCreativeContext, toVideoWorkflowFields } from "@/lib/brand-creative-context";
import { n8nWebhookUrl } from "@/lib/n8n-config";

export const maxDuration = 300;

const n8nAgent = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 });
const ALLOWED_MODES = new Set(["director", "generator", "manual", "scene_video_generator"]);

function securityResponse(result: { status: number; error: string }) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

// Webhook selection is derived only from server-validated fields and mapped to a
// fixed allowlist of webhook names — a caller can never steer a request to an
// arbitrary URL.
export function resolveNanoBananaTarget(body: Record<string, unknown>) {
  if (body.mode === "director") return n8nWebhookUrl("aiDirectorPrompts");
  if (body.mode !== "scene_video_generator") return n8nWebhookUrl("generateSingleFrame");
  const sceneData = body.scene_data && typeof body.scene_data === "object"
    ? body.scene_data as Record<string, unknown>
    : null;
  const videoMode = body.video_mode || sceneData?.video_mode || "standard";
  if (videoMode === "motion_brush") return n8nWebhookUrl("motionBrushV1");
  if (videoMode === "motion_transfer") return n8nWebhookUrl("motionTransferV1");
  if (videoMode === "xray_image") return n8nWebhookUrl("xrayImageV1");
  if (videoMode === "json_image_edit") return n8nWebhookUrl("jsonEditV1");
  return n8nWebhookUrl("generateVideoV1");
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
      // Image-semantic path (unchanged — governed by the Image Studio slices).
      const parsed = parseSemanticImageRequest(raw);
      if (!parsed) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      const authorized = await authorizeSemanticImage(authenticated.value, parsed);
      if (!authorized.ok) return securityResponse(authorized);
      payload = authorized.value;
    } else {
      if (typeof raw.mode !== "string" || !ALLOWED_MODES.has(raw.mode)) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      // Strict bounded validation of the video-critical fields BEFORE any quota
      // consumption or provider/n8n work.
      if (!validateNanoVideoPayload(raw)) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const operation = raw.mode === "scene_video_generator" ? "video_job" : "video_director";
      const rateLimit = await consumeExecutionRateLimit(authenticated.value, operation);
      if (!rateLimit.ok) {
        return NextResponse.json(
          { error: "Video service is temporarily unavailable" },
          { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } }
        );
      }
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { error: "Too many video requests. Please try again later.", retryAt: rateLimit.resetAt },
          { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" } }
        );
      }
      const authorized = await authorizeGenericExecutionPayload(authenticated.value, raw);
      if (!authorized.ok) return securityResponse(authorized);
      payload = authorized.value;

      // V6: the Director and scene-video paths receive SERVER-OWNED brand
      // identity. Any browser-supplied brand_name/brand_info is discarded.
      const canonicalBrandId = typeof payload.brand_id === "string" ? payload.brand_id : null;
      if (canonicalBrandId) {
        const brandContext = await loadOwnedBrandCreativeContext(authenticated.value, canonicalBrandId);
        if (!brandContext.ok) return securityResponse({ status: brandContext.status, error: brandContext.error });
        payload = { ...payload, ...toVideoWorkflowFields(brandContext.context) };
      } else {
        delete payload.brand_name;
        delete payload.brand_info;
      }
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
