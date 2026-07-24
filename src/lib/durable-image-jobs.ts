/**
 * Guarded rollout seam + restoration persistence for Image Studio durable jobs
 * (Slice 5, Increment 3).
 *
 * The durable (placeholder → submit → observe) path is OFF by default: the live
 * n8n async acknowledgement / status writing is not yet authorized, so the
 * existing synchronous generation path remains the compatibility fallback. The
 * durable path is enabled only by an explicit env flag (real rollout) or, in a
 * non-production test runtime, an explicit `?durableJobs=1` URL param.
 */

const ACTIVE_JOB_STORAGE_KEY = "blink-image-active-job";

// Matches the server IDEMPOTENCY_KEY / content-id UUID shapes we persist.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DurableJobsEnv {
  /** e.g. process.env.NEXT_PUBLIC_DURABLE_IMAGE_JOBS */
  rolloutFlag?: string;
  /** e.g. process.env.NEXT_PUBLIC_TESTING_MODE */
  testingMode?: string;
  /** e.g. window.location.search */
  search?: string;
}

/**
 * Whether the durable path may run. Env flag `=== "1"` enables it anywhere;
 * otherwise, only a non-production test runtime honours `?durableJobs=1`. Pure
 * and injectable so it is deterministically testable.
 */
export function isDurableImageJobsEnabled(env: DurableJobsEnv): boolean {
  if (env.rolloutFlag === "1") return true;
  if (env.testingMode === "true") {
    try {
      return new URLSearchParams(env.search ?? "").get("durableJobs") === "1";
    } catch {
      return false;
    }
  }
  return false;
}

/** Read the env once from the browser globals (thin wrapper over the pure guard). */
export function durableImageJobsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return isDurableImageJobsEnabled({
    rolloutFlag: process.env.NEXT_PUBLIC_DURABLE_IMAGE_JOBS,
    testingMode: process.env.NEXT_PUBLIC_TESTING_MODE,
    search: window.location.search,
  });
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(store?: StorageLike): StorageLike | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Persist the single active durable job for a brand so a refresh/navigation can
 * restore and OBSERVE it (never resubmit). One active job per brand.
 */
export function persistActiveImageJob(brandId: string, contentId: string, store?: StorageLike): void {
  const s = storage(store);
  if (!s || !brandId || !contentId) return;
  try {
    s.setItem(ACTIVE_JOB_STORAGE_KEY, JSON.stringify({ brandId, contentId }));
  } catch {
    /* storage unavailable — restoration simply won't be possible */
  }
}

/** Read the active durable job content id for a brand, or null. */
export function readActiveImageJob(brandId: string, store?: StorageLike): string | null {
  const s = storage(store);
  if (!s || !brandId) return null;
  try {
    const raw = s.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { brandId?: unknown; contentId?: unknown };
    if (parsed?.brandId !== brandId) return null;
    return typeof parsed.contentId === "string" && UUID_PATTERN.test(parsed.contentId) ? parsed.contentId : null;
  } catch {
    return null;
  }
}

/** Clear the active durable job, only when it matches the given content id. */
export function clearActiveImageJob(contentId: string, store?: StorageLike): void {
  const s = storage(store);
  if (!s) return;
  try {
    const raw = s.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { contentId?: unknown };
    if (parsed?.contentId === contentId) s.removeItem(ACTIVE_JOB_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
