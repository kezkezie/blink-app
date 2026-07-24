import { useEffect, useRef } from "react";
import {
  observeGenerationJob,
  type GenerationJobObservationError,
  type GenerationJobSnapshot,
} from "@/lib/generation-job-observer";

/**
 * Thin React hook around the framework-independent `observeGenerationJob`
 * (Slice 5, Increment 3). Observes exactly ONE content id, disposes on id change
 * and unmount, and prevents a stale snapshot from a previously observed job from
 * reaching the caller. Studio-agnostic: Video Studio can reuse it.
 *
 * Passing `null` observes nothing (and disposes any prior observation).
 */
export interface UseObservedGenerationJobHandlers {
  onSnapshot: (snapshot: GenerationJobSnapshot) => void;
  onError?: (error: GenerationJobObservationError) => void;
}

// Honest local observation deadline; a later durable terminal replaces it.
const OBSERVATION_TIMEOUT_MS = 800_000;

export function useObservedGenerationJob(
  contentId: string | null,
  handlers: UseObservedGenerationJobHandlers,
  pollIntervalMs = 5_000,
): void {
  // Always call the latest handlers without re-subscribing on every render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!contentId) return;
    let active = true; // stale guard: only this effect's id may deliver
    const observer = observeGenerationJob({
      contentId,
      pollIntervalMs,
      observationTimeoutMs: OBSERVATION_TIMEOUT_MS,
      onSnapshot: (snapshot) => {
        if (active && snapshot.contentId === contentId) handlersRef.current.onSnapshot(snapshot);
      },
      onError: (error) => {
        if (active) handlersRef.current.onError?.(error);
      },
    });
    return () => {
      active = false;
      observer.dispose();
    };
  }, [contentId, pollIntervalMs]);
}
