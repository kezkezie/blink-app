/**
 * Video Studio Completion Plan — V4: unified video generation state.
 *
 * A storytelling sequence is many scene jobs, not one. This module turns the
 * per-scene durable states (written by the V3 job envelope) into ONE honest
 * sequence aggregate, so the UI can say
 *
 *     "3 of 5 scenes ready · scene 2 failed (refunded) · retry scene 2"
 *
 * instead of watching only the last row (plan §6.3 / §18).
 *
 * Reuse, not duplication: every state value comes from the Image Studio state
 * module (`image-generation-state.ts`) — the same `GenerationState`,
 * `BillingState`, `RetryState` vocabulary and the same
 * `deriveStatusFromContentRow` mapper. There is no video-only state language.
 *
 * This module is pure (no React, no DOM, no network) and owns presentation of
 * state only. It never submits, retries, refunds, or writes anything — those are
 * V5.
 */

import {
  deriveStatusFromContentRow,
  type BillingState,
  type DurableJobRow,
  type GenerationState,
  type ImageGenerationStatus,
} from "@/lib/image-generation-state";

/** One scene's job status. `status` is the shared per-job contract. */
export interface SceneJobStatus {
  sceneId: string;
  sceneNumber: number;
  /** The durable placeholder backing this attempt, when one exists. */
  contentId?: string;
  status: ImageGenerationStatus;
  /** Final asset URL once the scene succeeded. */
  assetUrl?: string | null;
}

/** How the sequence as a whole is doing. */
export type SequenceState =
  | "idle"
  | "running"
  | "succeeded"
  | "partial_success"
  | "failed";

export interface SequenceAggregate {
  state: SequenceState;
  total: number;
  ready: number;
  failed: number;
  active: number;
  notStarted: number;
  /** Failed scenes whose credits were returned — surfaced so the user is not left guessing. */
  refunded: number;
  /** Scene numbers a user may retry; successful scenes are never included. */
  retryableSceneNumbers: number[];
  /** One plain-language line for the UI. */
  message: string;
  /** True while any scene is still in flight (drives spinners / leave warnings). */
  isActive: boolean;
  /** True when there is something worth showing the user (progress, a failure,
   *  or work in flight). An untouched storyboard reports false. */
  hasProgress: boolean;
}

const ACTIVE_STATES: ReadonlySet<GenerationState> = new Set<GenerationState>([
  "preparing",
  "queued",
  "generating",
  "saving",
]);

const FAILED_STATES: ReadonlySet<GenerationState> = new Set<GenerationState>([
  "failed",
  "timed_out",
]);

const REFUNDED_BILLING: ReadonlySet<BillingState> = new Set<BillingState>([
  "refunded",
  "refund_pending",
]);

export function isSceneActive(scene: SceneJobStatus): boolean {
  return ACTIVE_STATES.has(scene.status.generationState);
}

export function isSceneReady(scene: SceneJobStatus): boolean {
  return scene.status.generationState === "succeeded";
}

export function isSceneFailed(scene: SceneJobStatus): boolean {
  return FAILED_STATES.has(scene.status.generationState);
}

/** Map a durable `content` row to a scene status. Returns null when the row
 *  carries no generation envelope (a pre-V3 row), so callers can fall back
 *  rather than invent a state. */
export function sceneStatusFromRow(
  sceneId: string,
  sceneNumber: number,
  row: DurableJobRow & { id?: unknown; video_urls?: unknown; video_url?: unknown },
): SceneJobStatus | null {
  const status = deriveStatusFromContentRow(row);
  if (!status) return null;

  let assetUrl: string | null = null;
  const raw = row.video_urls;
  if (Array.isArray(raw)) {
    assetUrl = raw.find((u): u is string => typeof u === "string" && u.startsWith("http")) ?? null;
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      assetUrl = Array.isArray(parsed)
        ? parsed.find((u: unknown): u is string => typeof u === "string" && u.startsWith("http")) ?? null
        : raw.startsWith("http") ? raw : null;
    } catch {
      assetUrl = raw.startsWith("http") ? raw : null;
    }
  }
  if (!assetUrl && typeof row.video_url === "string" && row.video_url.startsWith("http")) {
    assetUrl = row.video_url;
  }

  return {
    sceneId,
    sceneNumber,
    ...(typeof row.id === "string" ? { contentId: row.id } : {}),
    status,
    assetUrl,
  };
}

function pluralScenes(count: number): string {
  return count === 1 ? "scene" : "scenes";
}

function listSceneNumbers(numbers: number[]): string {
  if (numbers.length === 1) return `scene ${numbers[0]}`;
  const head = numbers.slice(0, -1).join(", ");
  return `scenes ${head} and ${numbers[numbers.length - 1]}`;
}

/**
 * Derive the sequence aggregate from per-scene states.
 *
 * Honesty rules, mirroring the Image Studio billing stance:
 *  - A failed scene NEVER reports as ready, and a refund is never presented as
 *    success.
 *  - Refunded scenes are counted and named, so "failed" and "you got your
 *    credits back" are two separate facts the user can see.
 *  - Successful scenes are never offered for retry, so a retry can never
 *    regenerate (and re-charge) work that already landed.
 */
export function summarizeSequence(scenes: readonly SceneJobStatus[]): SequenceAggregate {
  const total = scenes.length;
  const ready = scenes.filter(isSceneReady).length;
  const failedScenes = scenes.filter(isSceneFailed);
  const failed = failedScenes.length;
  const active = scenes.filter(isSceneActive).length;
  const notStarted = scenes.filter((s) => s.status.generationState === "idle").length;
  const refunded = failedScenes.filter((s) => REFUNDED_BILLING.has(s.status.billingState)).length;
  const retryableSceneNumbers = failedScenes.map((s) => s.sceneNumber).sort((a, b) => a - b);

  let state: SequenceState;
  if (total === 0) state = "idle";
  // Anything in flight dominates: the sequence is running.
  else if (active > 0) state = "running";
  // Nothing running: failures decide whether this is partial or total failure.
  else if (failed > 0 && ready > 0) state = "partial_success";
  else if (failed > 0) state = "failed";
  else if (ready === total) state = "succeeded";
  // Nothing running, nothing failed, some (or none) finished — idle again, but
  // the message below still reports how far the sequence got. Claiming
  // "generating" here would be untrue.
  else state = "idle";

  let message: string;
  switch (state) {
    case "idle":
      if (total === 0) message = "No scenes yet.";
      else if (ready > 0) message = `${ready} of ${total} ${pluralScenes(total)} ready. Generate the rest when you are.`;
      else message = `${total} ${pluralScenes(total)} ready to generate.`;
      break;
    case "running":
      message = `Generating — ${ready} of ${total} ${pluralScenes(total)} ready.`;
      break;
    case "succeeded":
      message = `All ${total} ${pluralScenes(total)} ready.`;
      break;
    case "failed":
      message =
        refunded > 0
          ? `${failed} ${pluralScenes(failed)} failed (credits refunded). Retry ${listSceneNumbers(retryableSceneNumbers)}.`
          : `${failed} ${pluralScenes(failed)} failed. Retry ${listSceneNumbers(retryableSceneNumbers)}.`;
      break;
    case "partial_success":
    default:
      message =
        `${ready} of ${total} ${pluralScenes(total)} ready · ` +
        `${listSceneNumbers(retryableSceneNumbers)} failed` +
        (refunded > 0 ? ` (${refunded === failed ? "credits refunded" : `${refunded} refunded`})` : "") +
        `. Retry ${failed === 1 ? "it" : "them"} without touching the finished ${pluralScenes(ready)}.`;
      break;
  }

  return {
    state,
    total,
    ready,
    failed,
    active,
    notStarted,
    refunded,
    retryableSceneNumbers,
    message,
    isActive: active > 0,
    hasProgress: active > 0 || ready > 0 || failed > 0,
  };
}

/** Warning shown when leaving the page mid-sequence; null when it is safe. */
export function sequenceLeaveWarning(aggregate: SequenceAggregate): string | null {
  return aggregate.isActive
    ? "Scenes are still generating. They keep running, but you will not see progress until you return."
    : null;
}
