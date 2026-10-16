import { describe, expect, it } from "vitest";
import { SHARE_DURATIONS, accessLabel, accessUntilFrom, endOfLocalDay, inviteLinkExpiry } from "@/lib/brand-sharing";

/** How long a share lasts (2026-10-16): presets, no end, a picked date. */
const NOW = Date.parse("2026-10-16T10:00:00Z");
const DAY = 86_400_000;

describe("share duration", () => {
  it("turns the owner's choice into an end time", () => {
    expect(accessUntilFrom({ days: 14 }, NOW)).toBe(new Date(NOW + 14 * DAY).toISOString());
    expect(accessUntilFrom({ days: 365 }, NOW)).toBe(new Date(NOW + 365 * DAY).toISOString());
    expect(accessUntilFrom({ until: "2026-12-31" }, NOW)).toBe("2026-12-31T23:59:59.000Z");
    expect(accessUntilFrom(null, NOW)).toBeNull();
    expect(accessUntilFrom(undefined, NOW)).toBeNull();
    expect(accessUntilFrom("none", NOW)).toBeNull();
    expect(accessUntilFrom({ at: "2026-12-31T22:59:59.000Z" }, NOW)).toBe("2026-12-31T22:59:59.000Z");
    expect(accessUntilFrom({ at: "2026-12-31T23:59:59+01:00" }, NOW)).toBe("2026-12-31T22:59:59.000Z");
    expect(accessUntilFrom({ at: "2020-01-01T00:00:00Z" }, NOW)).toBeUndefined();
    expect(accessUntilFrom({ at: "tomorrow" }, NOW)).toBeUndefined();
  });

  it("refuses the past, more than 5 years and junk", () => {
    expect(accessUntilFrom({ until: "2026-10-01" }, NOW)).toBeUndefined();
    expect(accessUntilFrom({ until: "2040-01-01" }, NOW)).toBeUndefined();
    expect(accessUntilFrom({ days: 0 }, NOW)).toBeUndefined();
    expect(accessUntilFrom({ days: 2.5 }, NOW)).toBeUndefined();
    expect(accessUntilFrom({ until: "next week" }, NOW)).toBeUndefined();
    expect(accessUntilFrom("forever", NOW)).toBeUndefined();
  });

  it("an invite link lasts 30 days, or until the access it gives ends", () => {
    expect(inviteLinkExpiry(null, NOW)).toBe(new Date(NOW + 30 * DAY).toISOString());
    expect(inviteLinkExpiry(new Date(NOW + 5 * DAY).toISOString(), NOW)).toBe(new Date(NOW + 5 * DAY).toISOString());
    expect(inviteLinkExpiry(new Date(NOW + 90 * DAY).toISOString(), NOW)).toBe(new Date(NOW + 30 * DAY).toISOString());
  });

  it("labels and presets", () => {
    expect(accessLabel(null)).toBe("no end");
    // Shown in the viewer's timezone, so a picked day reads back as that day.
    expect(accessLabel(endOfLocalDay("2026-12-31"))).toBe("until 31 Dec 2026");
    expect(SHARE_DURATIONS.map((d) => d.label)).toEqual(["14 days", "30 days", "90 days", "1 year", "No end"]);
  });
});
