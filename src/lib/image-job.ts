/**
 * Image Studio Completion Plan — Slice 4: minimum durable image-generation job
 * and metadata envelope (server side).
 *
 * Creates a durable, tenant-owned `content` placeholder for a generation attempt
 * BEFORE any provider execution. It authenticates ownership (auth → client →
 * brand → optional retry parent), enforces idempotency at the database (not in
 * process memory), and records the three distinct Slice 3 state dimensions plus
 * minimum lineage/metadata. It never calls a provider, n8n, Cloudinary, or a
 * billing RPC, and never mutates generation state after creation.
 */

import { supabaseAdmin } from "@/lib/supabase-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// A client-generated creation token. Bounded and mirrored by the DB CHECK.
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
// User-facing Image Studio modes (a placeholder is created before execution).
const JOB_MODES = new Set(["standard", "product_drop", "organic_blend", "grid", "edit"]);
const ASPECT_RATIOS = new Set(["1:1", "4:5", "3:4", "9:16", "16:9", "3:2", "2:3"]);

export type ImageJobRequest = {
  brandId: string;
  idempotencyKey: string;
  mode: string;
  aspectRatio?: string;
  retryOfContentId?: string;
};

export interface ImageJobPlaceholder {
  id: string;
  generationState: string;
  billingState: string;
  retryState: string;
  attempt: number;
  idempotent: boolean;
}

type Failure = { ok: false; status: 400 | 401 | 404 | 500; error: string };
export type ImageJobResult<T> = { ok: true; value: T } | Failure;

const INTERNAL_ERROR: Failure = { ok: false, status: 500, error: "Internal server error" };
const NOT_FOUND: Failure = { ok: false, status: 404, error: "Resource not found" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function parseImageJobRequest(value: unknown): ImageJobRequest | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, ["brand_id", "idempotency_key", "mode", "aspect_ratio", "retry_of_content_id"])) {
    return null;
  }

  if (typeof value.brand_id !== "string" || !UUID_PATTERN.test(value.brand_id)) return null;
  if (typeof value.idempotency_key !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(value.idempotency_key)) return null;
  if (typeof value.mode !== "string" || !JOB_MODES.has(value.mode)) return null;

  let aspectRatio: string | undefined;
  if (value.aspect_ratio !== undefined && value.aspect_ratio !== null) {
    if (typeof value.aspect_ratio !== "string" || !ASPECT_RATIOS.has(value.aspect_ratio)) return null;
    aspectRatio = value.aspect_ratio;
  }

  let retryOfContentId: string | undefined;
  if (value.retry_of_content_id !== undefined && value.retry_of_content_id !== null) {
    if (typeof value.retry_of_content_id !== "string" || !UUID_PATTERN.test(value.retry_of_content_id)) return null;
    retryOfContentId = value.retry_of_content_id;
  }

  return {
    brandId: value.brand_id,
    idempotencyKey: value.idempotency_key,
    mode: value.mode,
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(retryOfContentId ? { retryOfContentId } : {}),
  };
}

export function isValidContentId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Columns needed to restore a job's durable status (Slice 5 poll fallback). */
const JOB_STATUS_SELECT =
  "id, image_urls, generation_state, billing_state, retry_state, generation_status_text, generation_error_code, generation_attempt";

/**
 * Load a generation job's durable envelope, scoped to the authenticated user's
 * client. Cross-tenant or missing rows return an identical 404 (no leakage).
 * Read-only: no provider, n8n, or billing work.
 */
export async function loadOwnedImageJob(
  userId: string,
  contentId: string,
): Promise<ImageJobResult<Record<string, unknown>>> {
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

async function loadClientId(userId: string): Promise<ImageJobResult<string>> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return INTERNAL_ERROR;
  return data?.id ? { ok: true, value: data.id as string } : NOT_FOUND;
}

async function verifyBrandOwned(clientId: string, brandId: string): Promise<ImageJobResult<true>> {
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
): Promise<ImageJobResult<{ attempt: number }>> {
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

function mapRow(row: Record<string, unknown>, idempotent: boolean): ImageJobPlaceholder {
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

/**
 * Create (or idempotently return) a durable generation placeholder for the
 * authenticated user's verified client and brand. Service-role writes occur
 * only after ownership is proven.
 */
export async function createImageJobPlaceholder(
  userId: string,
  input: ImageJobRequest,
): Promise<ImageJobResult<ImageJobPlaceholder>> {
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

  const row = {
    client_id: clientId,
    brand_id: input.brandId,
    content_type: "post_image",
    status: "draft",
    image_urls: [],
    generation_state: "queued",
    billing_state: "not_charged",
    retry_state: retryState,
    generation_status_text: "Queued",
    generation_attempt: attempt,
    generation_idempotency_key: input.idempotencyKey,
    creation_metadata_version: 1,
    creation_metadata: {
      operation: input.mode,
      mode: input.mode,
      ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
    },
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
