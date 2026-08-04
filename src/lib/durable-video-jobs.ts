/**
 * Video Studio Completion Plan — V5: restoration persistence for durable scene
 * jobs.
 *
 * Mirrors `durable-image-jobs.ts`, with one structural difference: a storytelling
 * sequence has MANY scenes in flight at once, so this persists a SET keyed by
 * brand rather than a single job.
 *
 * What it is for: after a refresh or navigation, the studio must be able to
 * re-attach to scenes that are still generating and OBSERVE them — never
 * resubmit them (a resubmit would create a second job and risk a second n8n
 * deduction). Only ids are stored; no tenant, billing, or provider data.
 *
 * Unlike the image path there is deliberately NO rollout flag: V3 already routes
 * every scene placeholder through the durable endpoint, so there is no second
 * path to guard. Observation simply reads the rows that already exist.
 */

const ACTIVE_SCENES_STORAGE_KEY = "blink-video-active-scenes";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Bound the stored set so a runaway sequence cannot bloat storage. */
export const MAX_PERSISTED_SCENES = 40;

export interface PersistedSceneJob {
  sceneId: string;
  sceneNumber: number;
  contentId: string;
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

function isValidJob(value: unknown): value is PersistedSceneJob {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sceneId === "string" && v.sceneId.length > 0 && v.sceneId.length <= 200 &&
    typeof v.contentId === "string" && UUID_PATTERN.test(v.contentId) &&
    typeof v.sceneNumber === "number" && Number.isInteger(v.sceneNumber) && v.sceneNumber >= 1
  );
}

/** Read every persisted in-flight scene job for a brand. Invalid entries are dropped. */
export function readActiveSceneJobs(brandId: string, store?: StorageLike): PersistedSceneJob[] {
  const s = storage(store);
  if (!s || !brandId) return [];
  try {
    const raw = s.getItem(ACTIVE_SCENES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { brandId?: unknown; jobs?: unknown };
    // Scoped to the brand: switching workspaces must never restore another
    // brand's scenes into this storyboard.
    if (parsed?.brandId !== brandId || !Array.isArray(parsed.jobs)) return [];
    return parsed.jobs.filter(isValidJob).slice(0, MAX_PERSISTED_SCENES);
  } catch {
    return [];
  }
}

/**
 * Record one scene job as in flight for a brand. Re-recording the same scene
 * replaces its entry (a retry supersedes the previous attempt), so the set never
 * holds two rows for one scene.
 */
export function persistActiveSceneJob(
  brandId: string,
  job: PersistedSceneJob,
  store?: StorageLike,
): void {
  const s = storage(store);
  if (!s || !brandId || !isValidJob(job)) return;
  try {
    const existing = readActiveSceneJobs(brandId, store).filter((j) => j.sceneId !== job.sceneId);
    const jobs = [...existing, job].slice(-MAX_PERSISTED_SCENES);
    s.setItem(ACTIVE_SCENES_STORAGE_KEY, JSON.stringify({ brandId, jobs }));
  } catch {
    /* storage unavailable — restoration simply won't be possible */
  }
}

/** Remove one settled scene from the in-flight set. */
export function clearActiveSceneJob(brandId: string, sceneId: string, store?: StorageLike): void {
  const s = storage(store);
  if (!s || !brandId) return;
  try {
    const jobs = readActiveSceneJobs(brandId, store).filter((j) => j.sceneId !== sceneId);
    if (jobs.length === 0) {
      s.removeItem(ACTIVE_SCENES_STORAGE_KEY);
      return;
    }
    s.setItem(ACTIVE_SCENES_STORAGE_KEY, JSON.stringify({ brandId, jobs }));
  } catch {
    /* ignore */
  }
}

/** Drop the whole in-flight set for a brand (e.g. the storyboard was reset). */
export function clearAllActiveSceneJobs(store?: StorageLike): void {
  const s = storage(store);
  if (!s) return;
  try {
    s.removeItem(ACTIVE_SCENES_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
