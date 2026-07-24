/**
 * Unified image-generation state contract (Image Studio Completion Plan — Slice 3).
 *
 * One typed source of truth for what an image generation is doing, whether the
 * user was charged/refunded, and whether retry is safe. Generation state is kept
 * separate from billing state so a failed job never loses the fact that it was
 * refunded, and a refund is never mistaken for a successful generation (plan §7.1).
 *
 * This module is intentionally pure (no React, no DOM, no network) so it can be
 * unit-tested in the node environment and reused by any surface. The current
 * synchronous Image Studio flow is mapped onto this contract; async persistence
 * is a later slice and must not be introduced here.
 */

export type GenerationState =
  | "idle"
  | "preparing"
  | "queued"
  | "generating"
  | "saving"
  | "succeeded"
  | "failed"
  | "timed_out";

export type BillingState =
  | "not_charged"
  | "charged"
  | "refund_pending"
  | "refunded"
  | "refund_failed";

export type RetryState = "none" | "retry_available" | "retrying";

export interface ImageGenerationStatus {
  generationState: GenerationState;
  billingState: BillingState;
  retryState: RetryState;
  /** Human-facing detail for failure/timeout; null when there is nothing to add. */
  message: string | null;
  /** Stable code for telemetry and tests; null unless a terminal failure. */
  errorCode: string | null;
  /** How many attempts have been made in this generation lineage (start = 1). */
  attempt: number;
}

export type ImageGenerationEvent =
  | { type: "start" }
  | { type: "retry" }
  | { type: "queued" }
  | { type: "generating" }
  | { type: "saving" }
  | { type: "succeeded" }
  | { type: "failed"; errorCode: string; message?: string | null; billing?: BillingState }
  | { type: "timed_out"; message?: string | null }
  // Authoritative durable-state sync (Slice 5): a persisted snapshot IS the truth,
  // so it replaces local state directly and bypasses forward-transition validation.
  | { type: "sync"; status: ImageGenerationStatus }
  | { type: "reset" };

export const initialImageGenerationStatus: ImageGenerationStatus = {
  generationState: "idle",
  billingState: "not_charged",
  retryState: "none",
  message: null,
  errorCode: null,
  attempt: 0,
};

/** Generation states in which a request is in flight. */
export const ACTIVE_GENERATION_STATES: readonly GenerationState[] = [
  "preparing",
  "queued",
  "generating",
  "saving",
];

/** Generation states that represent a finished attempt. */
export const TERMINAL_GENERATION_STATES: readonly GenerationState[] = [
  "succeeded",
  "failed",
  "timed_out",
];

const DEFAULT_TIMEOUT_MESSAGE =
  "This attempt is taking longer than expected. It may still be processing — check your grid before retrying.";

/**
 * Which event types are allowed out of each generation state. `reset` is always
 * allowed. Any event not listed here is an invalid transition and is rejected.
 */
const ALLOWED_EVENTS: Record<GenerationState, ReadonlySet<ImageGenerationEvent["type"]>> = {
  idle: new Set(["start"]),
  preparing: new Set(["queued", "generating", "succeeded", "failed", "timed_out"]),
  queued: new Set(["generating", "failed", "timed_out"]),
  generating: new Set(["saving", "succeeded", "failed", "timed_out"]),
  saving: new Set(["succeeded", "failed", "timed_out"]),
  succeeded: new Set(["start"]),
  failed: new Set(["start", "retry"]),
  timed_out: new Set(["start", "retry"]),
};

/**
 * Whether `eventType` is a legal transition out of `state`. `reset` is always
 * legal. Callers can use this to assert rejection of invalid transitions.
 */
export function isValidTransition(
  state: GenerationState,
  eventType: ImageGenerationEvent["type"],
): boolean {
  if (eventType === "reset") return true;
  return ALLOWED_EVENTS[state].has(eventType);
}

/**
 * Pure reducer for the unified generation/billing/retry contract. Invalid
 * transitions are rejected by returning the unchanged status object.
 */
export function imageGenerationReducer(
  status: ImageGenerationStatus,
  event: ImageGenerationEvent,
): ImageGenerationStatus {
  if (event.type === "reset") return initialImageGenerationStatus;
  // Durable snapshot is authoritative — replace state directly, no transition gate.
  if (event.type === "sync") return { ...event.status };
  if (!isValidTransition(status.generationState, event.type)) return status;

  switch (event.type) {
    case "start":
      return {
        generationState: "preparing",
        billingState: "not_charged",
        retryState: "none",
        message: null,
        errorCode: null,
        attempt: 1,
      };
    case "retry":
      return {
        generationState: "preparing",
        billingState: "not_charged",
        retryState: "retrying",
        message: null,
        errorCode: null,
        attempt: status.attempt + 1,
      };
    case "queued":
      return { ...status, generationState: "queued" };
    case "generating":
      return { ...status, generationState: "generating" };
    case "saving":
      return { ...status, generationState: "saving" };
    case "succeeded":
      return {
        ...status,
        generationState: "succeeded",
        billingState: "charged",
        retryState: "none",
        message: null,
        errorCode: null,
      };
    case "failed":
      return {
        ...status,
        generationState: "failed",
        billingState: event.billing ?? "refund_pending",
        retryState: "retry_available",
        message: event.message ?? null,
        errorCode: event.errorCode,
      };
    case "timed_out":
      return {
        ...status,
        generationState: "timed_out",
        billingState: "refund_pending",
        retryState: "retry_available",
        message: event.message ?? DEFAULT_TIMEOUT_MESSAGE,
        errorCode: "timeout",
      };
  }
  // `reset` is handled above; the switch is exhaustive over remaining events,
  // so TypeScript flags any future event type that lacks a case here.
}

// ── Derived presentation selectors (pure) ───────────────────────────────────

export function isActive(status: ImageGenerationStatus): boolean {
  return ACTIVE_GENERATION_STATES.includes(status.generationState);
}

export function isTerminal(status: ImageGenerationStatus): boolean {
  return TERMINAL_GENERATION_STATES.includes(status.generationState);
}

/** Retry may be offered only when a finished attempt marked it available. */
export function canRetry(status: ImageGenerationStatus): boolean {
  return status.retryState === "retry_available";
}

/** A new generation may only start when no request is in flight. */
export function canStartGeneration(status: ImageGenerationStatus): boolean {
  return !isActive(status);
}

/** Message to warn on page-leave, or null when leaving is safe. */
export function leavePageWarning(status: ImageGenerationStatus): string | null {
  if (!isActive(status)) return null;
  return "An image is still generating. Leaving now may lose this attempt.";
}

export type StatusTone = "info" | "success" | "error" | "warning";

export interface StatusDescription {
  title: string;
  detail: string;
  tone: StatusTone;
}

/** Human wording for each generation state. Retrying is derived, not stored twice. */
export function describeStatus(status: ImageGenerationStatus): StatusDescription {
  const retrying = status.retryState === "retrying";
  switch (status.generationState) {
    case "idle":
      return { title: "", detail: "", tone: "info" };
    case "preparing":
      return {
        title: retrying ? "Retrying your generation" : "Preparing your generation",
        detail: "Assembling brand context and references…",
        tone: "info",
      };
    case "queued":
      return { title: "Queued", detail: "Waiting for an available generation slot…", tone: "info" };
    case "generating":
      return {
        title: retrying ? "Regenerating your image" : "Generating your image",
        detail: "Nano Banana is painting your pixels…",
        tone: "info",
      };
    case "saving":
      return { title: "Saving to your grid", detail: "Storing the finished image…", tone: "info" };
    case "succeeded":
      return { title: "Image ready", detail: "Saved to your content grid.", tone: "success" };
    case "failed":
      return {
        title: "Generation failed",
        detail: status.message ?? "Something went wrong. You can try again.",
        tone: "error",
      };
    case "timed_out":
      return {
        title: "Generation timed out",
        detail: status.message ?? DEFAULT_TIMEOUT_MESSAGE,
        tone: "warning",
      };
  }
}

// ── Durable-row derivation (Slice 5 restore / polling fallback) ──────────────
// Map a persisted content-envelope row (the Slice-4 columns) onto the unified
// status so a refreshed/navigated client can restore an in-flight or finished
// job from the database. Studio-agnostic: video reuses this same derivation.
// Returns null when the row is not a generation job (no valid generation_state).

const GENERATION_STATE_SET: ReadonlySet<string> = new Set<GenerationState>([
  "idle", "preparing", "queued", "generating", "saving", "succeeded", "failed", "timed_out",
]);
const BILLING_STATE_SET: ReadonlySet<string> = new Set<BillingState>([
  "not_charged", "charged", "refund_pending", "refunded", "refund_failed",
]);
const RETRY_STATE_SET: ReadonlySet<string> = new Set<RetryState>([
  "none", "retry_available", "retrying",
]);

export interface DurableJobRow {
  generation_state?: unknown;
  billing_state?: unknown;
  retry_state?: unknown;
  generation_status_text?: unknown;
  generation_error_code?: unknown;
  generation_attempt?: unknown;
}

export function deriveStatusFromContentRow(row: DurableJobRow): ImageGenerationStatus | null {
  const gs = row.generation_state;
  if (typeof gs !== "string" || !GENERATION_STATE_SET.has(gs)) return null;
  const generationState = gs as GenerationState;
  const terminalFailure = generationState === "failed" || generationState === "timed_out";
  const billingState = (typeof row.billing_state === "string" && BILLING_STATE_SET.has(row.billing_state)
    ? row.billing_state
    : "not_charged") as BillingState;
  const retryState = (typeof row.retry_state === "string" && RETRY_STATE_SET.has(row.retry_state)
    ? row.retry_state
    : "none") as RetryState;
  const statusText = typeof row.generation_status_text === "string" && row.generation_status_text
    ? row.generation_status_text
    : null;
  return {
    generationState,
    billingState,
    retryState,
    // Match Slice-3 semantics: message carries failure/timeout detail only.
    message: terminalFailure ? statusText : null,
    errorCode: typeof row.generation_error_code === "string" && row.generation_error_code
      ? row.generation_error_code
      : generationState === "timed_out"
        ? "timeout"
        : null,
    attempt: typeof row.generation_attempt === "number" && row.generation_attempt >= 1
      ? row.generation_attempt
      : 1,
  };
}

/**
 * Runtime guard for a well-formed ImageGenerationStatus (e.g. validating a
 * server-mapped status received over the wire before trusting it). Reuses the
 * same vocabulary sets as the durable-row derivation above — no second contract.
 */
export function isImageGenerationStatus(value: unknown): value is ImageGenerationStatus {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.generationState === "string" && GENERATION_STATE_SET.has(v.generationState) &&
    typeof v.billingState === "string" && BILLING_STATE_SET.has(v.billingState) &&
    typeof v.retryState === "string" && RETRY_STATE_SET.has(v.retryState) &&
    (v.message === null || typeof v.message === "string") &&
    (v.errorCode === null || typeof v.errorCode === "string") &&
    typeof v.attempt === "number"
  );
}

/** Short billing note derived from billingState, or null when there is nothing to say. */
export function billingLabel(status: ImageGenerationStatus): string | null {
  switch (status.billingState) {
    case "not_charged":
      return status.generationState === "failed" ? "No credits used" : null;
    case "charged":
      return "Credits charged";
    case "refund_pending":
      return "Refund in progress if you were charged";
    case "refunded":
      return "Credits refunded";
    case "refund_failed":
      return "Refund failed — contact support";
  }
}
