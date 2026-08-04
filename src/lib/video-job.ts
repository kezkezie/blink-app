/**
 * Video Studio Completion Plan — V3: durable video job envelope adoption
 * (server side).
 *
 * Creates a durable, tenant-owned `content` placeholder for one scene-video
 * attempt BEFORE any provider execution, using the SAME Slice-4 envelope the
 * Image Studio jobs use (state triplet, idempotency key, attempt lineage, retry
 * parent, versioned creation metadata). The validated SceneSpec v1 from V2 is
 * persisted with it, so a durable job always carries its scene intent.
 *
 * Deliberate reuse, not duplication: this mirrors `image-job.ts` field for field
 * — same ownership chain (auth → client → brand → optional retry parent), same
 * DB-enforced idempotency via the `(client_id, generation_idempotency_key)`
 * unique index, same state vocabulary. Only the media-specific parts differ.
 *
 * It never calls a provider, n8n, Cloudinary, or a billing RPC. Billing stays
 * where it already works: n8n performs the upfront deduct/refund per scene job
 * (plan §18), and this placeholder records `billing_state` only. `credit_cost`
 * is intentionally left null until the shared model/pricing registry lands
 * (V11) — a price is never invented here and never trusted from the browser.
 */

import { supabaseAdmin } from "@/lib/supabase-server";
import { parseSceneSpec, type SceneSpec } from "@/lib/scene-spec";
import { sceneSpecToCreationMetadata } from "@/lib/scene-spec-adapters";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Mirrors the image job token shape and the DB CHECK.
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
// Placeholder kinds a video job may create: one storytelling scene, or a
// single-mode ad. Anything else is rejected.
const VIDEO_CONTENT_TYPES = new Set(["sequence_clip", "reel"]);

export type VideoJobRequest = {
  brandId: string;
  idempotencyKey: string;
  contentType: "sequence_clip" | "reel";
  /** Validated SceneSpec v1 — the scene intent persisted with the placeholder. */
  sceneSpec: SceneSpec;
  retryOfContentId?: string;
};

export interface VideoJobPlaceholder {
  id: string;
  generationState: string;
  billingState: string;
  retryState: string;
  attempt: number;
  idempotent: boolean;
}

type Failure = { ok: false; status: 400 | 401 | 404 | 500; error: string };
export type VideoJobResult<T> = { ok: true; value: T } | Failure;

const INTERNAL_ERROR: Failure = { ok: false, status: 500, error: "Internal server error" };
const NOT_FOUND: Failure = { ok: false, status: 404, error: "Resource not found" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

/**
 * Strictly parse a video job creation request. The SceneSpec is validated by the
 * V2 parser, so oversize prompts, unknown models/durations/aspects and unsafe
 * URLs are rejected here — before any tenant work or row write.
 */
export function parseVideoJobRequest(value: unknown): VideoJobRequest | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, ["brand_id", "idempotency_key", "content_type", "scene_spec", "retry_of_content_id"])) {
    return null;
  }

  if (typeof value.brand_id !== "string" || !UUID_PATTERN.test(value.brand_id)) return null;
  if (typeof value.idempotency_key !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(value.idempotency_key)) return null;
  if (typeof value.content_type !== "string" || !VIDEO_CONTENT_TYPES.has(value.content_type)) return null;

  const spec = parseSceneSpec(value.scene_spec);
  if (!spec.ok) return null;

  let retryOfContentId: string | undefined;
  if (value.retry_of_content_id !== undefined && value.retry_of_content_id !== null) {
    if (typeof value.retry_of_content_id !== "string" || !UUID_PATTERN.test(value.retry_of_content_id)) return null;
    retryOfContentId = value.retry_of_content_id;
  }

  return {
    brandId: value.brand_id,
    idempotencyKey: value.idempotency_key,
    contentType: value.content_type as "sequence_clip" | "reel",
    sceneSpec: spec.value,
    ...(retryOfContentId ? { retryOfContentId } : {}),
  };
}

export function isValidContentId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Columns needed to restore a video job's durable status. `video_urls` is the
 *  column the existing scene poller reads (it may hold an array or a JSON
 *  string); `video_url` is the single-asset column. Both are returned so a
 *  restoring caller does not have to guess. */
const JOB_STATUS_SELECT =
  "id, video_url, video_urls, status, error_message, generation_state, billing_state, retry_state, generation_status_text, generation_error_code, generation_attempt, creation_metadata";

async function loadClientId(userId: string): Promise<VideoJobResult<string>> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return INTERNAL_ERROR;
  return data?.id ? { ok: true, value: data.id as string } : NOT_FOUND;
}

async function verifyBrandOwned(clientId: string, brandId: string): Promise<VideoJobResult<true>> {
  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .select("id")
    .eq("id", brandId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) return INTERNAL_ERROR;
  return data ? { ok: true, value: true } : NOT_FOUND;
}

async function loadRetryParent(
  clientId: string,
  brandId: string,
  parentId: string,
): Promise<VideoJobResult<{ attempt: number }>> {
  const { data, error } = await supabaseAdmin
    .from("content")
    .select("id, brand_id, generation_attempt")
    .eq("id", parentId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) return INTERNAL_ERROR;
  // A missing parent or one from another brand is denied identically — never
  // leak whether the row exists in a different tenant/brand.
  if (!data || data.brand_id !== brandId) return NOT_FOUND;
  const attempt =
    typeof data.generation_attempt === "number" && data.generation_attempt >= 1 ? data.generation_attempt : 1;
  return { ok: true, value: { attempt } };
}

/**
 * Load a video job's durable envelope, scoped to the authenticated user's
 * client. Cross-tenant or missing rows return an identical 404 (no leakage).
 * Read-only: no provider, n8n, or billing work.
 */
export async function loadOwnedVideoJob(
  userId: string,
  contentId: string,
): Promise<VideoJobResult<Record<string, unknown>>> {
  const client = await loadClientId(userId);
  if (!client.ok) return client;
  const { data, error } = await supabaseAdmin
    .from("content")
    .select(JOB_STATUS_SELECT)
    .eq("id", contentId)
    .eq("client_id", client.value)
    .maybeSingle();
  if (error) return INTERNAL_ERROR;
  if (!data) return NOT_FOUND;
  return { ok: true, value: data as Record<string, unknown> };
}

function mapRow(row: Record<string, unknown>, idempotent: boolean): VideoJobPlaceholder {
  return {
    id: String(row.id),
    generationState: String(row.generation_state),
    billingState: String(row.billing_state),
    retryState: String(row.retry_state),
    attempt: typeof row.generation_attempt === "number" ? row.generation_attempt : 1,
    idempotent,
  };
}

const PLACEHOLDER_SELECT = "id, generation_state, billing_state, retry_state, generation_attempt";

/** Human-facing caption, derived server-side from the validated spec. */
function captionFor(spec: SceneSpec, contentType: string): string {
  if (contentType === "reel") return `🎬 AI Draft: Scene ${spec.sceneNumber}`;
  return `🎬 AI Scene ${spec.sceneNumber}${spec.videoMode ? `: ${spec.videoMode}` : ""}`;
}

/**
 * Create (or idempotently return) a durable video-generation placeholder for the
 * authenticated user's verified client and brand, carrying its SceneSpec.
 * Service-role writes occur only after ownership is proven.
 */
export async function createVideoJobPlaceholder(
  userId: string,
  input: VideoJobRequest,
): Promise<VideoJobResult<VideoJobPlaceholder>> {
  const client = await loadClientId(userId);
  if (!client.ok) return client;
  const clientId = client.value;

  const brand = await verifyBrandOwned(clientId, input.brandId);
  if (!brand.ok) return brand;

  let attempt = 1;
  let retryState: "none" | "retrying" = "none";
  if (input.retryOfContentId) {
    const parent = await loadRetryParent(clientId, input.brandId, input.retryOfContentId);
    if (!parent.ok) return parent;
    attempt = parent.value.attempt + 1;
    retryState = "retrying";
  }

  // The persisted spec records the durable job's own identity/lineage so a row
  // read back is self-describing. Client-supplied job linkage is not trusted.
  const spec: SceneSpec = {
    ...input.sceneSpec,
    generationState: "queued",
    billingState: "not_charged",
    retryState,
    ...(input.retryOfContentId ? { revisionParentId: input.retryOfContentId } : {}),
  };

  const row = {
    client_id: clientId,
    brand_id: input.brandId,
    content_type: input.contentType,
    status: "draft",
    caption: captionFor(spec, input.contentType),
    ai_model: spec.selectedModel ?? "auto",
    generation_state: "queued",
    billing_state: "not_charged",
    retry_state: retryState,
    generation_status_text: "Queued",
    generation_attempt: attempt,
    generation_idempotency_key: input.idempotencyKey,
    // credit_cost is intentionally NOT set: n8n performs the upfront video
    // deduction/refund (plan §18) and no server-side video pricing registry
    // exists yet (V11). A price is never invented or trusted from the browser.
    ...sceneSpecToCreationMetadata(spec),
    ...(input.retryOfContentId ? { retry_of_content_id: input.retryOfContentId } : {}),
  };

  // Durable idempotency: ON CONFLICT DO NOTHING via the (client_id,
  // generation_idempotency_key) unique index. A concurrent duplicate returns no
  // row here; we then read back the winning placeholder.
  const inserted = await supabaseAdmin
    .from("content")
    .upsert(row, { onConflict: "client_id,generation_idempotency_key", ignoreDuplicates: true })
    .select(PLACEHOLDER_SELECT)
    .maybeSingle();
  if (inserted.error) return INTERNAL_ERROR;
  if (inserted.data) return { ok: true, value: mapRow(inserted.data, false) };

  const existing = await supabaseAdmin
    .from("content")
    .select(PLACEHOLDER_SELECT)
    .eq("client_id", clientId)
    .eq("generation_idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing.error || !existing.data) return INTERNAL_ERROR;
  return { ok: true, value: mapRow(existing.data, true) };
}
