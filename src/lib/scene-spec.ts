/**
 * SceneSpec v1 — the strict, versioned video-scene contract (Video Studio
 * Completion Plan, slice V2; field list §13).
 *
 * One artifact carries scene intent across every boundary:
 *
 *   Director output → SceneSpec → Storyboard / Storyboard Sheet panel
 *     → content.creation_metadata → reopening / downstream adapter → editor clip
 *
 * Design rules this module obeys:
 *
 *  1. **Wrap, don't rewrite.** The 3,500-line Storytelling component keeps its
 *     ad-hoc `StoryboardScene` objects; adapters map them into SceneSpec. There
 *     is no big-bang state replacement.
 *  2. **Reuse, don't duplicate.** Generation/billing/retry vocabulary comes from
 *     the Image Studio state module; model/duration/aspect/resolution allowlists
 *     come from the V1 video-execution module. No video-only equivalents.
 *  3. **Quarantine unknown input.** Legacy or unexpected fields are preserved
 *     under `quarantinedFields` rather than silently trusted or dropped, so no
 *     data is lost and nothing unvalidated reaches a payload.
 *  4. **Version from the first persisted record.** Every stored spec carries
 *     `schemaVersion`, and a mismatched version is rejected, never guessed at.
 *
 * This module is pure (no React, no DOM, no network) so it is unit-testable and
 * reusable by any surface. It defines the data contract ONLY — adopting it into
 * the video generation payload is V3/V5, not this slice.
 */

import type { BillingState, GenerationState, RetryState } from "@/lib/image-generation-state";
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  VIDEO_MODELS,
  VIDEO_MODES,
  VIDEO_RESOLUTIONS,
} from "@/lib/video-execution";

export const SCENE_SPEC_VERSION = 1 as const;

/** Bounds. Prompt cap matches the V1 execution boundary so a spec can never
 *  carry a value the secured route would reject. */
export const SCENE_SPEC_LIMITS = {
  prompt: 8_000,
  dialogue: 4_000,
  sourceIdea: 4_000,
  shortText: 500,
  label: 200,
  castRefs: 10,
  styleRefs: 10,
  maxSceneNumber: 500,
  url: 2_048,
} as const;

const GENERATION_STATES = new Set<GenerationState>([
  "idle", "preparing", "queued", "generating", "saving", "succeeded", "failed", "timed_out",
]);
const BILLING_STATES = new Set<BillingState>([
  "not_charged", "charged", "refund_pending", "refunded", "refund_failed",
]);
const RETRY_STATES = new Set<RetryState>(["none", "retry_available", "retrying"]);

/** A cast member referenced by a scene. `styleKey` mirrors the existing actor
 *  variant cache key (`actorId::styleId`); `pinned` mirrors `styleLocked`
 *  (mixed-media per-actor pinning, decision 2026-07-04). */
export interface SceneCastRef {
  actorId?: string;
  name: string;
  sheetUrl?: string;
  styleKey?: string;
  pinned?: boolean;
}

/** Capability needs derived from the scene, used later by the model registry
 *  (V11) to gate routing. Recorded now so the requirement survives; nothing in
 *  V2 routes on it. */
export interface SceneModelRequirements {
  endFrame?: boolean;
  nativeAudio?: boolean;
  referenceSlots?: number;
}

/** Provenance for a scene prepared from a Storyboard Sheet panel. */
export interface StoryboardSheetProvenance {
  sheetUrl: string;
  panelNumber: number;
}

export interface SceneSpec {
  schemaVersion: typeof SCENE_SPEC_VERSION;
  sceneId: string;
  sceneNumber: number;
  sequenceId?: string;

  // Intent
  sourceIdea?: string;
  scenePurpose?: string;
  narrativeBeat?: string;

  // Prompts
  imagePrompt?: string;
  videoPrompt?: string;
  endFramePrompt?: string;

  // Audio
  dialogue?: string;
  narration?: string;
  audioDirection?: string;

  // Continuity
  castRefs: SceneCastRef[];
  wardrobe?: string;
  locationLabel?: string;
  environmentRef?: string;

  // Visual references
  startFrameRef?: string;
  endFrameRef?: string;
  styleRefs: string[];
  styleLabel?: string;

  // Direction (today largely embedded in prompt text via inject presets; kept
  // structured so later slices can populate and edit it without another schema
  // change — plan §13).
  cameraFraming?: string;
  cameraMovement?: string;
  lens?: string;
  lighting?: string;
  physicsNotes?: string;

  // Production settings
  durationSeconds?: string;
  aspectRatio?: string;
  videoResolution?: string;
  videoMode?: string;
  selectedModel?: string;
  modelRequirements?: SceneModelRequirements;

  // Durable job linkage (values owned by the Slice-4 envelope; V2 only carries
  // them so the spec can represent a persisted scene. V3 wires the lifecycle.)
  generationState?: GenerationState;
  billingState?: BillingState;
  retryState?: RetryState;
  providerTaskId?: string;
  revisionParentId?: string;
  contentId?: string;
  assetUrl?: string;

  // Provenance
  brandContextVersion?: string;
  storyboardSheet?: StoryboardSheetProvenance;

  /** Unknown/legacy input preserved but never trusted. */
  quarantinedFields?: Record<string, unknown>;
}

/** Result of a strict parse. Failures name the field so tests and future UI can
 *  explain the rejection rather than showing a generic error. */
export type SceneSpecParseResult =
  | { ok: true; value: SceneSpec }
  | { ok: false; error: string; field?: string };

// ── primitives ───────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Trimmed string within a bound. Returns undefined for absent/blank, null when
 *  present but invalid (wrong type or over the cap — never silently truncated). */
function boundedText(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  if (value.length > max) return null;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** https-only, length-bounded URL. undefined = absent, null = invalid. */
function safeUrl(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > SCENE_SPEC_LIMITS.url) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function enumValue(value: unknown, allowed: ReadonlySet<string>): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  return allowed.has(value) ? value : null;
}

/** Durations arrive as strings from the UI and numbers from the Director. */
function durationValue(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  const asString = typeof value === "number" ? String(value) : value;
  if (typeof asString !== "string") return null;
  return VIDEO_DURATIONS.has(asString) ? asString : null;
}

// ── strict parser ────────────────────────────────────────────────────────────

/** Every key the spec itself owns. Anything else in a parsed object is
 *  quarantined rather than accepted as a spec field. */
const SPEC_KEYS: readonly string[] = [
  "schemaVersion", "sceneId", "sceneNumber", "sequenceId",
  "sourceIdea", "scenePurpose", "narrativeBeat",
  "imagePrompt", "videoPrompt", "endFramePrompt",
  "dialogue", "narration", "audioDirection",
  "castRefs", "wardrobe", "locationLabel", "environmentRef",
  "startFrameRef", "endFrameRef", "styleRefs", "styleLabel",
  "cameraFraming", "cameraMovement", "lens", "lighting", "physicsNotes",
  "durationSeconds", "aspectRatio", "videoResolution", "videoMode",
  "selectedModel", "modelRequirements",
  "generationState", "billingState", "retryState",
  "providerTaskId", "revisionParentId", "contentId", "assetUrl",
  "brandContextVersion", "storyboardSheet", "quarantinedFields",
];

function parseCastRefs(value: unknown): SceneCastRef[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > SCENE_SPEC_LIMITS.castRefs) return null;
  const refs: SceneCastRef[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const name = boundedText(entry.name, SCENE_SPEC_LIMITS.label);
    if (!name) return null; // a cast reference without a name carries no identity
    const actorId = boundedText(entry.actorId, SCENE_SPEC_LIMITS.label);
    const styleKey = boundedText(entry.styleKey, SCENE_SPEC_LIMITS.label);
    const sheetUrl = safeUrl(entry.sheetUrl);
    if (actorId === null || styleKey === null || sheetUrl === null) return null;
    if (entry.pinned !== undefined && typeof entry.pinned !== "boolean") return null;
    refs.push({
      name,
      ...(actorId ? { actorId } : {}),
      ...(sheetUrl ? { sheetUrl } : {}),
      ...(styleKey ? { styleKey } : {}),
      ...(entry.pinned !== undefined ? { pinned: entry.pinned } : {}),
    });
  }
  return refs;
}

function parseStyleRefs(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > SCENE_SPEC_LIMITS.styleRefs) return null;
  const urls: string[] = [];
  for (const entry of value) {
    const url = safeUrl(entry);
    if (!url) return null;
    urls.push(url);
  }
  return [...new Set(urls)];
}

function parseModelRequirements(value: unknown): SceneModelRequirements | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) return null;
  const result: SceneModelRequirements = {};
  for (const key of ["endFrame", "nativeAudio"] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "boolean") return null;
      result[key] = value[key] as boolean;
    }
  }
  if (value.referenceSlots !== undefined) {
    const slots = value.referenceSlots;
    if (typeof slots !== "number" || !Number.isInteger(slots) || slots < 0 || slots > 10) return null;
    result.referenceSlots = slots;
  }
  return result;
}

function parseSheetProvenance(value: unknown): StoryboardSheetProvenance | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) return null;
  const sheetUrl = safeUrl(value.sheetUrl);
  const panel = value.panelNumber;
  if (!sheetUrl) return null;
  if (typeof panel !== "number" || !Number.isInteger(panel) || panel < 1 || panel > 64) return null;
  return { sheetUrl, panelNumber: panel };
}

/**
 * Strictly validate an unknown value as a SceneSpec v1.
 *
 * Unknown top-level keys are not a rejection — they are merged into
 * `quarantinedFields` so legacy/forward data survives a round trip without
 * being trusted as a spec field.
 */
export function parseSceneSpec(value: unknown): SceneSpecParseResult {
  if (!isRecord(value)) return { ok: false, error: "SceneSpec must be an object" };

  if (value.schemaVersion !== SCENE_SPEC_VERSION) {
    return { ok: false, error: `Unsupported SceneSpec version`, field: "schemaVersion" };
  }

  const sceneId = boundedText(value.sceneId, SCENE_SPEC_LIMITS.label);
  if (!sceneId) return { ok: false, error: "sceneId is required", field: "sceneId" };

  const sceneNumber = value.sceneNumber;
  if (
    typeof sceneNumber !== "number" ||
    !Number.isInteger(sceneNumber) ||
    sceneNumber < 1 ||
    sceneNumber > SCENE_SPEC_LIMITS.maxSceneNumber
  ) {
    return { ok: false, error: "sceneNumber must be a positive integer in range", field: "sceneNumber" };
  }

  const spec: SceneSpec = {
    schemaVersion: SCENE_SPEC_VERSION,
    sceneId,
    sceneNumber,
    castRefs: [],
    styleRefs: [],
  };

  // Bounded free text.
  const textFields: Array<[keyof SceneSpec, unknown, number]> = [
    ["sequenceId", value.sequenceId, SCENE_SPEC_LIMITS.label],
    ["sourceIdea", value.sourceIdea, SCENE_SPEC_LIMITS.sourceIdea],
    ["scenePurpose", value.scenePurpose, SCENE_SPEC_LIMITS.shortText],
    ["narrativeBeat", value.narrativeBeat, SCENE_SPEC_LIMITS.shortText],
    ["imagePrompt", value.imagePrompt, SCENE_SPEC_LIMITS.prompt],
    ["videoPrompt", value.videoPrompt, SCENE_SPEC_LIMITS.prompt],
    ["endFramePrompt", value.endFramePrompt, SCENE_SPEC_LIMITS.prompt],
    ["dialogue", value.dialogue, SCENE_SPEC_LIMITS.dialogue],
    ["narration", value.narration, SCENE_SPEC_LIMITS.dialogue],
    ["audioDirection", value.audioDirection, SCENE_SPEC_LIMITS.dialogue],
    ["wardrobe", value.wardrobe, SCENE_SPEC_LIMITS.shortText],
    ["locationLabel", value.locationLabel, SCENE_SPEC_LIMITS.label],
    ["styleLabel", value.styleLabel, SCENE_SPEC_LIMITS.label],
    ["cameraFraming", value.cameraFraming, SCENE_SPEC_LIMITS.shortText],
    ["cameraMovement", value.cameraMovement, SCENE_SPEC_LIMITS.shortText],
    ["lens", value.lens, SCENE_SPEC_LIMITS.shortText],
    ["lighting", value.lighting, SCENE_SPEC_LIMITS.shortText],
    ["physicsNotes", value.physicsNotes, SCENE_SPEC_LIMITS.shortText],
    ["providerTaskId", value.providerTaskId, SCENE_SPEC_LIMITS.label],
    ["revisionParentId", value.revisionParentId, SCENE_SPEC_LIMITS.label],
    ["contentId", value.contentId, SCENE_SPEC_LIMITS.label],
    ["brandContextVersion", value.brandContextVersion, SCENE_SPEC_LIMITS.label],
  ];
  for (const [key, raw, max] of textFields) {
    const parsed = boundedText(raw, max);
    if (parsed === null) return { ok: false, error: `${String(key)} is invalid or too long`, field: String(key) };
    if (parsed !== undefined) (spec as unknown as Record<string, unknown>)[key as string] = parsed;
  }

  // URLs.
  const urlFields: Array<[keyof SceneSpec, unknown]> = [
    ["environmentRef", value.environmentRef],
    ["startFrameRef", value.startFrameRef],
    ["endFrameRef", value.endFrameRef],
    ["assetUrl", value.assetUrl],
  ];
  for (const [key, raw] of urlFields) {
    const parsed = safeUrl(raw);
    if (parsed === null) return { ok: false, error: `${String(key)} must be a safe https URL`, field: String(key) };
    if (parsed !== undefined) (spec as unknown as Record<string, unknown>)[key as string] = parsed;
  }

  // Allowlisted enums (shared with the V1 execution boundary).
  const duration = durationValue(value.durationSeconds);
  if (duration === null) return { ok: false, error: "durationSeconds is not an allowed duration", field: "durationSeconds" };
  if (duration) spec.durationSeconds = duration;

  const enumFields: Array<[keyof SceneSpec, unknown, ReadonlySet<string>]> = [
    ["aspectRatio", value.aspectRatio, VIDEO_ASPECT_RATIOS],
    ["videoResolution", value.videoResolution, VIDEO_RESOLUTIONS],
    ["videoMode", value.videoMode, VIDEO_MODES],
    ["selectedModel", value.selectedModel, VIDEO_MODELS],
    ["generationState", value.generationState, GENERATION_STATES as ReadonlySet<string>],
    ["billingState", value.billingState, BILLING_STATES as ReadonlySet<string>],
    ["retryState", value.retryState, RETRY_STATES as ReadonlySet<string>],
  ];
  for (const [key, raw, allowed] of enumFields) {
    const parsed = enumValue(raw, allowed);
    if (parsed === null) return { ok: false, error: `${String(key)} is not an allowed value`, field: String(key) };
    if (parsed !== undefined) (spec as unknown as Record<string, unknown>)[key as string] = parsed;
  }

  // Arrays and objects.
  const castRefs = parseCastRefs(value.castRefs);
  if (castRefs === null) return { ok: false, error: "castRefs is invalid or too large", field: "castRefs" };
  spec.castRefs = castRefs;

  const styleRefs = parseStyleRefs(value.styleRefs);
  if (styleRefs === null) return { ok: false, error: "styleRefs is invalid or too large", field: "styleRefs" };
  spec.styleRefs = styleRefs;

  const modelRequirements = parseModelRequirements(value.modelRequirements);
  if (modelRequirements === null) return { ok: false, error: "modelRequirements is invalid", field: "modelRequirements" };
  if (modelRequirements && Object.keys(modelRequirements).length > 0) spec.modelRequirements = modelRequirements;

  const sheet = parseSheetProvenance(value.storyboardSheet);
  if (sheet === null) return { ok: false, error: "storyboardSheet provenance is invalid", field: "storyboardSheet" };
  if (sheet) spec.storyboardSheet = sheet;

  // Quarantine: explicit carry-over plus any unrecognised top-level key.
  const quarantined: Record<string, unknown> = {};
  if (isRecord(value.quarantinedFields)) Object.assign(quarantined, value.quarantinedFields);
  for (const [key, raw] of Object.entries(value)) {
    if (!SPEC_KEYS.includes(key)) quarantined[key] = raw;
  }
  if (Object.keys(quarantined).length > 0) spec.quarantinedFields = quarantined;

  return { ok: true, value: spec };
}

/** Convenience guard for callers that only need a yes/no. */
export function isSceneSpec(value: unknown): value is SceneSpec {
  return parseSceneSpec(value).ok;
}
