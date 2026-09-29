import { describe, expect, it } from "vitest";
import { isDeductionSuccessful } from "@/lib/credit-deduction";

describe("isDeductionSuccessful", () => {
  it("accepts the real success shape", () => {
    expect(isDeductionSuccessful({ success: true }, null)).toBe(true);
  });

  it("REJECTS the real failure shape (HTTP 200 with success:false)", () => {
    // This is the exact body the live function returns. `=== false` missed it.
    expect(isDeductionSuccessful({ success: false, error: "No client profile found for this ID." }, null)).toBe(false);
    expect(isDeductionSuccessful({ success: false, error: "Insufficient credits" }, null)).toBe(false);
  });

  it("rejects anything that is not an explicit success", () => {
    for (const bad of [null, undefined, false, 0, 1, "true", {}, { success: "true" }, { ok: true }, []]) {
      expect(isDeductionSuccessful(bad, null), JSON.stringify(bad)).toBe(false);
    }
  });

  it("a transport error is a failure even if data looks successful", () => {
    expect(isDeductionSuccessful({ success: true }, { message: "network" })).toBe(false);
  });

  it("still accepts a bare boolean true for compatibility", () => {
    expect(isDeductionSuccessful(true, null)).toBe(true);
  });
});
