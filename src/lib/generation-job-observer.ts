/**
 * Generic, studio-agnostic client observer for one durable generation job
 * (Image Studio Completion Plan — Slice 5, Increment 2; shared with Video per the
 * video plan §14 reuse map).
 *
 * It restores and observes a single owned job by content id through:
 *   1. an authenticated initial status read (owned `GET /api/image-jobs?id=`),
 *   2. Supabase Realtime updates for the matching `content.id`,
 *   3. an authenticated polling fallback (the same owned endpoint) while active,
 *   4. unified snapshot delivery reusing the Slice-3 generation/billing/retry
 *      vocabulary and the Slice-4 durable-row mapper,
 *   5. deterministic cleanup.
 *
 * The deterministic core is framework-independent and directly unit-testable:
 * Realtime and fetch are dependency-injected (real defaults provided). No
 * provider, n8n, billing, Cloudinary, or service-role work occurs here, and the
 * browser reads state only through the authenticated owned endpoint.
 *
 * This module intentionally does NOT create placeholders, submit jobs, change
 * the synchronous Generate path, or render anything — that is Increment 3.
 */

import {
  deriveStatusFromContentRow,
  isImageGenerationStatus,
  isTerminal,
  type GenerationState,
  type ImageGenerationStatus,
} from "@/lib/image-generation-state";

// A local observation timeout NEVER asserts the provider failed or that a refund
// occurred. It is an honest "still working / stale" presentation that a later
// durable succeeded/failed update replaces.
const OBSERVATION_TIMEOUT_MESSAGE =
  "This is taking longer than usual. It may still finish — we'll update this as soon as it completes.";

const DEFAULT_POLL_INTERVAL_MS = 5_000;

// Forward-progress ordering so an in-flight stale poll cannot visibly move a job
// backwards. Terminal states share the top rank; the terminal latch handles them.
const STATE_RANK: Record<GenerationState, number> = {
  idle: 0, preparing: 1, queued: 2, generating: 3, saving: 4, succeeded: 5, failed: 5, timed_out: 5,
};

export interface GenerationJobSnapshot {
  contentId: string;
  status: ImageGenerationStatus;
  imageUrls: string[];
  /** True only for a local observation-timeout presentation (not a durable claim). */
  observationTimedOut: boolean;
}

export interface GenerationJobObservationError {
  /** Stable, sanitized code (never a raw Supabase/provider message). */
  code: string;
  message: string;
}

export type JobReadResult =
  | { ok: true; status: ImageGenerationStatus; imageUrls: string[] }
  | { ok: false; code: string };

/** Reads one owned job's durable snapshot. Injected in tests; defaults to the owned GET. */
export type JobFetcher = (contentId: string, signal: AbortSignal) => Promise<JobReadResult>;

/** Subscribes to the matching content row; returns an unsubscribe. Injected in tests. */
export type JobSubscriber = (contentId: string, onRow: (row: Record<string, unknown>) => void) => () => void;

export interface GenerationJobObserverOptions {
  contentId: string;
  onSnapshot: (snapshot: GenerationJobSnapshot) => void;
  onError?: (error: GenerationJobObservationError) => void;
  pollIntervalMs?: number;
  /** Local observation deadline in ms; <= 0 disables the timeout presentation. */
  observationTimeoutMs?: number;
  fetchJob?: JobFetcher;
  subscribe?: JobSubscriber;
}

export interface GenerationJobObserver {
  dispose(): void;
}

function extractImageUrls(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((url): url is string => typeof url === "string") : [];
}

function signatureOf(status: ImageGenerationStatus, imageUrls: string[], timedOut: boolean): string {
  // Dedupe on the ORDERED URL values (image order is meaningful: first is the
  // primary result and batch order is significant), not merely the count — two
  // snapshots with the same count but different/reordered URLs must still be
  // delivered. The array is read as-is (never mutated or sorted).
  return JSON.stringify([
    status.generationState, status.billingState, status.retryState,
    status.attempt, status.errorCode, status.message, imageUrls, timedOut,
  ]);
}

function safeMessageFor(code: string): string {
  switch (code) {
    case "unauthorized": return "Your session expired. Please sign in again.";
    case "not_found": return "This generation could not be found.";
    case "poll_failed": return "Temporary connection issue — still checking on your image.";
    case "invalid_response": return "Received an unexpected status; still checking.";
    default: return "Couldn't load the latest status — retrying.";
  }
}

// ── Default (real) dependencies ──────────────────────────────────────────────
// Reads only the authenticated owned endpoint (no service-role, no tenant ids).
export const fetchOwnedGenerationJob: JobFetcher = async (contentId, signal) => {
  const response = await fetch(`/api/image-jobs?id=${encodeURIComponent(contentId)}`, {
    signal, headers: { "Cache-Control": "no-store" },
  });
  if (!response.ok) {
    return { ok: false, code: response.status === 401 ? "unauthorized" : response.status === 404 ? "not_found" : "read_failed" };
  }
  const body = await response.json().catch(() => null);
  if (!body || body.id !== contentId || !isImageGenerationStatus(body.status)) {
    return { ok: false, code: "invalid_response" };
  }
  return { ok: true, status: body.status, imageUrls: extractImageUrls(body.image_urls) };
};

// Filters Realtime at the source to the exact content id. Lazily imports the
// browser client so the deterministic core stays node-testable and framework-free.
const defaultSubscribe: JobSubscriber = (contentId, onRow) => {
  let channel: unknown = null;
  let removed = false;
  void import("@/lib/supabase").then(({ supabase }) => {
    if (removed) return;
    channel = supabase
      .channel(`generation-job-${contentId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "content", filter: `id=eq.${contentId}` },
        (payload: { new?: Record<string, unknown> }) => { if (payload?.new) onRow(payload.new); },
      )
      .subscribe();
  });
  return () => {
    removed = true;
    if (channel) void import("@/lib/supabase").then(({ supabase }) => supabase.removeChannel(channel as never));
  };
};

/**
 * Begin observing one owned durable generation job. Subscribes to Realtime
 * FIRST, then performs the initial owned read, so a newer Realtime event is
 * never overwritten by an older initial GET. Returns a disposable handle.
 */
export function observeGenerationJob(options: GenerationJobObserverOptions): GenerationJobObserver {
  const { contentId, onSnapshot, onError } = options;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const observationTimeoutMs = options.observationTimeoutMs ?? 0;
  const fetchJob = options.fetchJob ?? fetchOwnedGenerationJob;
  const subscribe = options.subscribe ?? defaultSubscribe;

  let disposed = false;
  let terminalReached = false;
  let realtimeApplied = false;
  let localTimedOut = false;
  let lastDurable: { status: ImageGenerationStatus; imageUrls: string[] } | null = null;
  let lastDeliveredSignature: string | null = null;

  let unsubscribe: (() => void) | null = null;
  let unsubscribed = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let currentAbort: AbortController | null = null;
  let pollInFlight = false;

  // Callback exceptions must never break timer/subscription cleanup.
  function guard(run: () => void) { try { run(); } catch { /* swallow: never break lifecycle */ } }

  function emitError(code: string, message: string) {
    if (onError) guard(() => onError({ code, message }));
  }

  function present() {
    if (disposed) return;
    let snapshot: GenerationJobSnapshot | null = null;
    if (lastDurable && isTerminal(lastDurable.status)) {
      snapshot = { contentId, status: lastDurable.status, imageUrls: lastDurable.imageUrls, observationTimedOut: false };
    } else if (localTimedOut) {
      const base = lastDurable?.status;
      snapshot = {
        contentId,
        status: {
          generationState: "timed_out",
          billingState: base?.billingState ?? "not_charged", // honest: no refund/failure claim
          retryState: base?.retryState ?? "none",
          message: OBSERVATION_TIMEOUT_MESSAGE,
          errorCode: "timeout",
          attempt: base?.attempt ?? 1,
        },
        imageUrls: lastDurable?.imageUrls ?? [],
        observationTimedOut: true,
      };
    } else if (lastDurable) {
      snapshot = { contentId, status: lastDurable.status, imageUrls: lastDurable.imageUrls, observationTimedOut: false };
    }
    if (!snapshot) return;
    const sig = signatureOf(snapshot.status, snapshot.imageUrls, snapshot.observationTimedOut);
    if (sig === lastDeliveredSignature) return; // dedupe identical deliveries (poll vs realtime)
    lastDeliveredSignature = sig;
    guard(() => onSnapshot(snapshot as GenerationJobSnapshot));
  }

  function ingestDurable(status: ImageGenerationStatus, imageUrls: string[]) {
    if (disposed || terminalReached) return; // terminal latch: first terminal wins, ignore late stale
    const terminal = isTerminal(status);
    if (lastDurable && !terminal) {
      // Backwards protection: a stale in-flight read cannot regress the visible state.
      if (STATE_RANK[status.generationState] < STATE_RANK[lastDurable.status.generationState]) return;
    }
    lastDurable = { status, imageUrls };
    if (terminal) { terminalReached = true; stopPolling(); }
    present(); // present() dedupes, so an identical durable snapshot is not re-delivered
  }

  function ingestRow(row: Record<string, unknown>) {
    if (disposed) return;
    if (String(row?.id) !== contentId) return; // cross-job guard (belt-and-suspenders with the server filter)
    const status = deriveStatusFromContentRow(row);
    if (!status) return; // non-job / malformed row: ignore, never fail the generation
    realtimeApplied = true; // a valid Realtime snapshot has arrived → initial GET must not overwrite it
    ingestDurable(status, extractImageUrls(row.image_urls));
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  async function initialRead() {
    const controller = new AbortController();
    currentAbort = controller;
    let result: JobReadResult;
    try {
      result = await fetchJob(contentId, controller.signal);
    } catch {
      if (!disposed) emitError("read_failed", safeMessageFor("read_failed"));
      return;
    }
    if (disposed) return;
    if (!result.ok) { emitError(result.code, safeMessageFor(result.code)); return; }
    if (realtimeApplied) return; // a newer Realtime event already arrived — do not overwrite
    ingestDurable(result.status, result.imageUrls);
  }

  async function pollTick() {
    if (disposed || terminalReached || pollInFlight) return; // no overlapping polls
    pollInFlight = true;
    const controller = new AbortController();
    currentAbort = controller;
    let result: JobReadResult;
    try {
      result = await fetchJob(contentId, controller.signal);
    } catch {
      pollInFlight = false;
      if (!disposed) emitError("poll_failed", safeMessageFor("poll_failed")); // transient — do NOT fail the job
      return;
    }
    pollInFlight = false;
    if (disposed) return;
    if (!result.ok) { emitError(result.code, safeMessageFor(result.code)); return; }
    ingestDurable(result.status, result.imageUrls);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopPolling();
    if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
    if (currentAbort) currentAbort.abort();
    if (unsubscribe && !unsubscribed) { unsubscribed = true; guard(unsubscribe); }
  }

  // ── Start: subscribe FIRST, then initial read (race policy), then poll/timeout ──
  unsubscribe = subscribe(contentId, ingestRow);
  pollTimer = setInterval(() => { void pollTick(); }, pollIntervalMs);
  if (observationTimeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      if (disposed || terminalReached) return;
      localTimedOut = true;
      present();
    }, observationTimeoutMs);
  }
  void initialRead();

  return { dispose };
}
