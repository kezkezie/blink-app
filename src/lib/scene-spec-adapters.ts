/**
 * SceneSpec v1 compatibility adapters (Video Studio slice V2).
 *
 * These wrap today's ad-hoc shapes — Director output, the untyped
 * `StoryboardScene`, Storyboard Sheet panels, and persisted `content` rows —
 * into a validated SceneSpec **without rewriting any of them**.
 *
 * Contract: **lenient in, strict out.**
 *   - Input may be messy (snake_case or camelCase, legacy keys, stale values).
 *   - A value that would fail validation is moved to `quarantinedFields`, not
 *     silently coerced and not allowed to fail the whole adaptation — the
 *     working Storyboard Sheet flow must keep functioning.
 *   - Identity (`sceneId`, `sceneNumber`) is synthesized when absent.
 *   - Every adapter returns a spec that has passed `parseSceneSpec`, so a spec
 *     produced here is always safe to persist.
 */

import {
  parseSceneSpec,
  SCENE_SPEC_VERSION,
  type SceneCastRef,
  type SceneSpec,
} from "@/lib/scene-spec";

/** Shape of one Director beat. The Director emits snake_case, some call sites
 *  produce camelCase, and `/api/video/storyboard` emits `{mode,duration,prompt}`
 *  — all three are accepted. */
export type DirectorBeatInput = Record<string, unknown>;

/** Context the surrounding surface knows but an individual beat/scene does not. */
export interface SceneSpecContext {
  sequenceId?: string;
  sourceIdea?: string;
  aspectRatio?: string;
  styleLabel?: string;
  styleRefs?: string[];
  environmentRef?: string;
  castRefs?: SceneCastRef[];
  wardrobe?: string;
  brandContextVersion?: string;
  storyboardSheet?: { sheetUrl: string; panelNumber: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** First defined, non-empty value among several candidate keys. */
function pick(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/**
 * Whether a value can survive `JSON.stringify` into `creation_metadata`.
 * Deliberately conservative: browser handles (File/Blob), functions, symbols and
 * cyclic structures are excluded rather than risking an unserializable spec.
 */
function isJsonSafe(value: unknown): boolean {
  const seen = new WeakSet<object>();
  const walk = (input: unknown, depth: number): boolean => {
    if (depth > 6) return false;
    if (input === null) return true;
    const type = typeof input;
    if (type === "string" || type === "boolean") return true;
    if (type === "number") return Number.isFinite(input as number);
    if (type !== "object") return false;
    const object = input as object;
    if (seen.has(object)) return false;
    seen.add(object);
    if (Array.isArray(object)) return object.every((item) => walk(item, depth + 1));
    if (Object.getPrototypeOf(object) !== Object.prototype) return false;
    return Object.values(object).every((item) => walk(item, depth + 1));
  };
  return walk(value, 0);
}

function newSceneId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `scene-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Validate a candidate; on failure, move the offending field into quarantine and
 * retry. This is what makes the adapters total: messy legacy input always yields
 * a valid spec, with the unusable parts preserved rather than lost.
 */
function finalize(candidate: Record<string, unknown>): SceneSpec {
  const working: Record<string, unknown> = { ...candidate };
  const quarantined: Record<string, unknown> = isRecord(working.quarantinedFields)
    ? { ...working.quarantinedFields }
    : {};

  // Bounded retries: each pass removes at most one bad field.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    working.quarantinedFields = Object.keys(quarantined).length > 0 ? quarantined : undefined;
    const result = parseSceneSpec(working);
    if (result.ok) return result.value;

    const field = result.field;
    // Identity failures are repaired, never quarantined — a spec without them
    // cannot exist.
    if (field === "schemaVersion") {
      working.schemaVersion = SCENE_SPEC_VERSION;
      continue;
    }
    if (field === "sceneId") {
      if (working.sceneId !== undefined) quarantined.sceneId = working.sceneId;
      working.sceneId = newSceneId();
      continue;
    }
    if (field === "sceneNumber") {
      if (working.sceneNumber !== undefined) quarantined.sceneNumber = working.sceneNumber;
      working.sceneNumber = 1;
      continue;
    }
    if (field && field in working) {
      quarantined[field] = working[field];
      delete working[field];
      continue;
    }
    // Unattributable failure: strip everything optional and keep identity.
    return finalizeMinimal(working, quarantined);
  }
  return finalizeMinimal(working, quarantined);
}

function finalizeMinimal(working: Record<string, unknown>, quarantined: Record<string, unknown>): SceneSpec {
  const sceneId = typeof working.sceneId === "string" && working.sceneId ? working.sceneId : newSceneId();
  const sceneNumber = typeof working.sceneNumber === "number" && Number.isInteger(working.sceneNumber) && working.sceneNumber > 0
    ? working.sceneNumber
    : 1;
  for (const [key, value] of Object.entries(working)) {
    if (key !== "sceneId" && key !== "sceneNumber" && key !== "schemaVersion" && key !== "quarantinedFields" && value !== undefined) {
      quarantined[key] = value;
    }
  }
  const result = parseSceneSpec({
    schemaVersion: SCENE_SPEC_VERSION,
    sceneId,
    sceneNumber,
    ...(Object.keys(quarantined).length > 0 ? { quarantinedFields: quarantined } : {}),
  });
  // The minimal object is valid by construction.
  return result.ok
    ? result.value
    : { schemaVersion: SCENE_SPEC_VERSION, sceneId, sceneNumber, castRefs: [], styleRefs: [] };
}

function applyContext(candidate: Record<string, unknown>, context: SceneSpecContext = {}) {
  const contextual: Record<string, unknown> = {
    sequenceId: context.sequenceId,
    sourceIdea: context.sourceIdea,
    styleLabel: context.styleLabel,
    styleRefs: context.styleRefs,
    environmentRef: context.environmentRef,
    castRefs: context.castRefs,
    wardrobe: context.wardrobe,
    brandContextVersion: context.brandContextVersion,
    storyboardSheet: context.storyboardSheet,
  };
  for (const [key, value] of Object.entries(contextual)) {
    if (value !== undefined && candidate[key] === undefined) candidate[key] = value;
  }
  // Scene-level aspect ratio wins; context supplies the studio-wide default.
  if (candidate.aspectRatio === undefined && context.aspectRatio !== undefined) {
    candidate.aspectRatio = context.aspectRatio;
  }
  return candidate;
}

// ── Director output ──────────────────────────────────────────────────────────

/**
 * Map one Director beat to a SceneSpec. Accepts the Master-Director shape
 * (`image_prompt`/`video_prompt`/`end_frame_prompt`/`audio_prompt`/`ai_model`),
 * its camelCase variants, and the `/api/video/storyboard` shape
 * (`{mode,duration,prompt}`).
 */
export function sceneSpecFromDirectorBeat(
  beat: DirectorBeatInput,
  sceneNumber: number,
  context: SceneSpecContext = {}
): SceneSpec {
  const source = isRecord(beat) ? beat : {};
  const imagePrompt = pick(source, "image_prompt", "imagePrompt");
  const videoPrompt = pick(source, "video_prompt", "videoPrompt");
  // `/api/video/storyboard` returns a single `prompt` per scene.
  const genericPrompt = pick(source, "prompt");
  const useEndFrame = pick(source, "useEndFrame", "use_end_frame");

  const candidate: Record<string, unknown> = {
    schemaVersion: SCENE_SPEC_VERSION,
    sceneId: pick(source, "id", "sceneId") ?? newSceneId(),
    sceneNumber,
    scenePurpose: pick(source, "scene_purpose", "scenePurpose", "purpose"),
    narrativeBeat: pick(source, "narrative_beat", "narrativeBeat", "beat"),
    imagePrompt: imagePrompt ?? videoPrompt ?? genericPrompt,
    videoPrompt: videoPrompt ?? genericPrompt ?? imagePrompt,
    endFramePrompt: pick(source, "end_frame_prompt", "endFramePrompt"),
    dialogue: pick(source, "dialogue"),
    narration: pick(source, "narration"),
    audioDirection: pick(source, "audio_prompt", "audioPrompt", "audio_direction", "audioDirection"),
    locationLabel: pick(source, "location", "locationLabel"),
    selectedModel: pick(source, "aiModel", "ai_model", "model"),
    durationSeconds: pick(source, "duration", "durationSeconds"),
    videoMode: pick(source, "mode", "video_mode", "videoMode"),
    aspectRatio: pick(source, "aspect_ratio", "aspectRatio"),
    cameraFraming: pick(source, "camera_framing", "cameraFraming"),
    cameraMovement: pick(source, "camera_movement", "cameraMovement"),
    lens: pick(source, "lens"),
    lighting: pick(source, "lighting"),
    physicsNotes: pick(source, "physics_notes", "physicsNotes"),
    ...(typeof useEndFrame === "boolean" ? { modelRequirements: { endFrame: useEndFrame } } : {}),
  };

  // Keys the Director may emit that the spec does not own.
  const known = new Set([
    "id", "sceneId", "image_prompt", "imagePrompt", "video_prompt", "videoPrompt", "prompt",
    "end_frame_prompt", "endFramePrompt", "dialogue", "narration", "audio_prompt", "audioPrompt",
    "audio_direction", "audioDirection", "location", "locationLabel", "aiModel", "ai_model", "model",
    "duration", "durationSeconds", "mode", "video_mode", "videoMode", "aspect_ratio", "aspectRatio",
    "scene_purpose", "scenePurpose", "purpose", "narrative_beat", "narrativeBeat", "beat",
    "useEndFrame", "use_end_frame", "camera_framing", "cameraFraming", "camera_movement",
    "cameraMovement", "lens", "lighting", "physics_notes", "physicsNotes",
  ]);
  const quarantined: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!known.has(key)) quarantined[key] = value;
  }
  if (Object.keys(quarantined).length > 0) candidate.quarantinedFields = quarantined;

  return finalize(applyContext(candidate, context));
}

export function sceneSpecsFromDirectorOutput(
  scenes: unknown,
  context: SceneSpecContext = {}
): SceneSpec[] {
  if (!Array.isArray(scenes)) return [];
  return scenes.map((beat, index) =>
    sceneSpecFromDirectorBeat(isRecord(beat) ? beat : {}, index + 1, context)
  );
}

// ── Legacy StoryboardScene ───────────────────────────────────────────────────

/** Keys the ad-hoc scene object owns that are NOT SceneSpec fields — engine
 *  plumbing and transient UI state. Preserved in quarantine, never trusted. */
const SCENE_NON_SPEC_KEYS = [
  "primaryFile", "secondaryFile", "seedanceImages", "seedancePreviews",
  "referenceVideoFile", "referenceVideoPreview", "remixSources", "gptRefPreviews",
  "isGeneratingVideo", "seed", "prunaDraft", "imageEngine", "videoUrl",
];

/**
 * Wrap today's untyped `StoryboardScene` into a SceneSpec. The scene object is
 * left untouched by design — this is the read-side adapter of the plan's
 * wrap-don't-rewrite migration strategy.
 */
export function sceneSpecFromStoryboardScene(
  scene: Record<string, unknown>,
  context: SceneSpecContext = {}
): SceneSpec {
  const source = isRecord(scene) ? scene : {};
  const useEndFrame = source.useEndFrame;

  // A prepared scene may carry the SceneSpec it originated from (e.g. the
  // Storyboard Sheet panel it was cropped from). This is what stops narrative
  // and direction metadata — scenePurpose, narrativeBeat, camera, lighting —
  // from dying at this boundary just because the ad-hoc scene object has no
  // field for it. Current editable scene values overlay the carried spec.
  const carried = parseSceneSpec(source.sceneSpec);
  const base: Record<string, unknown> = carried.ok ? { ...carried.value } : {};

  const mapped: Record<string, unknown> = {
    schemaVersion: SCENE_SPEC_VERSION,
    sceneId: pick(source, "id", "sceneId") ?? base.sceneId ?? newSceneId(),
    sceneNumber: pick(source, "scene_number", "sceneNumber") ?? base.sceneNumber ?? 1,
    // Direction fields the scene object may carry explicitly.
    scenePurpose: pick(source, "scenePurpose", "scene_purpose"),
    narrativeBeat: pick(source, "narrativeBeat", "narrative_beat"),
    narration: pick(source, "narration"),
    cameraFraming: pick(source, "cameraFraming", "camera_framing"),
    cameraMovement: pick(source, "cameraMovement", "camera_movement"),
    lens: pick(source, "lens"),
    lighting: pick(source, "lighting"),
    physicsNotes: pick(source, "physicsNotes", "physics_notes"),
    // `prompt` on a scene is the motion/video prompt (the Scene Director box);
    // `imagePrompt` is the still-frame prompt.
    videoPrompt: pick(source, "prompt", "videoPrompt"),
    imagePrompt: pick(source, "imagePrompt", "image_prompt"),
    endFramePrompt: pick(source, "endFramePrompt", "end_frame_prompt"),
    dialogue: pick(source, "dialogue"),
    audioDirection: pick(source, "audioPrompt", "audio_prompt"),
    locationLabel: pick(source, "location"),
    selectedModel: pick(source, "aiModel", "ai_model"),
    durationSeconds: pick(source, "duration"),
    aspectRatio: pick(source, "aspectRatio", "aspect_ratio"),
    videoResolution: pick(source, "videoResolution", "video_resolution"),
    videoMode: pick(source, "mode", "video_mode"),
    startFrameRef: pick(source, "primaryPreview", "startFrameRef"),
    endFrameRef: pick(source, "secondaryPreview", "endFrameRef"),
    assetUrl: pick(source, "videoUrl", "assetUrl"),
    contentId: pick(source, "contentId", "post_id"),
    ...(typeof useEndFrame === "boolean" ? { modelRequirements: { endFrame: useEndFrame } } : {}),
  };

  // Overlay: the scene's own values win, but an absent scene field must NOT
  // erase what the carried spec already knows.
  const candidate: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(mapped)) {
    if (value !== undefined) candidate[key] = value;
  }

  // Storyboard Sheet provenance carried on a prepared scene.
  const sheetUrl = pick(source, "storyboardSheetUrl");
  const panelNumber = pick(source, "storyboardSheetPanel");
  if (typeof sheetUrl === "string" && typeof panelNumber === "number") {
    candidate.storyboardSheet = { sheetUrl, panelNumber };
  }

  const quarantined: Record<string, unknown> = isRecord(base.quarantinedFields)
    ? { ...base.quarantinedFields }
    : {};
  for (const key of SCENE_NON_SPEC_KEYS) {
    const value = source[key];
    // Only JSON-safe values are quarantined: a spec must stay serializable for
    // `creation_metadata`, and browser File handles are transient by nature.
    if (value !== undefined && value !== null && isJsonSafe(value)) {
      quarantined[key] = value;
    }
  }
  if (Object.keys(quarantined).length > 0) candidate.quarantinedFields = quarantined;

  return finalize(applyContext(candidate, context));
}

// ── Storyboard Sheet panel ───────────────────────────────────────────────────

/**
 * Adapt one Storyboard Sheet panel (the four-shot production sheet) to a
 * SceneSpec, attaching sheet provenance. Accepts both the SceneSpec form
 * (already-migrated browser storage) and the original ad-hoc panel shape
 * `{sceneNumber,imagePrompt,videoPrompt,dialogue,audioPrompt,location,aiModel,duration}`.
 */
export function sceneSpecFromSheetPanel(
  panel: Record<string, unknown>,
  panelNumber: number,
  sheetUrl: string,
  context: SceneSpecContext = {}
): SceneSpec {
  const source = isRecord(panel) ? panel : {};

  // Already a SceneSpec (migrated storage): re-validate and (re)attach provenance.
  if (source.schemaVersion === SCENE_SPEC_VERSION) {
    const parsed = parseSceneSpec({
      ...source,
      storyboardSheet: isRecord(source.storyboardSheet) ? source.storyboardSheet : { sheetUrl, panelNumber },
    });
    if (parsed.ok) return parsed.value;
  }

  const candidate: Record<string, unknown> = {
    schemaVersion: SCENE_SPEC_VERSION,
    sceneId: pick(source, "sceneId", "id") ?? newSceneId(),
    sceneNumber: pick(source, "sceneNumber", "scene_number") ?? panelNumber,
    imagePrompt: pick(source, "imagePrompt", "image_prompt"),
    videoPrompt: pick(source, "videoPrompt", "video_prompt"),
    dialogue: pick(source, "dialogue"),
    audioDirection: pick(source, "audioPrompt", "audio_prompt", "audioDirection"),
    locationLabel: pick(source, "location", "locationLabel"),
    selectedModel: pick(source, "aiModel", "ai_model", "selectedModel"),
    durationSeconds: pick(source, "duration", "durationSeconds"),
    // Provenance only when a sheet URL is actually known (a sheet restored from
    // storage before its image URL loads has none yet).
    ...(sheetUrl ? { storyboardSheet: { sheetUrl, panelNumber } } : {}),
  };

  return finalize(applyContext(candidate, context));
}

/**
 * Read Storyboard Sheet panels out of browser storage. Accepts both the
 * SceneSpec array written from V2 onward and the legacy ad-hoc panel array
 * written by the earlier bounded repair, so previously saved sheets keep working.
 */
export function sceneSpecsFromStoredSheetPanels(
  stored: unknown,
  sheetUrl: string,
  context: SceneSpecContext = {}
): SceneSpec[] {
  if (!Array.isArray(stored)) return [];
  return stored.map((panel, index) =>
    sceneSpecFromSheetPanel(isRecord(panel) ? panel : {}, index + 1, sheetUrl, context)
  );
}

// ── content.creation_metadata persistence ────────────────────────────────────

/** Key SceneSpec occupies inside the shared `creation_metadata` JSONB. Namespaced
 *  so it composes with the image metadata already written by `image-job.ts`. */
export const SCENE_SPEC_METADATA_KEY = "scene_spec";

/**
 * Serialize a SceneSpec for a `content` placeholder. Returns the exact column
 * fragment to spread into the insert, versioned from the first record.
 */
export function sceneSpecToCreationMetadata(spec: SceneSpec): {
  creation_metadata_version: number;
  creation_metadata: Record<string, unknown>;
} {
  return {
    creation_metadata_version: 1,
    creation_metadata: {
      [SCENE_SPEC_METADATA_KEY]: spec,
      // Flat conveniences for querying/debugging; the spec remains authoritative.
      scene_spec_version: spec.schemaVersion,
      scene_number: spec.sceneNumber,
      ...(spec.sequenceId ? { sequence_id: spec.sequenceId } : {}),
    },
  };
}

/**
 * Read a SceneSpec back out of a persisted `content` row's metadata.
 * Returns null when the row predates SceneSpec — callers then use
 * `legacySceneSpecFromContentRow` for a safe, clearly-marked fallback.
 */
export function sceneSpecFromCreationMetadata(metadata: unknown): SceneSpec | null {
  if (!isRecord(metadata)) return null;
  const raw = metadata[SCENE_SPEC_METADATA_KEY];
  if (raw === undefined) return null;
  const parsed = parseSceneSpec(raw);
  return parsed.ok ? parsed.value : null;
}

/** Minimal `content` row shape needed for the legacy fallback. */
export interface LegacyContentRow {
  id?: unknown;
  caption?: unknown;
  ai_model?: unknown;
  content_type?: unknown;
  generation_state?: unknown;
  billing_state?: unknown;
  retry_state?: unknown;
  provider_task_id?: unknown;
  retry_of_content_id?: unknown;
  creation_metadata?: unknown;
}

/**
 * Build a best-effort SceneSpec for a row saved before V2. Nothing is invented:
 * only values the row actually holds are mapped, everything unmappable is
 * quarantined, and the result is marked so callers can tell a reconstructed spec
 * from an authored one.
 */
export function legacySceneSpecFromContentRow(row: LegacyContentRow): SceneSpec {
  const candidate: Record<string, unknown> = {
    schemaVersion: SCENE_SPEC_VERSION,
    sceneId: typeof row.id === "string" && row.id ? row.id : newSceneId(),
    sceneNumber: 1,
    contentId: row.id,
    selectedModel: row.ai_model,
    generationState: row.generation_state,
    billingState: row.billing_state,
    retryState: row.retry_state,
    providerTaskId: row.provider_task_id,
    revisionParentId: row.retry_of_content_id,
    quarantinedFields: {
      legacyRow: true,
      ...(row.caption !== undefined ? { caption: row.caption } : {}),
      ...(row.content_type !== undefined ? { content_type: row.content_type } : {}),
    },
  };
  return finalize(candidate);
}

/** True when a spec was reconstructed from a pre-SceneSpec row. */
export function isLegacyReconstructedSpec(spec: SceneSpec): boolean {
  return spec.quarantinedFields?.legacyRow === true;
}

/**
 * The single entry point for reopening a scene: use the persisted SceneSpec when
 * present, otherwise fall back to a reconstructed legacy spec. Old rows always
 * remain openable.
 */
export function readSceneSpecForContentRow(row: LegacyContentRow): SceneSpec {
  return sceneSpecFromCreationMetadata(row.creation_metadata) ?? legacySceneSpecFromContentRow(row);
}
