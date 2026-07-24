/**
 * Generic client submit contract for durable generation jobs (Slice 5,
 * Increment 3). Studio-agnostic so Video Studio can reuse it.
 *
 * It mints one idempotency key per user action and creates an OWNED placeholder
 * through `POST /api/image-jobs`. The browser sends only the job-shaping inputs
 * (brand id, mode, aspect ratio, idempotency key, retry-parent id); the server
 * derives the client/tenant, applies billing authority, and does all provider
 * work. No tenant id, billing authority, provider credentials, or service-role
 * data ever leaves the browser here.
 */

const IDEMPOTENCY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Mint a bounded, URL-safe creation token (matches the server IDEMPOTENCY_KEY_PATTERN). */
export function mintIdempotencyKey(prefix = "studio"): string {
  let random = "";
  for (let i = 0; i < 16; i += 1) {
    random += IDEMPOTENCY_ALPHABET[Math.floor(Math.random() * IDEMPOTENCY_ALPHABET.length)];
  }
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export interface SubmitGenerationJobInput {
  brandId: string;
  mode: string;
  idempotencyKey: string;
  aspectRatio?: string;
  /** Parent placeholder this attempt retries; preserves retry lineage. */
  retryOfContentId?: string;
}

export type SubmitGenerationJobResult =
  | { ok: true; contentId: string; jobId: string; idempotent: boolean; attempt: number }
  | { ok: false; code: string };

/** Injectable fetch (defaults to global fetch) for deterministic tests. */
export type JobSubmitFetch = typeof fetch;

/**
 * Create (or idempotently return) the durable placeholder. A repeated
 * idempotency key returns the same placeholder — the endpoint is DB-idempotent —
 * so duplicate clicks/retries/Strict-Mode never create or charge twice.
 */
export async function submitGenerationJob(
  input: SubmitGenerationJobInput,
  doFetch: JobSubmitFetch = fetch,
): Promise<SubmitGenerationJobResult> {
  const body: Record<string, unknown> = {
    brand_id: input.brandId,
    idempotency_key: input.idempotencyKey,
    mode: input.mode,
  };
  if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
  if (input.retryOfContentId) body.retry_of_content_id = input.retryOfContentId;

  let response: Response;
  try {
    response = await doFetch("/api/image-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: "submit_failed" };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: response.status === 401 ? "unauthorized" : response.status === 404 ? "not_found" : response.status === 400 ? "invalid_request" : "submit_failed",
    };
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data.id !== "string") return { ok: false, code: "invalid_response" };
  return {
    ok: true,
    contentId: data.id,
    jobId: data.id, // the durable placeholder IS the job; a separate provider task id may supersede later
    idempotent: data.idempotent === true,
    attempt: typeof data.attempt === "number" && data.attempt >= 1 ? data.attempt : 1,
  };
}
