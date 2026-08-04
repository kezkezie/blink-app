import { describe, expect, it } from "vitest";
import type { ImageGenerationStatus } from "@/lib/image-generation-state";
import {
  isSceneActive,
  isSceneFailed,
  isSceneReady,
  sceneStatusFromRow,
  sequenceLeaveWarning,
  summarizeSequence,
  type SceneJobStatus,
} from "@/lib/video-sequence-state";

function status(over: Partial<ImageGenerationStatus> = {}): ImageGenerationStatus {
  return {
    generationState: "idle",
    billingState: "not_charged",
    retryState: "none",
    message: null,
    errorCode: null,
    attempt: 1,
    ...over,
  };
}

function scene(n: number, over: Partial<ImageGenerationStatus> = {}): SceneJobStatus {
  return { sceneId: `scene-${n}`, sceneNumber: n, status: status(over) };
}

describe("scene predicates", () => {
  it("classifies active, ready and failed states", () => {
    expect(isSceneActive(scene(1, { generationState: "generating" }))).toBe(true);
    expect(isSceneActive(scene(1, { generationState: "queued" }))).toBe(true);
    expect(isSceneReady(scene(1, { generationState: "succeeded" }))).toBe(true);
    expect(isSceneFailed(scene(1, { generationState: "failed" }))).toBe(true);
    expect(isSceneFailed(scene(1, { generationState: "timed_out" }))).toBe(true);
    expect(isSceneReady(scene(1, { generationState: "failed" }))).toBe(false);
  });
});

describe("summarizeSequence", () => {
  it("is idle with no scenes and with untouched scenes", () => {
    expect(summarizeSequence([]).state).toBe("idle");
    const untouched = summarizeSequence([scene(1), scene(2)]);
    expect(untouched.state).toBe("idle");
    expect(untouched.message).toContain("2 scenes ready to generate");
    expect(untouched.isActive).toBe(false);
  });

  it("does NOT claim 'generating' when nothing is in flight", () => {
    // 1 of 5 done, nothing running, nothing failed: honest partial progress.
    const agg = summarizeSequence([
      scene(1, { generationState: "succeeded" }),
      scene(2), scene(3), scene(4), scene(5),
    ]);
    expect(agg.state).toBe("idle");
    expect(agg.isActive).toBe(false);
    expect(agg.hasProgress).toBe(true);
    expect(agg.message).toContain("1 of 5 scenes ready");
    expect(agg.message).not.toMatch(/generating/i);
  });

  it("hides itself for an untouched storyboard (no progress to report)", () => {
    expect(summarizeSequence([scene(1), scene(2)]).hasProgress).toBe(false);
    expect(summarizeSequence([]).hasProgress).toBe(false);
  });

  it("reports running with a live progress count", () => {
    const agg = summarizeSequence([
      scene(1, { generationState: "succeeded" }),
      scene(2, { generationState: "generating" }),
      scene(3),
    ]);
    expect(agg.state).toBe("running");
    expect(agg.isActive).toBe(true);
    expect(agg.ready).toBe(1);
    expect(agg.message).toContain("1 of 3 scenes ready");
  });

  it("reports full success only when every scene succeeded", () => {
    const agg = summarizeSequence([
      scene(1, { generationState: "succeeded" }),
      scene(2, { generationState: "succeeded" }),
    ]);
    expect(agg.state).toBe("succeeded");
    expect(agg.message).toBe("All 2 scenes ready.");
    expect(agg.retryableSceneNumbers).toEqual([]);
  });

  it("surfaces PARTIAL success with the failed scene named and refund stated", () => {
    const agg = summarizeSequence([
      scene(1, { generationState: "succeeded" }),
      scene(2, { generationState: "failed", billingState: "refunded" }),
      scene(3, { generationState: "succeeded" }),
      scene(4, { generationState: "succeeded" }),
      scene(5, { generationState: "succeeded" }),
    ]);
    expect(agg.state).toBe("partial_success");
    expect(agg.ready).toBe(4);
    expect(agg.failed).toBe(1);
    expect(agg.refunded).toBe(1);
    expect(agg.retryableSceneNumbers).toEqual([2]);
    expect(agg.message).toContain("4 of 5 scenes ready");
    expect(agg.message).toContain("scene 2 failed");
    expect(agg.message).toContain("credits refunded");
  });

  it("never offers a succeeded scene for retry", () => {
    const agg = summarizeSequence([
      scene(1, { generationState: "succeeded" }),
      scene(2, { generationState: "failed" }),
      scene(3, { generationState: "timed_out" }),
    ]);
    expect(agg.retryableSceneNumbers).toEqual([2, 3]);
    expect(agg.retryableSceneNumbers).not.toContain(1);
    expect(agg.message).toContain("scenes 2 and 3");
  });

  it("reports total failure distinctly from partial success", () => {
    const agg = summarizeSequence([
      scene(1, { generationState: "failed", billingState: "refunded" }),
      scene(2, { generationState: "failed", billingState: "refunded" }),
    ]);
    expect(agg.state).toBe("failed");
    expect(agg.ready).toBe(0);
    expect(agg.message).toContain("credits refunded");
  });

  it("does not claim a refund that did not happen", () => {
    const agg = summarizeSequence([
      scene(1, { generationState: "succeeded" }),
      scene(2, { generationState: "failed", billingState: "charged" }),
    ]);
    expect(agg.refunded).toBe(0);
    expect(agg.message).not.toContain("refund");
  });

  it("counts a pending refund as refunded-for-display but keeps the scene failed", () => {
    const agg = summarizeSequence([
      scene(1, { generationState: "succeeded" }),
      scene(2, { generationState: "failed", billingState: "refund_pending" }),
    ]);
    expect(agg.refunded).toBe(1);
    expect(agg.ready).toBe(1);
    expect(agg.state).toBe("partial_success");
  });

  it("stays running while anything is in flight even if something already failed", () => {
    const agg = summarizeSequence([
      scene(1, { generationState: "failed" }),
      scene(2, { generationState: "generating" }),
    ]);
    expect(agg.state).toBe("running");
    expect(agg.isActive).toBe(true);
  });
});

describe("sceneStatusFromRow", () => {
  it("maps a durable row and extracts the finished video url from an array", () => {
    const mapped = sceneStatusFromRow("scene-1", 1, {
      id: "content-1",
      generation_state: "succeeded",
      billing_state: "charged",
      retry_state: "none",
      generation_attempt: 2,
      video_urls: ["https://cdn.example/clip.mp4"],
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.contentId).toBe("content-1");
    expect(mapped!.status.generationState).toBe("succeeded");
    expect(mapped!.status.attempt).toBe(2);
    expect(mapped!.assetUrl).toBe("https://cdn.example/clip.mp4");
  });

  it("parses a JSON-encoded video_urls string and falls back to video_url", () => {
    expect(
      sceneStatusFromRow("s", 1, { generation_state: "succeeded", video_urls: JSON.stringify(["https://cdn.example/a.mp4"]) })!.assetUrl,
    ).toBe("https://cdn.example/a.mp4");
    expect(
      sceneStatusFromRow("s", 1, { generation_state: "succeeded", video_url: "https://cdn.example/b.mp4" })!.assetUrl,
    ).toBe("https://cdn.example/b.mp4");
  });

  it("returns null for a row with no generation envelope (pre-V3 row)", () => {
    expect(sceneStatusFromRow("s", 1, { id: "legacy" })).toBeNull();
  });

  it("carries failure detail through for display", () => {
    const mapped = sceneStatusFromRow("s", 1, {
      generation_state: "failed",
      billing_state: "refunded",
      generation_status_text: "AI provider failed",
      generation_error_code: "provider_error",
    });
    expect(mapped!.status.message).toBe("AI provider failed");
    expect(mapped!.status.errorCode).toBe("provider_error");
    expect(mapped!.assetUrl).toBeNull();
  });
});

describe("sequenceLeaveWarning", () => {
  it("warns only while scenes are in flight", () => {
    expect(sequenceLeaveWarning(summarizeSequence([scene(1, { generationState: "generating" })]))).toBeTruthy();
    expect(sequenceLeaveWarning(summarizeSequence([scene(1, { generationState: "succeeded" })]))).toBeNull();
  });
});
