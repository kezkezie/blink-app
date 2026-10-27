import { describe, expect, it } from "vitest";
import { HOUR_PX, daysOf, keyOf, lanes, rangeLabel, shift, startOfWeek, timeFromY, topFor } from "@/components/studio/plan/calendar-time";

/** The calendar redesign's dates and positions (2026-10-27). */
describe("calendar time", () => {
  const tue = new Date(2026, 9, 27, 16, 20); // Tue 27 Oct 2026

  it("weeks start on Monday, and each view knows its days", () => {
    expect(keyOf(startOfWeek(tue))).toBe("2026-10-26");
    expect(keyOf(startOfWeek(new Date(2026, 10, 1)))).toBe("2026-10-26"); // a Sunday
    expect(daysOf("week", tue).map(keyOf)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(daysOf("list", tue)).toHaveLength(28);
    const month = daysOf("month", tue);
    expect(keyOf(month[0])).toBe("2026-09-28");
    expect(month.length % 7).toBe(0);
  });

  it("moves by a week, a month or four weeks, and labels the range", () => {
    expect(keyOf(shift("week", tue, 1))).toBe("2026-11-03");
    expect(keyOf(shift("month", tue, -1))).toBe("2026-09-01");
    expect(keyOf(shift("list", tue, 1))).toBe("2026-11-24");
    expect(rangeLabel("week", tue)).toBe("26 Oct – 1 Nov 2026");
    expect(rangeLabel("week", new Date(2026, 10, 10))).toBe("9 – 15 Nov 2026");
    expect(rangeLabel("month", tue)).toBe("October 2026");
  });

  it("puts a time at its height and reads a drop back to the quarter hour", () => {
    expect(topFor(new Date(2026, 9, 27, 10, 30))).toBe(10.5 * HOUR_PX);
    const at = timeFromY(tue, 14 * HOUR_PX + 0.3 * HOUR_PX);
    expect([at.getHours(), at.getMinutes(), at.getDate()]).toEqual([14, 15, 27]);
    expect(timeFromY(tue, 99_999).getHours()).toBe(23);
    expect(timeFromY(tue, -50).getHours()).toBe(0);
  });

  it("lays posts at the same time side by side, and lone ones full width", () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 27, h, m);
    const l = lanes([{ id: "a", at: at(10) }, { id: "b", at: at(10, 15) }, { id: "c", at: at(10, 30) }, { id: "d", at: at(14) }]);
    expect(l.get("a")).toEqual({ lane: 0, of: 3 });
    expect(l.get("b")).toEqual({ lane: 1, of: 3 });
    expect(l.get("c")).toEqual({ lane: 2, of: 3 });
    expect(l.get("d")).toEqual({ lane: 0, of: 1 });
    // Once the first is over, its lane is free again.
    const m = lanes([{ id: "a", at: at(9) }, { id: "b", at: at(9, 30) }, { id: "c", at: at(9, 50) }]);
    expect(m.get("c")).toEqual({ lane: 0, of: 2 });
  });
});
