import { describe, expect, it } from "vitest";
import {
  billingLabel,
  canRetry,
  canStartGeneration,
  describeStatus,
  imageGenerationReducer,
  initialImageGenerationStatus,
  isActive,
  isTerminal,
  isValidTransition,
  leavePageWarning,
  type GenerationState,
  type ImageGenerationEvent,
  type ImageGenerationStatus,
} from "@/lib/image-generation-state";

const reduce = (status: ImageGenerationStatus, ...events: ImageGenerationEvent[]) =>
  events.reduce(imageGenerationReducer, status);

const start = () => imageGenerationReducer(initialImageGenerationStatus, { type: "start" });

describe("image generation state — initial + start", () => {
  it("starts idle, not charged, no retry", () => {
    expect(initialImageGenerationStatus).toEqual({
      generationState: "idle",
      billingState: "not_charged",
      retryState: "none",
      message: null,
      errorCode: null,
      attempt: 0,
    });
  });

  it("start moves to preparing on attempt 1 with nothing charged", () => {
    const s = start();
    expect(s.generationState).toBe("preparing");
    expect(s.billingState).toBe("not_charged");
    expect(s.retryState).toBe("none");
    expect(s.attempt).toBe(1);
  });
});

describe("image generation state — happy path", () => {
  it("preparing → generating → saving → succeeded, charged, no retry", () => {
    const s = reduce(start(), { type: "generating" }, { type: "saving" }, { type: "succeeded" });
    expect(s.generationState).toBe("succeeded");
    expect(s.billingState).toBe("charged");
    expect(s.retryState).toBe("none");
    expect(isTerminal(s)).toBe(true);
    expect(isActive(s)).toBe(false);
    expect(canRetry(s)).toBe(false);
  });
});

describe("image generation state — invalid transitions are rejected", () => {
  it("rejects saving from idle and leaves state unchanged", () => {
    expect(isValidTransition("idle", "saving")).toBe(false);
    const s = imageGenerationReducer(initialImageGenerationStatus, { type: "saving" });
    expect(s).toBe(initialImageGenerationStatus);
  });

  it("rejects retry while a request is in flight (no duplicate run)", () => {
    const generating = reduce(start(), { type: "generating" });
    expect(isValidTransition("generating", "retry")).toBe(false);
    const s = imageGenerationReducer(generating, { type: "retry" });
    expect(s).toBe(generating);
  });

  it("rejects saving from a succeeded terminal state", () => {
    const done = reduce(start(), { type: "generating" }, { type: "succeeded" });
    expect(isValidTransition("succeeded", "saving")).toBe(false);
    expect(imageGenerationReducer(done, { type: "saving" })).toBe(done);
  });
});

describe("image generation state — failure and billing combinations", () => {
  it("failed with refunded billing (safety refusal) offers retry", () => {
    const s = reduce(start(), { type: "generating" }, {
      type: "failed",
      errorCode: "safety_blocked",
      message: "Content policy blocked this prompt.",
      billing: "refunded",
    });
    expect(s.generationState).toBe("failed");
    expect(s.billingState).toBe("refunded");
    expect(s.retryState).toBe("retry_available");
    expect(s.errorCode).toBe("safety_blocked");
    expect(canRetry(s)).toBe(true);
    expect(billingLabel(s)).toBe("Credits refunded");
  });

  it("failed while charged is representable and distinct from refunded", () => {
    const s = reduce(start(), { type: "generating" }, {
      type: "failed",
      errorCode: "downstream",
      billing: "charged",
    });
    expect(s.billingState).toBe("charged");
    expect(billingLabel(s)).toBe("Credits charged");
  });

  it("failed defaults to refund_pending when billing is unspecified", () => {
    const s = reduce(start(), { type: "generating" }, { type: "failed", errorCode: "generation_error" });
    expect(s.billingState).toBe("refund_pending");
    expect(billingLabel(s)).toBe("Refund in progress if you were charged");
  });

  it("failed with not_charged shows no-credits-used", () => {
    const s = reduce(start(), { type: "failed", errorCode: "no_images", billing: "not_charged" });
    expect(billingLabel(s)).toBe("No credits used");
  });
});

describe("image generation state — timeout", () => {
  it("timed_out is refund_pending, retryable, and carries a message", () => {
    const s = reduce(start(), { type: "generating" }, { type: "timed_out" });
    expect(s.generationState).toBe("timed_out");
    expect(s.billingState).toBe("refund_pending");
    expect(s.retryState).toBe("retry_available");
    expect(s.errorCode).toBe("timeout");
    expect(s.message).toMatch(/still be processing/i);
    expect(canRetry(s)).toBe(true);
  });

  it("keeps a custom timeout message when provided", () => {
    const s = reduce(start(), { type: "generating" }, { type: "timed_out", message: "Timed out after 300s." });
    expect(s.message).toBe("Timed out after 300s.");
  });
});

describe("image generation state — retry semantics", () => {
  it("retry from failed re-enters preparing, increments attempt, marks retrying", () => {
    const failed = reduce(start(), { type: "generating" }, { type: "failed", errorCode: "downstream" });
    const retried = imageGenerationReducer(failed, { type: "retry" });
    expect(retried.generationState).toBe("preparing");
    expect(retried.attempt).toBe(2);
    expect(retried.retryState).toBe("retrying");
    expect(retried.billingState).toBe("not_charged");
  });

  it("retry from timed_out increments the attempt lineage", () => {
    const timedOut = reduce(start(), { type: "generating" }, { type: "timed_out" });
    const retried = imageGenerationReducer(timedOut, { type: "retry" });
    expect(retried.attempt).toBe(2);
    expect(describeStatus(retried).title).toBe("Retrying your generation");
  });

  it("a retried generation that succeeds clears the retry state", () => {
    const failed = reduce(start(), { type: "generating" }, { type: "failed", errorCode: "x" });
    const s = reduce(failed, { type: "retry" }, { type: "generating" }, { type: "succeeded" });
    expect(s.retryState).toBe("none");
    expect(s.attempt).toBe(2);
  });

  it("start after success resets the attempt lineage to 1", () => {
    const done = reduce(start(), { type: "generating" }, { type: "succeeded" });
    const again = imageGenerationReducer(done, { type: "start" });
    expect(again.attempt).toBe(1);
    expect(again.retryState).toBe("none");
  });
});

describe("image generation state — derived selectors", () => {
  const active: GenerationState[] = ["preparing", "queued", "generating", "saving"];

  it("isActive is true only while a request is in flight", () => {
    for (const gs of active) {
      expect(isActive({ ...initialImageGenerationStatus, generationState: gs })).toBe(true);
    }
    for (const gs of ["idle", "succeeded", "failed", "timed_out"] as GenerationState[]) {
      expect(isActive({ ...initialImageGenerationStatus, generationState: gs })).toBe(false);
    }
  });

  it("canStartGeneration is blocked while active and allowed otherwise", () => {
    expect(canStartGeneration(reduce(start(), { type: "generating" }))).toBe(false);
    expect(canStartGeneration(initialImageGenerationStatus)).toBe(true);
    expect(canStartGeneration(reduce(start(), { type: "generating" }, { type: "failed", errorCode: "x" }))).toBe(true);
  });

  it("leavePageWarning is set only while active", () => {
    expect(leavePageWarning(reduce(start(), { type: "generating" }))).toMatch(/still generating/i);
    expect(leavePageWarning(initialImageGenerationStatus)).toBeNull();
    expect(leavePageWarning(reduce(start(), { type: "generating" }, { type: "succeeded" }))).toBeNull();
  });

  it("describeStatus returns a tone for every generation state", () => {
    const states: GenerationState[] = [
      "idle",
      "preparing",
      "queued",
      "generating",
      "saving",
      "succeeded",
      "failed",
      "timed_out",
    ];
    const tones = new Set(["info", "success", "error", "warning"]);
    for (const gs of states) {
      const d = describeStatus({ ...initialImageGenerationStatus, generationState: gs });
      expect(tones.has(d.tone)).toBe(true);
    }
    expect(describeStatus({ ...initialImageGenerationStatus, generationState: "succeeded" }).tone).toBe("success");
    expect(describeStatus({ ...initialImageGenerationStatus, generationState: "failed" }).tone).toBe("error");
    expect(describeStatus({ ...initialImageGenerationStatus, generationState: "timed_out" }).tone).toBe("warning");
  });
});

describe("image generation state — reset", () => {
  it("reset returns to the initial idle status from any state", () => {
    const messy = reduce(start(), { type: "generating" }, { type: "failed", errorCode: "x", billing: "charged" });
    expect(imageGenerationReducer(messy, { type: "reset" })).toEqual(initialImageGenerationStatus);
  });
});
