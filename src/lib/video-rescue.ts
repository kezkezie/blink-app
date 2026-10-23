/**
 * Videos that arrive (Kezie, 2026-10-18: "make it airtight so that all generations can be made").
 * The first try stays the n8n video workflow (Kie: Kling and Seedance; Replicate: Sora, Pruna).
 * When it fails on the provider's side (or stalls and the reconciler closes it), the app makes a
 * second try by itself on another provider: Seedance 2.0 on Replicate (the same model as Kie's
 * Seedance 2), or Pruna again for Draft scenes. The second try is charged only when it delivers
 * (the first was refunded), so nothing can be left charged without a video. Pure parts here.
 */

/** What a second try needs, kept on the post (creation_metadata.video_job) when the scene is sent. */
export type VideoJobSpec = {
  prompt: string; start: string | null; end: string | null; seconds: number;
  aspect: string; resolution: "720p" | "1080p"; model: string; audio: boolean;
};

/** The first try's failures worth a second try (not invalid requests, not stuck money). */
export const RESCUABLE = new Set(["provider_failure", "stale_reconciled"]);
/** Scene modes a plain-video second try can't redo: lip-sync and motion copied from a reference. */
export const NO_SECOND_TRY = new Set(["audio_to_video", "motion_brush", "motion_transfer"]);
export const RESCUE_STATUS = "Taking longer than usual: trying another video service";
export const VIDEO_FINAL_FAILURE = "We tried two video services and neither could make this scene right now. Nothing was charged for it. Try again in a few minutes, or change the start frame or the wording a little.";
export const VIDEO_LOW_BALANCE = "The first try failed and your balance is too low for a second one (that try was refunded). Top up in Billing and try again.";

const SEEDANCE_ASPECTS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "9:21"];
const PRUNA_ASPECTS = ["16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "1:1"];

/** Which Replicate model makes the second try, and its input. */
export function rescuePlan(spec: VideoJobSpec): { model: string; input: Record<string, unknown> } {
  const draft = /pruna|p-video/i.test(spec.model);
  if (draft) {
    return {
      model: "prunaai/p-video",
      input: {
        prompt: spec.prompt.slice(0, 2000), duration: Math.min(20, Math.max(1, Math.round(spec.seconds))), resolution: spec.resolution,
        ...(spec.start ? { image: spec.start } : { aspect_ratio: PRUNA_ASPECTS.includes(spec.aspect) ? spec.aspect : "16:9" }),
        ...(spec.end && spec.start ? { last_frame_image: spec.end } : {}),
        // Pruna's filter is off by default on Replicate; ours stays on.
        disable_safety_filter: false,
      },
    };
  }
  return {
    model: "bytedance/seedance-2.0",
    input: {
      prompt: spec.prompt.slice(0, 4000), duration: Math.min(15, Math.max(4, Math.round(spec.seconds))), resolution: spec.resolution,
      aspect_ratio: SEEDANCE_ASPECTS.includes(spec.aspect) ? spec.aspect : "adaptive",
      ...(spec.start ? { image: spec.start } : {}),
      ...(spec.end && spec.start ? { last_frame_image: spec.end } : {}),
      generate_audio: spec.audio,
    },
  };
}

const url = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);

/** The spec from a Storyboard scene request (/api/video/nano-banana, scene_video_generator). */
export function specFromScene(payload: Record<string, unknown>): VideoJobSpec | null {
  const d = (payload.scene_data && typeof payload.scene_data === "object" ? payload.scene_data : {}) as Record<string, unknown>;
  const frames = (d.frames && typeof d.frames === "object" ? d.frames : {}) as Record<string, unknown>;
  const prompt = typeof d.visual_prompt === "string" ? d.visual_prompt.trim() : "";
  if (!prompt) return null;
  const audio = (d.audio && typeof d.audio === "object" ? d.audio : {}) as Record<string, unknown>;
  // A second try is a plain video model on Replicate: it can't redo a lip-sync (the face comes in
  // primary_image_url and the voice as an audio file, neither of which it takes) or copy motion from
  // a reference video. Without this, a failed lip-sync was "rescued" into a silent stranger talking,
  // and charged (2026-10-23). Those fail and refund instead.
  const mode = String(payload.video_mode ?? d.video_mode ?? "");
  if (NO_SECOND_TRY.has(mode) || (typeof audio.audio_url === "string" && audio.audio_url.trim())) return null;
  return {
    prompt: prompt.slice(0, 4000), start: url(frames.start_frame), end: url(frames.end_frame),
    seconds: Number(d.duration) || 5, aspect: typeof payload.aspect_ratio === "string" ? payload.aspect_ratio : "16:9",
    resolution: payload.video_resolution === "1080p" ? "1080p" : "720p", model: typeof payload.ai_model_override === "string" ? payload.ai_model_override : "auto",
    audio: typeof audio.script === "string" && !!audio.script.trim(),
  };
}

/** The spec from a single shot (/api/workflows, blink-generate-video-v1). */
export function specFromShot(payload: Record<string, unknown>): VideoJobSpec | null {
  const prompt = typeof payload.user_prompt === "string" ? payload.user_prompt.trim() : "";
  if (!prompt) return null;
  return {
    prompt: prompt.slice(0, 4000), start: url(payload.primary_image_url), end: url(payload.secondary_image_url),
    seconds: Number(payload.duration) || 5, aspect: typeof payload.aspect_ratio === "string" ? payload.aspect_ratio : "16:9",
    resolution: payload.video_resolution === "1080p" ? "1080p" : "720p", model: typeof payload.ai_model_override === "string" ? payload.ai_model_override : "auto",
    audio: false,
  };
}

export function validVideoSpec(raw: unknown): VideoJobSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.prompt !== "string" || !r.prompt.trim()) return null;
  return {
    prompt: r.prompt.slice(0, 4000), start: url(r.start), end: url(r.end), seconds: Number(r.seconds) || 5,
    aspect: typeof r.aspect === "string" ? r.aspect : "16:9", resolution: r.resolution === "1080p" ? "1080p" : "720p",
    model: typeof r.model === "string" ? r.model : "auto", audio: r.audio === true,
  };
}

/** Should this post get a second try now? Only a failed first try, nobody charged, and only once. */
export function needsRescue(row: { generation_state?: unknown; generation_error_code?: unknown; billing_state?: unknown; generation_attempt?: unknown; creation_metadata?: unknown }) {
  const meta = (row.creation_metadata && typeof row.creation_metadata === "object" ? row.creation_metadata : {}) as { video_job?: unknown; video_rescue?: unknown };
  return row.generation_state === "failed"
    && RESCUABLE.has(String(row.generation_error_code ?? ""))
    && (row.billing_state === "refunded" || row.billing_state === "not_charged")
    && (Number(row.generation_attempt) || 1) < 2
    && !meta.video_rescue
    && !!validVideoSpec(meta.video_job);
}
