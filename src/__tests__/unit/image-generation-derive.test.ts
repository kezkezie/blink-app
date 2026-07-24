import { describe, expect, it } from "vitest";
import {
  deriveStatusFromContentRow,
  imageGenerationReducer,
  initialImageGenerationStatus,
  type ImageGenerationStatus,
} from "@/lib/image-generation-state";

describe("imageGenerationReducer — authoritative sync event (Slice 5)", () => {
  it("replaces state directly with a durable snapshot, bypassing transition validation", () => {
    const durable: ImageGenerationStatus = {
      generationState: "generating", billingState: "charged", retryState: "none",
      message: null, errorCode: null, attempt: 1,
    };
    // From idle, "generating" is not a normally-allowed transition, but a durable
    // sync is authoritative and applies it directly (used for refresh restoration).
    expect(imageGenerationReducer(initialImageGenerationStatus, { type: "sync", status: durable })).toEqual(durable);
  });

  it("can sync a terminal snapshot over any prior local state", () => {
    const active: ImageGenerationStatus = { generationState: "saving", billingState: "charged", retryState: "none", message: null, errorCode: null, attempt: 1 };
    const terminal: ImageGenerationStatus = { generationState: "failed", billingState: "refunded", retryState: "retry_available", message: "AI Provider Failed.", errorCode: "safety_blocked", attempt: 2 };
    expect(imageGenerationReducer(active, { type: "sync", status: terminal })).toEqual(terminal);
  });
});

describe("deriveStatusFromContentRow (Slice 5 durable restore)", () => {
  it("returns null for a row that is not a generation job", () => {
    expect(deriveStatusFromContentRow({})).toBeNull();
    expect(deriveStatusFromContentRow({ generation_state: null })).toBeNull();
    expect(deriveStatusFromContentRow({ generation_state: "bogus" })).toBeNull();
    expect(deriveStatusFromContentRow({ generation_state: 3 })).toBeNull();
  });

  it("maps active states without a failure message", () => {
    for (const gs of ["preparing", "queued", "generating", "saving"] as const) {
      const s = deriveStatusFromContentRow({ generation_state: gs, generation_status_text: "Queued" });
      expect(s).not.toBeNull();
      expect(s!.generationState).toBe(gs);
      expect(s!.message).toBeNull(); // status text is not surfaced as message for non-terminal states
      expect(s!.errorCode).toBeNull();
    }
  });

  it("maps a succeeded job as charged with no error", () => {
    const s = deriveStatusFromContentRow({
      generation_state: "succeeded",
      billing_state: "charged",
      retry_state: "none",
      generation_attempt: 1,
    })!;
    expect(s.generationState).toBe("succeeded");
    expect(s.billingState).toBe("charged");
    expect(s.message).toBeNull();
    expect(s.errorCode).toBeNull();
  });

  it("maps a failed+refunded job, surfacing message and error code", () => {
    const s = deriveStatusFromContentRow({
      generation_state: "failed",
      billing_state: "refunded",
      retry_state: "retry_available",
      generation_status_text: "AI Provider Failed. Your credits have been automatically refunded.",
      generation_error_code: "safety_blocked",
      generation_attempt: 2,
    })!;
    expect(s.generationState).toBe("failed");
    expect(s.billingState).toBe("refunded");
    expect(s.retryState).toBe("retry_available");
    expect(s.message).toContain("AI Provider Failed");
    expect(s.errorCode).toBe("safety_blocked");
    expect(s.attempt).toBe(2);
  });

  it("defaults a timed_out job's error code to 'timeout'", () => {
    const s = deriveStatusFromContentRow({
      generation_state: "timed_out",
      billing_state: "refund_pending",
      generation_status_text: "Taking longer than expected.",
    })!;
    expect(s.errorCode).toBe("timeout");
    expect(s.message).toContain("longer than expected");
    expect(s.billingState).toBe("refund_pending");
  });

  it("reflects a retrying job", () => {
    const s = deriveStatusFromContentRow({ generation_state: "generating", retry_state: "retrying" })!;
    expect(s.retryState).toBe("retrying");
  });

  it("falls back safely on invalid billing/retry/attempt values", () => {
    const s = deriveStatusFromContentRow({
      generation_state: "queued",
      billing_state: "weird",
      retry_state: "weird",
      generation_attempt: 0,
    })!;
    expect(s.billingState).toBe("not_charged");
    expect(s.retryState).toBe("none");
    expect(s.attempt).toBe(1);
  });
});
