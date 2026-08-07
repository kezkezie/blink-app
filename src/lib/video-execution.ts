// Strict, bounded request validation for the video execution surfaces (V1).
//
// These parsers are the server-side contract for every video route: they reject
// unknown modes, unknown models, invalid durations/aspect ratios, oversize
// prompts, and unsafe URLs BEFORE any provider, n8n, or database work. Tenant
// identity (client/brand/post) is never trusted from these payloads — it is
// re-derived and ownership-checked by the shared execution-security helpers
// after parsing.

import {
  allProviderRenderableDurations,
  resolveEffectiveVideoModel,
  resolveVideoModel,
  allVideoAspectRatios,
  allVideoResolutions,
  validateVideoModelOptions,
  videoModelIds,
} from "@/lib/video-model-registry";

// ── Allowlists (verified against the video page, storyboard route, Director
// instructions, and StorytellingSetup as of V1; models/durations/aspects are
// now DERIVED from the video model registry — V11 foundation) ────────────────

// Production video "modes" carried on the video-generation payload. Union of the
// five UI mode cards, the Director/storyboard-emitted `kling_keyframe`, and the
// `standard` default used by the agent route and nano-banana fallback.
export const VIDEO_MODES = new Set([
  "ugc", "showcase", "clothing", "logo_reveal", "storytelling", "kling_keyframe", "standard",
]);

// nano-banana scene video modes additionally include the motion sub-modes that
// select the motion webhooks.
export const NANO_VIDEO_MODES = new Set([...VIDEO_MODES, "motion_brush", "motion_transfer"]);

// Every video model the UI, Director, or agent route can select — DERIVED from
// the model registry, so adding a model there automatically makes it acceptable
// at the execution boundary (and nowhere else needs editing).
export const VIDEO_MODELS = new Set(videoModelIds());

// Durations / aspect ratios accepted at the execution boundary. Coarse filter:
// every duration ANY model can actually RENDER — deliberately not the union of UI
// option lists, which is narrower (Sora renders 12s that no picker offers). This
// rejects values no model could ever use; the per-model gate in each parser
// (`validateVideoModelOptions`) then rejects values THIS model cannot render, so
// an unrenderable length can never reach billing and be clamped after payment.
export const VIDEO_DURATIONS = new Set(allProviderRenderableDurations());
export const VIDEO_ASPECT_RATIOS = new Set(allVideoAspectRatios());
// Resolutions: registry values (gemini 720p/1080p/4k) plus the GPT-Image-2
// frame resolutions (1K/2K/4K) the storyboard image path sends on the same payload.
export const VIDEO_RESOLUTIONS = new Set([...allVideoResolutions(), "1K", "2K", "4K"]);
export const TTS_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);
// The video page passes the selected mode card straight through (including
// "storytelling"); accept every card so AI Suggest never 400s.
export const SUGGEST_MODES = new Set(["showcase", "ugc", "clothing", "logo_reveal", "storytelling", "standard"]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PROMPT = 8_000;

// ── shared helpers ───────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

// Present-but-oversize is a rejection, not a silent truncation.
function boundedString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  if (value.length > max) return null;
  return value.trim();
}

function optionalUuid(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

// https-only, length-bounded URL, or null for absent/blank. Returns `false` for
// an invalid (non-https, malformed, oversize) value so callers can reject.
function safeUrlOrAbsent(value: unknown): string | null | false {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : false;
  } catch {
    return false;
  }
}

function coerceDuration(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return undefined;
  const asString = typeof value === "number" ? String(value) : value;
  if (typeof asString !== "string") return null;
  return VIDEO_DURATIONS.has(asString) ? asString : null;
}

// ── OpenAI-proxy route bodies ────────────────────────────────────────────────

export type VideoSuggestInput = {
  mode: string;
  companyName: string;
  industry: string;
  description: string;
  userConcept: string;
};

export function parseVideoSuggestRequest(value: unknown): VideoSuggestInput | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, ["mode", "companyName", "industry", "description", "userConcept"])) return null;
  const mode = value.mode === undefined ? "showcase" : value.mode;
  if (typeof mode !== "string" || !SUGGEST_MODES.has(mode)) return null;
  const companyName = boundedString(value.companyName, 200);
  const industry = boundedString(value.industry, 200);
  const description = boundedString(value.description, 4_000);
  const userConcept = boundedString(value.userConcept, 4_000);
  if (companyName === null || industry === null || description === null || userConcept === null) return null;
  return { mode, companyName, industry, description, userConcept };
}

export type VideoStoryboardInput = { concept: string; brandName: string; industry: string };

export function parseVideoStoryboardRequest(value: unknown): VideoStoryboardInput | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, ["concept", "brandName", "industry"])) return null;
  const concept = boundedString(value.concept, 4_000);
  const brandName = boundedString(value.brandName, 200);
  const industry = boundedString(value.industry, 200);
  if (!concept || brandName === null || industry === null) return null;
  return { concept, brandName, industry };
}

export type VideoSuggestFrameInput = { concept: string };

export function parseVideoSuggestFrameRequest(value: unknown): VideoSuggestFrameInput | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, ["concept"])) return null;
  const concept = boundedString(value.concept, 4_000);
  if (!concept) return null;
  return { concept };
}

export type TtsInput = { text: string; voice: string };

export function parseTtsRequest(value: unknown): TtsInput | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, ["text", "voice"])) return null;
  const text = boundedString(value.text, 4_000);
  if (!text) return null;
  const voice = value.voice === undefined ? "onyx" : value.voice;
  if (typeof voice !== "string" || !TTS_VOICES.has(voice)) return null;
  return { text, voice };
}

// ── blink-generate-video-v1 workflow payload (strict, closed key set) ─────────

export type VideoWorkflowInput = {
  requestedClientId?: string;
  requestedBrandId?: string;
  postId?: string;
  payload: Record<string, unknown>;
};

const VIDEO_WORKFLOW_KEYS = [
  "client_id", "brand_id", "post_id", "video_mode",
  "primary_image_url", "secondary_image_url", "user_prompt", "is_sequence",
  "brand_name", "brand_info", "ai_model_override", "duration",
  "strict_brand_alignment", "aspect_ratio", "ai_enhance",
] as const;

export function parseVideoWorkflowRequest(value: unknown): VideoWorkflowInput | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, VIDEO_WORKFLOW_KEYS)) return null;

  const requestedClientId = optionalUuid(value.client_id);
  const requestedBrandId = optionalUuid(value.brand_id);
  const postId = optionalUuid(value.post_id);
  if (requestedClientId === null || requestedBrandId === null || postId === null) return null;

  const payload: Record<string, unknown> = {};

  if (value.video_mode !== undefined) {
    if (typeof value.video_mode !== "string" || !VIDEO_MODES.has(value.video_mode)) return null;
    payload.video_mode = value.video_mode;
  }
  if (value.ai_model_override !== undefined) {
    if (typeof value.ai_model_override !== "string" || !VIDEO_MODELS.has(value.ai_model_override)) return null;
    payload.ai_model_override = value.ai_model_override;
  }
  if (value.aspect_ratio !== undefined) {
    if (typeof value.aspect_ratio !== "string" || !VIDEO_ASPECT_RATIOS.has(value.aspect_ratio)) return null;
    payload.aspect_ratio = value.aspect_ratio;
  }
  const duration = coerceDuration(value.duration);
  if (duration === null) return null;
  if (duration !== undefined) payload.duration = duration;

  for (const [key, url] of [
    ["primary_image_url", value.primary_image_url],
    ["secondary_image_url", value.secondary_image_url],
  ] as const) {
    const safe = safeUrlOrAbsent(url);
    if (safe === false) return null;
    if (safe !== null) payload[key] = safe;
  }

  const userPrompt = boundedString(value.user_prompt, MAX_PROMPT);
  const brandName = boundedString(value.brand_name, 200);
  const brandInfo = boundedString(value.brand_info, 4_000);
  if (userPrompt === null || brandName === null || brandInfo === null) return null;
  if (userPrompt) payload.user_prompt = userPrompt;
  if (brandName) payload.brand_name = brandName;
  if (brandInfo) payload.brand_info = brandInfo;

  for (const key of ["is_sequence", "strict_brand_alignment", "ai_enhance"] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "boolean") return null;
      payload[key] = value[key];
    }
  }

  // PER-MODEL gate. The allowlists above only reject values no model could ever
  // use; this rejects combinations THIS model cannot render — before any credit is
  // deducted. Previously a too-long duration passed here, was billed in full, and
  // was then silently clamped for the provider (Kling 300s billed 3600 credits for
  // a 15s video). `auto` is resolved first so we validate the model that will run.
  if (
    validateVideoModelOptions({
      model: typeof payload.ai_model_override === "string" ? payload.ai_model_override : null,
      videoMode: typeof payload.video_mode === "string" ? payload.video_mode : null,
      duration: typeof payload.duration === "string" ? payload.duration : null,
      aspectRatio: typeof payload.aspect_ratio === "string" ? payload.aspect_ratio : null,
      // An end frame on a model that cannot consume one is rejected here, before
      // any n8n work or deduction — a manipulated request must not be able to
      // trigger a paid end-frame image on an unsupported model.
      hasEndFrame: typeof payload.secondary_image_url === "string" && payload.secondary_image_url.length > 0,
    })
  ) {
    return null;
  }

  return {
    ...(requestedClientId ? { requestedClientId } : {}),
    ...(requestedBrandId ? { requestedBrandId } : {}),
    ...(postId ? { postId } : {}),
    payload,
  };
}

// ── nano-banana video-mode validation gate (compatibility adapter) ────────────
//
// The Storyboard Sheet's Director/frame/scene-video requests carry an ad-hoc,
// still-evolving payload (the untyped `StoryboardScene`; a strict SceneSpec
// schema is V2). Rather than a closed key set that would break that working
// flow, this validates the SECURITY-CRITICAL fields wherever they appear —
// modes, models, durations, aspect ratios, resolutions, prompt lengths, and the
// provider-consumed video/frame URLs — and rejects the request if any is
// invalid. Unknown fields pass through to be canonicalized by
// authorizeGenericExecutionPayload. Returns true when the payload is acceptable.

export function validateNanoVideoPayload(raw: Record<string, unknown>): boolean {
  if (raw.video_mode !== undefined) {
    if (typeof raw.video_mode !== "string" || !NANO_VIDEO_MODES.has(raw.video_mode)) return false;
  }
  if (raw.ai_model_override !== undefined) {
    if (typeof raw.ai_model_override !== "string" || !VIDEO_MODELS.has(raw.ai_model_override)) return false;
  }
  if (raw.aspect_ratio !== undefined) {
    if (typeof raw.aspect_ratio !== "string" || !VIDEO_ASPECT_RATIOS.has(raw.aspect_ratio)) return false;
  }
  if (raw.video_resolution !== undefined) {
    if (typeof raw.video_resolution !== "string" || !VIDEO_RESOLUTIONS.has(raw.video_resolution)) return false;
  }
  if (coerceDuration(raw.duration) === null) return false;
  if (raw.prompt !== undefined && boundedString(raw.prompt, MAX_PROMPT) === null) return false;
  if (safeUrlOrAbsent(raw.referenceVideoUrl) === false) return false;

  const sceneData = raw.scene_data;
  if (sceneData !== undefined) {
    if (!isRecord(sceneData)) return false;
    if (sceneData.video_mode !== undefined) {
      if (typeof sceneData.video_mode !== "string" || !NANO_VIDEO_MODES.has(sceneData.video_mode)) return false;
    }
    if (coerceDuration(sceneData.duration) === null) return false;
    if (sceneData.visual_prompt !== undefined && boundedString(sceneData.visual_prompt, MAX_PROMPT) === null) return false;
    if (safeUrlOrAbsent(sceneData.referenceVideoUrl) === false) return false;
    const frames = sceneData.frames;
    if (frames !== undefined) {
      if (!isRecord(frames)) return false;
      if (safeUrlOrAbsent(frames.start_frame) === false) return false;
      if (safeUrlOrAbsent(frames.end_frame) === false) return false;
    }
  }

  // PER-MODEL gate for the scene-video path (same rule as parseVideoWorkflowRequest).
  // The scene's own duration wins where present, because that is what n8n bills.
  const sceneRecord = isRecord(raw.scene_data) ? raw.scene_data : null;
  const sceneFrames = isRecord(sceneRecord?.frames) ? sceneRecord.frames : null;
  const endFrameUrl = (typeof sceneFrames?.end_frame === "string" && sceneFrames.end_frame)
    || (typeof raw.secondary_image_url === "string" && raw.secondary_image_url)
    || null;
  const startFrameUrl = (typeof sceneFrames?.start_frame === "string" && sceneFrames.start_frame)
    || (typeof raw.primary_image_url === "string" && raw.primary_image_url)
    || null;
  const castingRecord = isRecord(sceneRecord?.casting) ? sceneRecord.casting : null;
  const actorSheetUrl = (typeof castingRecord?.actor_1_sheet === "string" && castingRecord.actor_1_sheet)
    || (typeof castingRecord?.actor1Sheet === "string" && castingRecord.actor1Sheet)
    || null;
  const effectiveDuration = sceneRecord?.duration ?? raw.duration;
  const effectiveMode = (typeof sceneRecord?.video_mode === "string" ? sceneRecord.video_mode : null)
    ?? (typeof raw.video_mode === "string" ? raw.video_mode : null);
  const requestedModelId = typeof raw.ai_model_override === "string" ? raw.ai_model_override : null;
  // General references = every supplied image MINUS the ones the model consumes as
  // a temporal start/end frame. See the taxonomy on VideoModelSpec: a first or last
  // frame is NOT a general reference slot.
  const effectiveSpec = resolveVideoModel(resolveEffectiveVideoModel(requestedModelId, effectiveMode));
  const suppliedImages = [startFrameUrl, endFrameUrl, actorSheetUrl].filter(Boolean).length;
  const consumedAsFrames = effectiveSpec
    ? (effectiveSpec.startFrameField && startFrameUrl ? 1 : 0) + (effectiveSpec.endFrameField && endFrameUrl ? 1 : 0)
    : 0;
  const generalReferenceCount = Math.max(0, suppliedImages - consumedAsFrames);
  // The `frames.end_frame` CHANNEL is overloaded by the serializer: for models with
  // an `endFrameField` it really is a last frame, but for reference-based models
  // (Seedance) it carries the SECOND GENERAL REFERENCE. So an end frame is only
  // "requested" when the model would treat it temporally, or when the model cannot
  // use a second image at all — in which case it is invalid either way.
  const endFrameIsTemporal = Boolean(endFrameUrl)
    && (effectiveSpec ? effectiveSpec.endFrameField !== null || effectiveSpec.generalReferenceSlots < 2 : true);
  // Only gate a request that actually names a duration; Director/frame helper
  // calls carry no duration and must keep working.
  if ((endFrameUrl || generalReferenceCount > 0) && raw.ai_model_override !== undefined) {
    // Checked even when no duration is named, so an end frame can never slip
    // through on a Director/frame-helper shaped payload.
    if (
      validateVideoModelOptions({
        model: typeof raw.ai_model_override === "string" ? raw.ai_model_override : null,
        videoMode: effectiveMode,
        hasEndFrame: endFrameIsTemporal,
        generalReferenceCount,
      })
    ) {
      return false;
    }
  }
  if (effectiveDuration !== undefined && effectiveDuration !== null && String(effectiveDuration) !== "") {
    if (
      validateVideoModelOptions({
        model: typeof raw.ai_model_override === "string" ? raw.ai_model_override : null,
        videoMode: effectiveMode,
        duration: String(effectiveDuration),
        aspectRatio: typeof raw.aspect_ratio === "string" ? raw.aspect_ratio : null,
        hasEndFrame: endFrameIsTemporal,
        generalReferenceCount,
      })
    ) {
      return false;
    }
  }
  return true;
}
