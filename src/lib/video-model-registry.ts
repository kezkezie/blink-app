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
 *   if (hasAudioUrl || hasAudioScript || promptHasDialogue) perSecCost += 4;
 *   const totalCost = duration * perSecCost;
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
  /** Durations this model may be asked for, in seconds (string form, as the UI/payload use). */
  durations: readonly string[];
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
    durations: ["5", "10", "15", "300"],
    aspectRatios: STANDARD_ASPECTS,
    supportsEndFrame: true,
    supportsNativeAudio: true,
    referenceSlots: 1,
    notes: "Multi-shot notation and native audio; 300s is the premium long-form option.",
  },
  "bytedance/seedance-2": {
    id: "bytedance/seedance-2",
    label: "Seedance 2 (Cinematic)",
    family: "seedance",
    providerMatch: "seedance",
    creditsPerSecond: 20,
    durations: ["5", "10", "15"],
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
    durations: ["5", "10", "15"],
    aspectRatios: STANDARD_ASPECTS,
    supportsEndFrame: true,
    supportsNativeAudio: true,
    referenceSlots: 1,
    notes: "Prefers shorter clips; dialogue belongs in its own block.",
  },
  "replicate:prunaai/p-video": {
    id: "replicate:prunaai/p-video",
    label: "Pruna AI (Fast)",
    family: "pruna",
    providerMatch: "pruna",
    creditsPerSecond: 4,
    durations: ["5", "10"],
    aspectRatios: STANDARD_ASPECTS,
    supportsEndFrame: true,
    supportsNativeAudio: false,
    referenceSlots: 1,
    notes: "Cheapest; short direct prompts, draft mode available.",
  },
  "gemini-omni-video": {
    id: "gemini-omni-video",
    label: "Gemini Omni Video",
    family: "gemini",
    providerMatch: "gemini",
    creditsPerSecond: DEFAULT_CREDITS_PER_SECOND,
    durations: ["4", "6", "8", "10"],
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p", "4k"],
    supportsEndFrame: false,
    supportsNativeAudio: false,
    referenceSlots: 1,
    notes:
      "Not matched by any n8n pricing branch, so it bills at the default 12/sec. Reference-driven transformation; 4/6/8/10s and 16:9 or 9:16 only.",
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
  options: { hasAudio?: boolean } = {},
): number | null {
  const duration = typeof durationSeconds === "number" ? durationSeconds : Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const resolvedId = !modelId || modelId === AUTO_VIDEO_MODEL ? resolveAutoModel(null) : modelId;
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
  return DEFAULT_CREDITS_PER_SECOND;
}
