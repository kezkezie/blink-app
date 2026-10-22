import { describe, expect, it } from "vitest";
import { BEST_IMAGE_CREDITS, LOW_CREDITS, creditLevel, creditWarning, whatItBuys } from "@/lib/credit-level";

describe("credit level (2026-10-22: the balance turns red before people run out)", () => {
  it("is ok, low under about one video, out under one Best image", () => {
    expect(creditLevel(null)).toBe("ok");
    expect(creditLevel(LOW_CREDITS)).toBe("ok");
    expect(creditLevel(LOW_CREDITS - 1)).toBe("low");
    expect(creditLevel(BEST_IMAGE_CREDITS)).toBe("low");
    expect(creditLevel(BEST_IMAGE_CREDITS - 1)).toBe("out");
    expect(creditLevel(0)).toBe("out");
  });
  it("says what the balance still buys", () => {
    expect(whatItBuys(40)).toBe("about 2 Best images");
    expect(whatItBuys(18)).toBe("about 1 Best image");
    expect(whatItBuys(5)).toBe("not enough for a Best image");
  });
  it("warns once per level, only on the way down", () => {
    expect(creditWarning(null, 40)).toBeNull(); // page load: the pill says it
    expect(creditWarning(240, 205)).toBeNull();
    expect(creditWarning(120, 84)).toMatchObject({ level: "low", text: expect.stringMatching(/^You have 84 credits left, about 4 Best images/) });
    expect(creditWarning(84, 66)).toBeNull(); // still low
    expect(creditWarning(84, 10)).toMatchObject({ level: "out" });
    expect(creditWarning(10, 300)).toBeNull(); // topped up
    expect(creditWarning(238, 0, true)?.text).toMatch(/^The brand owner has 0 credits left, not enough for a Best image/);
  });
});
