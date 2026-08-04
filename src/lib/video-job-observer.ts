/**
 * Video Studio Completion Plan — V5: reliable async scene jobs + restoration
 * (client observation half).
 *
 * A storytelling sequence is many concurrent scene jobs. This module observes a
 * SET of them by reusing the studio-agnostic observer Image Slice 5 already
 * proved (`observeGenerationJob`) — one observer per scene — rather than writing
 * a second watcher. That gives every scene, for free: Realtime-first subscription
 * (so an older initial read can never overwrite a newer event), an authenticated
 * polling fallback, a terminal latch, forward-progress protection against stale
 * reads, snapshot de-duplication, an honest local timeout presentation, and
 * deterministic cleanup.
 *
 * What this replaces: the previous per-scene inline `while` loop that polled one
 * row for 15 minutes and watched only the LAST scene of a sequence (plan §6.3).
 *
 * Boundaries: this module reads state only through the authenticated owned
 * endpoint. It never submits jobs, never writes, never calls a provider, n8n,
 * Cloudinary, or a billing RPC, and never claims a refund the durable row has
 * not reported.
 */

import {
  isImageGenerationStatus,
  isTerminal,
  type ImageGenerationStatus,
} from "@/lib/image-generation-state";
import {
  observeGenerationJob,
  type GenerationJobObserver,
  type GenerationJobObservationError,
  type GenerationJobSnapshot,
  type JobFetcher,
  type JobSubscriber,
} from "@/lib/generation-job-observer";

/**
 * Reads one owned VIDEO job. Mirrors `fetchOwnedGenerationJob` but targets
 * `/api/video-jobs` and maps `video_urls` into the shared snapshot's URL field.
 *
 * Note on naming: the shared snapshot calls the array `imageUrls` because it was
 * introduced by the image program. It carries this job's asset URLs whatever the
 * medium; `sceneSnapshotAssetUrls` below is the video-facing accessor so callers
 * never have to read "image" for a video clip. The shared field is deliberately
 * NOT renamed here — doing so would churn the image code and its tests inside a
 * video slice.
 */
export const fetchOwnedVideoJob: JobFetcher = async (contentId, signal) => {
  const response = await fetch(`/api/video-jobs?id=${encodeURIComponent(contentId)}`, {
    signal,
    headers: { "Cache-Control": "no-store" },
  });
  if (!response.ok) {
    return {
      ok: false,
      code: response.status === 401 ? "unauthorized" : response.status === 404 ? "not_found" : "read_failed",
    };
  }
  const body = await response.json().catch(() => null);
  if (!body || body.id !== contentId || !isImageGenerationStatus(body.status)) {
    return { ok: false, code: "invalid_response" };
  }
  const videoUrls = Array.isArray(body.video_urls)
    ? body.video_urls.filter((url: unknown): url is string => typeof url === "string")
    : [];
  return { ok: true, status: body.status, imageUrls: videoUrls };
};

/** Video-facing accessor for a snapshot's asset URLs (see the naming note above). */
export function sceneSnapshotAssetUrls(snapshot: GenerationJobSnapshot): string[] {
  return snapshot.imageUrls;
}

/** First playable URL for a finished scene, or null. */
export function sceneSnapshotVideoUrl(snapshot: GenerationJobSnapshot): string | null {
  return snapshot.imageUrls.find((url) => typeof url === "string" && url.startsWith("http")) ?? null;
}

/** One scene to observe. */
export interface ObservedScene {
  sceneId: string;
  sceneNumber: number;
  contentId: string;
}

export interface SceneSnapshot {
  sceneId: string;
  sceneNumber: number;
  contentId: string;
  status: ImageGenerationStatus;
  videoUrl: string | null;
  /** True only for a LOCAL staleness presentation — never a durable claim. */
  observationTimedOut: boolean;
}

export interface SceneSetObserverOptions {
  scenes: readonly ObservedScene[];
  onSceneSnapshot: (snapshot: SceneSnapshot) => void;
  /** Called once per scene the moment it reaches a terminal state. */
  onSceneSettled?: (snapshot: SceneSnapshot) => void;
  onSceneError?: (sceneId: string, error: GenerationJobObservationError) => void;
  pollIntervalMs?: number;
  observationTimeoutMs?: number;
  fetchJob?: JobFetcher;
  subscribe?: JobSubscriber;
  /** Injectable for tests; defaults to the shared single-job observer. */
  observe?: typeof observeGenerationJob;
}

export interface SceneSetObserver {
  /** Stop observing everything. Idempotent. */
  dispose(): void;
  /** Stop observing one scene (e.g. it settled and was cleared). Idempotent. */
  disposeScene(sceneId: string): void;
  /** Scene ids still being observed. */
  activeSceneIds(): string[];
}

/**
 * Observe every supplied scene concurrently. Each scene gets its own independent
 * observer, so one failing scene never stops the others from reporting — which is
 * exactly what makes partial success visible (plan §18).
 */
export function observeSceneSet(options: SceneSetObserverOptions): SceneSetObserver {
  const observe = options.observe ?? observeGenerationJob;
  const handles = new Map<string, GenerationJobObserver>();
  const settled = new Set<string>();
  let disposed = false;

  function guard(run: () => void) {
    try {
      run();
    } catch {
      /* a callback throw must never break observation lifecycle */
    }
  }

  for (const scene of options.scenes) {
    if (handles.has(scene.sceneId)) continue; // never double-observe one scene
    const handle = observe({
      contentId: scene.contentId,
      pollIntervalMs: options.pollIntervalMs,
      observationTimeoutMs: options.observationTimeoutMs,
      ...(options.fetchJob ? { fetchJob: options.fetchJob } : { fetchJob: fetchOwnedVideoJob }),
      ...(options.subscribe ? { subscribe: options.subscribe } : {}),
      onSnapshot: (snapshot) => {
        if (disposed) return;
        const sceneSnapshot: SceneSnapshot = {
          sceneId: scene.sceneId,
          sceneNumber: scene.sceneNumber,
          contentId: scene.contentId,
          status: snapshot.status,
          videoUrl: sceneSnapshotVideoUrl(snapshot),
          observationTimedOut: snapshot.observationTimedOut,
        };
        guard(() => options.onSceneSnapshot(sceneSnapshot));
        // Settle exactly once, and only on a DURABLE terminal state — a local
        // observation timeout is not a settlement, because the job may still finish.
        if (!snapshot.observationTimedOut && isTerminal(snapshot.status) && !settled.has(scene.sceneId)) {
          settled.add(scene.sceneId);
          if (options.onSceneSettled) guard(() => options.onSceneSettled!(sceneSnapshot));
        }
      },
      ...(options.onSceneError
        ? { onError: (error: GenerationJobObservationError) => guard(() => options.onSceneError!(scene.sceneId, error)) }
        : {}),
    });
    handles.set(scene.sceneId, handle);
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const handle of handles.values()) guard(() => handle.dispose());
      handles.clear();
    },
    disposeScene(sceneId: string) {
      const handle = handles.get(sceneId);
      if (!handle) return;
      handles.delete(sceneId);
      guard(() => handle.dispose());
    },
    activeSceneIds() {
      return [...handles.keys()];
    },
  };
}
