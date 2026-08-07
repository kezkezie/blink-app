/**
 * Video model registry — the SINGLE place a video model is defined.
 *
 * Adding a model used to mean editing five places: the `VIDEO_MODELS` allowlist,
 * the duration/aspect/resolution allowlists, the prompt-dialect family map, the
 * end-frame capability check, and the UI option lists — plus the Director
 * rulebook in n8n. Miss one and the model half-works. This registry collapses
 * the app-side four into one entry; the n8n side is covered by the drift test at
 * the bottom of this file.
 *
 * It mirrors the shape of the Image Studio registry (`image-engine-pricing.ts`)
 * deliberately, including the "never trust a price from the browser" rule.
 *
 * ── Cost provenance (verified 2026-07-29 against the n8n export
 *    "Blink - Generate Video V3 (Pro Bypass & Cloudinary Scale)", node
 *    "Parse Inputs & Calculate Cost") ──────────────────────────────────────
 *
 *   let perSecCost = 12;                        // default fallback
 *   if (model.includes('seedance'))    perSecCost = 20;
 *   else if (model.includes('kling') || model.includes('sora')) perSecCost = 12;
 *   else if (model.includes('pruna'))  perSecCost = 4;
 *   else if (model.includes('gemini')) perSecCost = 20;   // re-mirrored 2026-08-06
 *   if (hasAudioUrl || hasAudioScript || promptHasDialogue) perSecCost += 4;
 *   const totalCost = duration * perSecCost;
 *
 *   The gemini branch was missing from this mirror until 2026-08-06, so the
 *   registry advertised 12/sec while the workflow charged 20/sec — and the drift
 *   test asserted the wrong number, hiding it. See GEMINI_CREDITS_PER_SECOND.
 *
 *   Billing uses the VALIDATED duration. The workflow no longer clamps a
 *   too-long duration down to a renderable one while charging for the requested
 *   length; unsupported durations are rejected before any deduction.
 *
 *   Auto-selection (same node):
 *     videoMode 'ugc'      -> kling-3.0/video
 *     videoMode 'clothing' -> prunaai/p-video
 *     otherwise            -> seedance-2
 *
 * IMPORTANT: video pricing is PER SECOND (unlike images, which are per image),
 * and n8n matches the model by SUBSTRING, so the app's fully-qualified ids
 * (`replicate:prunaai/p-video`) and n8n's short ids (`prunaai/p-video`) both
 * resolve to the same price. `providerMatch` records the substring that decides
 * it, and the drift test asserts every registry entry prices identically under
 * the mirrored n8n rules.
 *
 * The estimate here is for DISPLAY and capability gating only. n8n remains the
 * billing authority: it computes and deducts the real cost.
 */

/** Prompt dialect / capability family (mirrors `getModelFamily`). */
export type VideoModelFamily = "kling" | "seedance" | "pruna" | "sora" | "gemini";

export interface VideoModelSpec {
  /** App-facing model id — the only value the UI and payloads use. */
  id: string;
  /** Human label for pickers. */
  label: string;
  /** Prompt dialect family (drives INJECT_PRESETS and Director formatting). */
  family: VideoModelFamily;
  /** Substring n8n's pricing switch matches on. */
  providerMatch: string;
  /** Verified per-second credit cost (before the audio surcharge). */
  creditsPerSecond: number;
  /** Durations the UI OFFERS, in seconds (string form, as the UI/payload use).
   *  Must be a subset of what the provider can render — enforced by a drift test. */
  durations: readonly string[];
  /**
   * What the PROVIDER can actually render. This, not `durations`, is the
   * rejection gate: `durations` is only what we choose to offer, and other
   * surfaces (Director, storyboard scenes) legitimately request in-range values
   * we do not list as UI options. Exactly one of these is set per model.
   */
  providerDurationRange?: readonly [number, number];
  /** For models that accept only discrete lengths (Gemini snaps to 4/6/8/10). */
  providerDurationValues?: readonly number[];
  /** Aspect ratios this model supports. */
  aspectRatios: readonly string[];
  /** Resolutions, only where the UI exposes a choice. */
  resolutions?: readonly string[];
  /** Whether an end/target keyframe is supported. */
  supportsEndFrame: boolean;
  /** Whether the model generates its own audio from the prompt. */
  supportsNativeAudio: boolean;
  /** How many reference images the model accepts (0 = start frame only). */
  referenceSlots: number;
  /** Anything a future maintainer must know. */
  notes?: string;
}

/** Surcharge n8n adds per second when the scene carries audio or dialogue. */
export const AUDIO_SURCHARGE_PER_SECOND = 4;

/** Fallback per-second cost n8n uses for an unrecognised model. */
export const DEFAULT_CREDITS_PER_SECOND = 12;

/**
 * Gemini Omni Video's per-second rate — the ONE place this decision lives.
 *
 * Canonical value: 20 credits/sec. Evidence (2026-08-06):
 *  - Live n8n has always charged 20/sec (`Parse Inputs & Calculate Cost` has an
 *    explicit `includes('gemini') -> 20` branch), so 20 is the rate customers
 *    have actually paid.
 *  - Provider cost is ~$0.10/sec at 720p. Pruna is 4 credits/sec at ~$0.02/sec,
 *    i.e. ~200 credits per provider dollar; 0.10 x 200 = 20. So 20 preserves the
 *    same margin ratio and 12 would have been sold below the Pruna ratio.
 *  - 12 was never a pricing decision: it was `DEFAULT_CREDITS_PER_SECOND`
 *    leaking into the registry entry because no gemini branch was mirrored here.
 *  - `estimateVideoCredits` had no callers, so no customer was ever *shown*
 *    12/sec. Adopting 20 therefore creates no historical billing exposure.
 *
 * Changing the price is a business decision: edit this constant and the drift
 * test will force the mirrored n8n rule to agree.
 */
export const GEMINI_CREDITS_PER_SECOND = 20;

const STANDARD_ASPECTS = ["16:9", "9:16", "1:1", "21:9"] as const;

/**
 * Every video model the app offers. **Adding a model is this entry plus nothing
 * else on the app side** — allowlists, capability checks and the family map all
 * derive from here. Verify the price against the n8n cost rules first; the drift
 * test will fail if they disagree.
 */
export const VIDEO_MODEL_REGISTRY: Readonly<Record<string, VideoModelSpec>> = Object.freeze({
  "kling-3.0/video": {
    id: "kling-3.0/video",
    label: "Kling 3.0",
    family: "kling",
    providerMatch: "kling",
    creditsPerSecond: 12,
    // Kie docs (2026-08-06): Kling 3.0 supports 3-15s; multi-shot totals must also
    // stay <= 15s. The old "300" ("5 Min Premium") option was never achievable —
    // the provider cannot render it, and the workflow silently clamped it to 15s
    // while billing 300s (3600 credits for a 15s video). Removed.
    durations: ["5", "10", "15"],
    providerDurationRange: [3, 15], // Kie docs 2026-08-06: Kling 3.0 supports 3-15s
    aspectRatios: STANDARD_ASPECTS,
    // TRUE, documented by Kie: `image_urls` carries "First and last frame image
    // URLs ... if length is 2, index 0 is the first frame and index 1 is the last
    // frame". So an end frame is genuinely supported for Kling 3.0.
    supportsEndFrame: true,
    supportsNativeAudio: true,
    referenceSlots: 1,
    notes: "Multi-shot notation and native audio. Provider maximum is 15s. End frame is image_urls[1] per Kie docs.",
  },
  "bytedance/seedance-2": {
    id: "bytedance/seedance-2",
    label: "Seedance 2 (Cinematic)",
    family: "seedance",
    providerMatch: "seedance",
    creditsPerSecond: 20,
    durations: ["5", "10", "15"],
    providerDurationRange: [4, 15], // Seedance 2 accepts 4-15s
    aspectRatios: STANDARD_ASPECTS,
    supportsEndFrame: false,
    supportsNativeAudio: true,
    referenceSlots: 4,
    notes: "No end frame; uses sequential @reference slots instead.",
  },
  "bytedance/seedance-2-fast": {
    id: "bytedance/seedance-2-fast",
    label: "Seedance 2 (Fast)",
    family: "seedance",
    providerMatch: "seedance",
    creditsPerSecond: 20,
    durations: ["5", "10", "15"],
    providerDurationRange: [4, 15],
    aspectRatios: STANDARD_ASPECTS,
    supportsEndFrame: false,
    supportsNativeAudio: true,
    referenceSlots: 4,
  },
  "replicate:openai/sora-2": {
    id: "replicate:openai/sora-2",
    label: "Sora 2 (Replicate)",
    family: "sora",
    providerMatch: "sora",
    creditsPerSecond: 12,
    // CANONICAL, from the machine-readable Replicate schema (model
    // openai/sora-2, version 763a9321f615f4867b1d7a2d, created 2026-01-21):
    //   components.schemas.seconds.enum = [4, 8, 12]
    // Sora accepts a DISCRETE set, not a range. A prose doc saying "typically 4
    // to 12 seconds" was misread as continuous on 2026-08-06, so the UI offered
    // 5 and 10 — both rejected with HTTP 422, charging then refunding the user on
    // every attempt (found live 2026-08-07, exec 68026).
    durations: ["4", "8", "12"],
    providerDurationValues: [4, 8, 12],
    // The same schema pins components.schemas.aspect_ratio.enum =
    // ['portrait','landscape']. The payload builder maps 1:1 -> 'square', which
    // the provider does NOT accept, so 1:1 is withheld here rather than changing
    // the shared builder. 16:9 and 21:9 map to landscape; 9:16 and 3:4 to portrait.
    aspectRatios: ["16:9", "9:16", "21:9"],
    // FALSE, proven from the schema: openai/sora-2's Input has only
    // `input_reference` — there is NO end-frame/tail-frame parameter of any kind.
    // This was `true` until 2026-08-07, and because the UI auto-enabled the end
    // frame from this flag it generated a SECOND PAID IMAGE per scene that the
    // provider never received.
    supportsEndFrame: false,
    supportsNativeAudio: true,
    referenceSlots: 1,
    notes: "Discrete durations 4/8/12s only. No end frame (schema has no such input). 1:1 is unavailable: the builder maps it to 'square', which the provider rejects.",
  },
  "replicate:prunaai/p-video": {
    id: "replicate:prunaai/p-video",
    label: "Pruna AI (Fast)",
    family: "pruna",
    providerMatch: "pruna",
    creditsPerSecond: 4,
    durations: ["5", "10"],
    providerDurationRange: [1, 10], // Replicate docs 2026-08-06: p-video duration 1-10s
    aspectRatios: STANDARD_ASPECTS,
    // TRUE only because Video V3 now passes the selected end frame through the
    // schema's `last_frame_image` input. Before 2026-08-07 this flag was true but
    // the workflow never sent the field, so a paid end-frame image was generated
    // and silently discarded.
    supportsEndFrame: true,
    supportsNativeAudio: false,
    referenceSlots: 1,
    notes: "Cheapest; short direct prompts, draft mode available. End frame is sent as last_frame_image.",
  },
  "gemini-omni-video": {
    id: "gemini-omni-video",
    label: "Gemini Omni Video",
    family: "gemini",
    providerMatch: "gemini",
    creditsPerSecond: GEMINI_CREDITS_PER_SECOND,
    durations: ["4", "6", "8", "10"],
    providerDurationValues: [4, 6, 8, 10], // discrete only; nothing between snaps
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p", "4k"],
    supportsEndFrame: false,
    supportsNativeAudio: false,
    referenceSlots: 1,
    notes:
      "Billed at GEMINI_CREDITS_PER_SECOND (20/sec) — n8n has an explicit gemini pricing branch. Reference-driven transformation; 4/6/8/10s and 16:9 or 9:16 only.",
  },
});

/** The sentinel meaning "let the Director choose". Never a provider model id. */
export const AUTO_VIDEO_MODEL = "auto";

/** Every selectable model id, including the `auto` sentinel. */
export function videoModelIds(): string[] {
  return [AUTO_VIDEO_MODEL, ...Object.keys(VIDEO_MODEL_REGISTRY)];
}

/** Look up a model, or null when unknown (never throws, never invents). */
export function resolveVideoModel(id: string | null | undefined): VideoModelSpec | null {
  if (!id || id === AUTO_VIDEO_MODEL) return null;
  return VIDEO_MODEL_REGISTRY[id] ?? null;
}

/** Prompt-dialect family for a model id; `auto` until the Director picks one. */
export function videoModelFamily(id: string | null | undefined): VideoModelFamily | "auto" {
  return resolveVideoModel(id)?.family ?? "auto";
}

/**
 * Whether a model supports an end/target keyframe. `auto` is treated as capable
 * because auto resolves to Kling for UGC and scenes default to auto — matching
 * the behaviour this replaces.
 */
export function modelSupportsEndFrame(id: string | null | undefined): boolean {
  if (!id || id === AUTO_VIDEO_MODEL) return true;
  return resolveVideoModel(id)?.supportsEndFrame ?? false;
}

/** Durations/aspects/resolutions a model allows (registry-wide union for `auto`). */
export function allowedDurationsFor(id: string | null | undefined): readonly string[] {
  const spec = resolveVideoModel(id);
  if (spec) return spec.durations;
  return unionOf((s) => s.durations);
}

export function allowedAspectRatiosFor(id: string | null | undefined): readonly string[] {
  const spec = resolveVideoModel(id);
  if (spec) return spec.aspectRatios;
  return unionOf((s) => s.aspectRatios);
}

function unionOf(pick: (spec: VideoModelSpec) => readonly string[]): string[] {
  const all = new Set<string>();
  for (const spec of Object.values(VIDEO_MODEL_REGISTRY)) for (const v of pick(spec)) all.add(v);
  return [...all];
}

/** Union of every duration/aspect/resolution any model allows — the shape the
 *  execution boundary validates against (a scene names its own model, so the
 *  per-model check belongs to capability gating, not the security allowlist). */
export function allVideoDurations(): string[] {
  return unionOf((s) => s.durations);
}

/**
 * Every duration ANY model can actually render — the correct coarse filter for
 * the security boundary.
 *
 * `allVideoDurations()` is the union of UI *option lists*, which is narrower than
 * provider capability: Sora renders 12s but no model offers 12s as a button, so
 * filtering on the option union rejected a renderable request. The boundary's job
 * is to reject values no model could ever render; the per-model gate
 * (`validateVideoModelOptions`) then rejects values this model cannot render.
 */
export function allProviderRenderableDurations(): string[] {
  const all = new Set<number>();
  for (const spec of Object.values(VIDEO_MODEL_REGISTRY)) {
    if (spec.providerDurationValues) {
      for (const v of spec.providerDurationValues) all.add(v);
    } else if (spec.providerDurationRange) {
      const [min, max] = spec.providerDurationRange;
      for (let v = min; v <= max; v += 1) all.add(v);
    } else {
      for (const v of spec.durations) all.add(Number(v));
    }
  }
  return [...all].sort((a, b) => a - b).map(String);
}
export function allVideoAspectRatios(): string[] {
  return unionOf((s) => s.aspectRatios);
}
export function allVideoResolutions(): string[] {
  return unionOf((s) => s.resolutions ?? []);
}

/**
 * n8n's auto-selection, mirrored for display ("Auto → Kling 3.0"). n8n remains
 * authoritative; this must not diverge without updating the drift test.
 */
export function resolveAutoModel(videoMode: string | null | undefined): string {
  if (videoMode === "ugc") return "kling-3.0/video";
  if (videoMode === "clothing") return "replicate:prunaai/p-video";
  return "bytedance/seedance-2";
}

/**
 * Estimated credit cost, mirroring n8n's formula. **Display only** — n8n computes
 * and deducts the real amount, and no price is ever accepted from the browser.
 */
export function estimateVideoCredits(
  modelId: string | null | undefined,
  durationSeconds: string | number,
  options: { hasAudio?: boolean; videoMode?: string | null } = {},
): number | null {
  const duration = typeof durationSeconds === "number" ? durationSeconds : Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  // `auto` must resolve with the SAME videoMode n8n uses, or the estimate quotes a
  // different model than the one that runs (ugc -> Kling 12/sec vs the default
  // Seedance 20/sec is a 40% error on a 5s clip).
  const resolvedId = resolveEffectiveVideoModel(modelId, options.videoMode ?? null);
  const spec = resolveVideoModel(resolvedId);
  const perSecond = (spec?.creditsPerSecond ?? DEFAULT_CREDITS_PER_SECOND)
    + (options.hasAudio ? AUDIO_SURCHARGE_PER_SECOND : 0);
  return Math.round(duration * perSecond);
}

/**
 * The n8n pricing rules, mirrored EXACTLY as written in
 * "Parse Inputs & Calculate Cost". The drift test runs every registry entry
 * through this and requires the same number — so a registry price can never
 * silently disagree with what the workflow actually charges.
 */
export function n8nPerSecondCost(modelId: string): number {
  if (modelId.includes("seedance")) return 20;
  if (modelId.includes("kling") || modelId.includes("sora")) return 12;
  if (modelId.includes("pruna")) return 4;
  // n8n has an explicit gemini branch; omitting it here is what let the registry
  // advertise 12/sec while the workflow charged 20/sec (found 2026-08-06).
  if (modelId.includes("gemini")) return GEMINI_CREDITS_PER_SECOND;
  return DEFAULT_CREDITS_PER_SECOND;
}

// ── Per-model option validation ───────────────────────────────────────────────
//
// The security allowlists in `video-execution.ts` only reject values no model
// could ever use. These functions are the per-model gate, and they are now
// ENFORCED server-side rather than being advisory: a duration a model cannot
// actually render must be rejected before any credit is deducted, never silently
// clamped to something cheaper to render but billed at the requested length.

/** Resolve `auto`/absent to the concrete model n8n would pick, so validation and
 *  billing always reason about the model that will really run. */
export function resolveEffectiveVideoModel(
  modelId: string | null | undefined,
  videoMode?: string | null,
): string {
  if (!modelId || modelId === AUTO_VIDEO_MODEL) return resolveAutoModel(videoMode ?? null);
  return modelId;
}

/**
 * True when this duration is RENDERABLE by this model.
 *
 * Deliberately checked against the provider's capability, not the UI option list:
 * the Director and storyboard scenes legitimately ask for in-range lengths we do
 * not offer as buttons (e.g. Seedance at 8s), and rejecting those would break
 * working flows. What must never pass is a length the provider cannot render.
 */
export function isDurationAllowedFor(modelId: string | null | undefined, duration: string | number): boolean {
  const spec = resolveVideoModel(modelId);
  if (!spec) return false;
  const seconds = typeof duration === "number" ? duration : Number(String(duration).trim());
  if (!Number.isInteger(seconds) || seconds <= 0) return false;
  if (spec.providerDurationValues) return spec.providerDurationValues.includes(seconds);
  if (spec.providerDurationRange) {
    const [min, max] = spec.providerDurationRange;
    return seconds >= min && seconds <= max;
  }
  // No provider capability recorded — fall back to the offered options rather
  // than accepting anything.
  return spec.durations.includes(String(seconds));
}

/** Human-readable description of what a model can render, for rejection messages. */
export function describeAllowedDurations(spec: VideoModelSpec): string {
  if (spec.providerDurationValues) return `${spec.providerDurationValues.join(", ")}s`;
  if (spec.providerDurationRange) return `${spec.providerDurationRange[0]}-${spec.providerDurationRange[1]}s`;
  return `${spec.durations.join(", ")}s`;
}

/** True when this aspect ratio is offered for this model. */
export function isAspectRatioAllowedFor(modelId: string | null | undefined, aspectRatio: string): boolean {
  const spec = resolveVideoModel(modelId);
  if (!spec) return false;
  return spec.aspectRatios.includes(aspectRatio);
}

/** True when this resolution is offered for this model (models without a
 *  resolution choice accept none — the workflow fixes their resolution). */
export function isResolutionAllowedFor(modelId: string | null | undefined, resolution: string): boolean {
  const spec = resolveVideoModel(modelId);
  if (!spec?.resolutions) return false;
  return spec.resolutions.includes(resolution);
}

export type VideoOptionRejection = {
  field: "model" | "duration" | "aspect_ratio" | "video_resolution" | "end_frame";
  reason: string;
};

/**
 * Capability, NOT intent.
 *
 * `supportsEndFrame` says the option MAY be offered. It must never be used to
 * turn the option ON: an enabled end frame triggers a second PAID image
 * generation, so enabling it is a spending decision that only the user may make.
 * Callers wanting "should this scene have an end frame?" must read the user's
 * explicit `useEndFrame` selection, and pass it here to check it is permitted.
 */
export function isEndFrameAllowedFor(modelId: string | null | undefined, videoMode?: string | null): boolean {
  const effective = resolveEffectiveVideoModel(modelId, videoMode ?? null);
  return resolveVideoModel(effective)?.supportsEndFrame ?? false;
}

/**
 * The single validation used by the execution boundary AND mirrored in n8n.
 * Returns null when the combination is renderable, otherwise the first problem.
 */
export function validateVideoModelOptions(input: {
  model?: string | null;
  videoMode?: string | null;
  duration?: string | number | null;
  aspectRatio?: string | null;
  videoResolution?: string | null;
  /** True when the request carries an end/last frame image. */
  hasEndFrame?: boolean;
}): VideoOptionRejection | null {
  const effective = resolveEffectiveVideoModel(input.model, input.videoMode);
  const spec = resolveVideoModel(effective);
  if (!spec) return { field: "model", reason: `Unknown video model: ${effective}` };

  if (input.duration !== undefined && input.duration !== null && String(input.duration) !== "") {
    if (!isDurationAllowedFor(effective, input.duration)) {
      return {
        field: "duration",
        reason: `${spec.label} cannot render ${input.duration}s (supported: ${describeAllowedDurations(spec)})`,
      };
    }
  }
  if (input.aspectRatio && !isAspectRatioAllowedFor(effective, input.aspectRatio)) {
    return {
      field: "aspect_ratio",
      reason: `${spec.label} does not support ${input.aspectRatio} (supported: ${spec.aspectRatios.join(", ")})`,
    };
  }
  // An end frame may only be requested for a model that can actually consume it.
  // This is the server-side stop that prevents a manipulated request from causing
  // a paid end-frame image generation on an unsupported model.
  if (input.hasEndFrame && !spec.supportsEndFrame) {
    return {
      field: "end_frame",
      reason: `${spec.label} does not support an end frame`,
    };
  }
  // Only enforce resolution where the model actually exposes a choice; the
  // storyboard image path sends 1K/2K/4K on the same payload for frame images.
  if (input.videoResolution && spec.resolutions && !isResolutionAllowedFor(effective, input.videoResolution)) {
    return {
      field: "video_resolution",
      reason: `${spec.label} does not support ${input.videoResolution} (supported: ${spec.resolutions.join(", ")})`,
    };
  }
  return null;
}
