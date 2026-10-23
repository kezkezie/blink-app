import { describe, expect, it } from "vitest";
import { adminEmails, isAdminEmail, isTestEmail, loadLevel, nairobiDayStart, nairobiMonthStart, summarizePresence } from "@/lib/admin";

describe("owner admin dashboard (2026-10-23)", () => {
  it("only the owner (or ADMIN_EMAILS) may open it", () => {
    expect(isAdminEmail("keziefred@gmail.com", "")).toBe(true);
    expect(isAdminEmail("KezieFred@gmail.com ", "")).toBe(true);
    expect(isAdminEmail("someone@gmail.com", "")).toBe(false);
    expect(isAdminEmail(null, "")).toBe(false);
    expect(adminEmails("a@x.io, b@y.io")).toEqual(["a@x.io", "b@y.io"]);
    expect(isAdminEmail("keziefred@gmail.com", "a@x.io")).toBe(false);
  });
  it("test and QA accounts are kept out of the people counts", () => {
    for (const e of ["x@blinkspot-test.dev", "qa@blinkspot.local", "h@evil.com", null, ""]) expect(isTestEmail(e)).toBe(true);
    for (const e of ["kezie@gmail.com", "hi@youngtoon.com"]) expect(isTestEmail(e)).toBe(false);
  });
  it("says how busy it is from the capacity plan", () => {
    expect(loadLevel(0, 0)).toBe("quiet");
    expect(loadLevel(5, 2)).toBe("comfortable");
    expect(loadLevel(10, 12)).toBe("busy");
    expect(loadLevel(40, 0)).toBe("busy");
    expect(loadLevel(70, 0)).toBe("strained");
    expect(loadLevel(5, 25)).toBe("strained");
  });
  it("counts the day and month in Nairobi time", () => {
    const now = new Date("2026-10-23T22:30:00Z"); // 01:30 on the 24th in Nairobi
    expect(nairobiDayStart(now)).toBe("2026-10-23T21:00:00.000Z");
    expect(nairobiDayStart(now, 6)).toBe("2026-10-17T21:00:00.000Z");
    expect(nairobiMonthStart(now)).toBe("2026-09-30T21:00:00.000Z");
  });
  it("summarizes who is on the live channel", () => {
    const s = summarizePresence({ a: [{ u: "1", p: "create", v: true }], b: [{ u: "1", p: "library", v: false }], c: [{ u: "2", p: "create", v: false }] });
    expect(s).toEqual({ people: 2, looking: 1, tabs: 3, bySection: { create: 2, library: 1 } });
  });
});
