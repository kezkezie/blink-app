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
import { loadOwnedBrandCreativeContext, toVideoWorkflowFields, type BrandCreativeContext } from "@/lib/brand-creative-context";
import { n8nWebhookUrl } from "@/lib/n8n-config";
import { after } from "next/server";
import { specFromScene } from "@/lib/video-rescue";
import { CLINICAL_DIRECTION, REFUSAL, SENSITIVE, softenForAi } from "@/lib/ai-safe-text";

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
    let brandCtx: BrandCreativeContext | null = null;
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

      // Scenes came without a brand id, so n8n got "A Premium Brand" and no description
      // (2026-10-18, LADI APP): the brand is the one the scene's post belongs to.
      if (payload.mode === "scene_video_generator" && typeof payload.brand_id !== "string" && typeof payload.post_id === "string" && typeof payload.client_id === "string") {
        const { supabaseAdmin } = await import("@/lib/supabase-server");
        const { data: post } = await supabaseAdmin.from("content").select("brand_id").eq("id", payload.post_id).eq("client_id", payload.client_id).maybeSingle();
        if (typeof post?.brand_id === "string") payload = { ...payload, brand_id: post.brand_id };
      }
      // V6: the Director and scene-video paths receive SERVER-OWNED brand
      // identity. Any browser-supplied brand_name/brand_info is discarded.
      const canonicalBrandId = typeof payload.brand_id === "string" ? payload.brand_id : null;
      if (canonicalBrandId) {
        const brandContext = await loadOwnedBrandCreativeContext(authenticated.value, canonicalBrandId);
        if (!brandContext.ok) return securityResponse({ status: brandContext.status, error: brandContext.error });
        brandCtx = brandContext.context;
        payload = { ...payload, ...toVideoWorkflowFields(brandContext.context) };
      } else {
        delete payload.brand_name;
        delete payload.brand_info;
      }
      // A sensitive concept (a breast-reconstruction brand's storyboard) made the director refuse:
      // it plans clinical, product-first scenes instead (lib/ai-safe-text.ts).
      if (payload.mode === "director" && typeof payload.prompt === "string" && SENSITIVE.test(payload.prompt)) {
        payload = { ...payload, prompt: `${CLINICAL_DIRECTION}\n\n${softenForAi(payload.prompt)}` };
      }
      // The scene's video prompt, written here inside the brand's world; n8n's own rewrite step
      // (which passed a GPT-4o refusal on as the prompt) is switched off (lib/video-prompt.ts).
      if (payload.mode === "scene_video_generator" && payload.scene_data && typeof payload.scene_data === "object") {
        const d = payload.scene_data as Record<string, unknown>;
        const frames = (d.frames && typeof d.frames === "object" ? d.frames : {}) as Record<string, unknown>;
        if (typeof d.visual_prompt === "string" && d.visual_prompt.trim()) {
          const onBrand = payload.strict_brand_alignment !== false;
          const { writeVideoPrompt } = await import("@/lib/video-prompt-server");
          const { fallbackVideoPrompt } = await import("@/lib/video-prompt");
          // "Prompt enhance" off: the words go as typed (with the brand named when on brand).
          const written = d.ai_enhance === false || payload.ai_enhance === false ? { prompt: fallbackVideoPrompt(d.visual_prompt, brandCtx?.name, brandCtx?.industry, onBrand) } : await writeVideoPrompt({
            scene: d.visual_prompt, context: brandCtx, onBrand, seconds: Number(d.duration) || 5,
            startFrame: typeof frames.start_frame === "string" ? frames.start_frame : null, aspect: typeof payload.aspect_ratio === "string" ? payload.aspect_ratio : null,
          });
          payload = { ...payload, ai_enhance: false, strict_brand_alignment: onBrand, scene_data: { ...d, visual_prompt: written.prompt, ai_enhance: false } };
        }
      }
    }

    // Scene videos (2026-10-18): what a second try needs is kept on the post, and the frames go as
    // pictures the providers can read (an SVG or WebP frame failed with "Image fetch failed").
    const sceneSpec = payload.mode === "scene_video_generator" && payload.video_mode !== "xray_image" && payload.video_mode !== "json_image_edit" ? specFromScene(payload) : null;
    const scenePost = sceneSpec && typeof payload.post_id === "string" && typeof payload.client_id === "string" ? { id: payload.post_id, client: payload.client_id } : null;
    if (scenePost && sceneSpec) {
      const { rememberVideoJob } = await import("@/lib/video-rescue-server");
      const ready = await rememberVideoJob(scenePost.id, scenePost.client, sceneSpec).catch(() => sceneSpec);
      const d = (payload.scene_data && typeof payload.scene_data === "object" ? payload.scene_data : {}) as Record<string, unknown>;
      payload = { ...payload, scene_data: { ...d, frames: { ...((d.frames as object) ?? {}), start_frame: ready.start, end_frame: ready.end } } };
    }
    /** n8n couldn't take the scene at all (down, 502): nothing ran or was charged, so the second try starts now. */
    const rescueNow = async () => {
      if (!scenePost) return false;
      try {
        const [{ supabaseAdmin }, { claimVideoRescue, startVideoRescue }] = await Promise.all([import("@/lib/supabase-server"), import("@/lib/video-rescue-server")]);
        await supabaseAdmin.from("content").update({ generation_state: "failed", generation_error_code: "provider_failure", billing_state: "not_charged", updated_at: new Date().toISOString() }).eq("id", scenePost.id).eq("client_id", scenePost.client).in("generation_state", ["queued", "preparing", "generating"]);
        const { data: row } = await supabaseAdmin.from("content").select("id, generation_state, generation_error_code, billing_state, generation_attempt, creation_metadata").eq("id", scenePost.id).maybeSingle();
        if (!row || !(await claimVideoRescue(row))) return false;
        after(startVideoRescue(scenePost.id).catch(() => {}));
        return true;
      } catch { return false; }
    };

    const n8nRes = await undiciFetch(resolveNanoBananaTarget(payload), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      dispatcher: n8nAgent,
    }).catch(() => null);
    if (!n8nRes) {
      if (await rescueNow()) return NextResponse.json({ success: true, rescued: true });
      return NextResponse.json({ error: "Generation service unavailable" }, { status: 502 });
    }
    const rawText = await n8nRes.text();
    if (!n8nRes.ok) {
      if (n8nRes.status >= 500 && (await rescueNow())) return NextResponse.json({ success: true, rescued: true });
      return NextResponse.json({ error: "Generation service request failed" }, { status: 502 });
    }
    try {
      const parsed = JSON.parse(rawText);
      // n8n answers 200 with a body code when its deduction gate refuses the call.
      if (parsed?.code === "insufficient_credits") {
        return NextResponse.json({ error: "Not enough credits." }, { status: 402 });
      }
      // The director refused instead of planning: say so plainly, with what to try.
      if (payload.mode === "director" && !(Array.isArray(parsed?.scenes) && parsed.scenes.length) && REFUSAL.test(rawText.slice(0, 4000))) {
        return NextResponse.json({ error: "The AI director wouldn't plan this one. It happens with medical and intimate subjects. Try describing the product and the people around it (a consultation, a clinic, the product in its packaging) rather than the body." }, { status: 422 });
      }
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({ success: true, message: rawText.slice(0, 500) });
    }
  } catch {
    return NextResponse.json({ error: "Generation service unavailable" }, { status: 502 });
  }
}
