import { describe, expect, it } from "vitest";
import { LiveWire, edgeCost, fastenAt, pathLength, simplify, snapToEdge } from "@/lib/editor/livewire";
import { blendInto, composeLabels, dilate, packLabels, unpackLabels, validRegionMap } from "@/lib/editor/regions";

/** Magic outline and the AI eraser's map (2026-10-20). */

/** A w×h RGBA picture: a dark square on a light background. */
function square(w: number, h: number, [x0, y0, x1, y1]: [number, number, number, number]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
    const i = (y * w + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = inside ? 30 : 220; px[i + 3] = 255;
  }
  return px;
}

describe("magic outline", () => {
  const w = 120, h = 100;
  const cost = edgeCost(square(w, h, [30, 20, 90, 80]), w, h);

  it("costs least on the edge", () => {
    expect(cost[50 * w + 30]).toBeLessThan(0.2); // on the left edge
    expect(cost[50 * w + 60]).toBeGreaterThan(0.9); // flat inside
    expect(cost[5 * w + 5]).toBeGreaterThan(0.9); // flat outside
  });

  it("snaps a click to the nearby edge", () => {
    const [x] = snapToEdge(cost, w, h, 33, 50, 4);
    expect(Math.abs(x - 30)).toBeLessThanOrEqual(1);
  });

  it("follows the square's edge around a corner instead of cutting across", () => {
    const lw = new LiveWire(cost, w, h);
    lw.setSeed(30, 50); // left edge, middle
    const path = lw.pathTo(60, 20); // top edge, middle
    expect(path[0]).toEqual([30, 50]);
    expect(path[path.length - 1]).toEqual([60, 20]);
    // Every point sits on (or right next to) the square's border: the corner, not the diagonal.
    const offEdge = path.filter(([x, y]) => Math.min(Math.abs(x - 30), Math.abs(x - 29), Math.abs(y - 20), Math.abs(y - 19)) > 1.5);
    expect(offEdge.length).toBeLessThanOrEqual(2);
    expect(pathLength(path)).toBeGreaterThan(55); // about 30 down + 30 across, not the 42 px diagonal
  });

  it("keeps the window and clamps a pointer outside it", () => {
    const lw = new LiveWire(cost, w, h);
    lw.setSeed(30, 50, 20);
    expect(lw.covers(45, 50)).toBe(true);
    expect(lw.covers(80, 50)).toBe(false);
    const p = lw.pathTo(500, 50);
    expect(p[p.length - 1][0]).toBe(50);
  });

  it("drops points as the path grows, and simplifies straight runs", () => {
    const line = Array.from({ length: 80 }, (_, i) => [i, 10] as [number, number]);
    expect(fastenAt(line.slice(0, 20), 48)).toBeNull();
    const at = fastenAt(line, 48)!;
    expect(at).toBeGreaterThan(25); expect(at).toBeLessThan(32);
    expect(simplify(line)).toEqual([[0, 10], [79, 10]]);
  });

  it("simplifies a closed loop to its corners, not to a dot", () => {
    const loop: Array<[number, number]> = [];
    for (let x = 0; x < 50; x++) loop.push([x, 0]);
    for (let y = 0; y < 30; y++) loop.push([50, y]);
    for (let x = 50; x > 0; x--) loop.push([x, 30]);
    for (let y = 30; y >= 0; y--) loop.push([0, y]);
    const s = simplify(loop);
    expect(s.length).toBeGreaterThanOrEqual(5);
    expect(s).toEqual(expect.arrayContaining([[50, 0], [50, 30], [0, 30]]));
    expect(s[0]).toEqual([0, 0]); expect(s[s.length - 1]).toEqual([0, 0]);
  });
});

describe("AI eraser map", () => {
  it("puts smaller things on top, so a click picks the most specific one", () => {
    const w = 10, h = 10;
    const big = new Uint8Array(100).fill(255); // the whole picture (a wall)
    const small = new Uint8Array(100); for (let y = 2; y < 5; y++) for (let x = 2; x < 5; x++) small[y * w + x] = 255; // a cup
    const empty = new Uint8Array(100);
    const map = composeLabels([small, big, empty], w, h);
    expect(map.labels[3 * w + 3]).toBe(2); // the cup (second largest = id 2)
    expect(map.labels[8 * w + 8]).toBe(1); // the wall
    expect(map.regions).toEqual([{ id: 1, area: 91, box: [0, 0, 10, 10] }, { id: 2, area: 9, box: [2, 2, 3, 3] }]);
  });

  it("packs and unpacks the labels", () => {
    const labels = new Uint8Array(64 * 48).map((_, i) => (i % 64 < 20 ? 3 : 0));
    const packed = packLabels(labels);
    expect(unpackLabels(packed, labels.length)).toEqual(labels);
    expect(unpackLabels(packed, 10)).toBeNull();
    expect(validRegionMap({ w: 64, h: 48, labels: packed })?.regions).toEqual([{ id: 3, area: 20 * 48, box: [0, 0, 20, 48] }]);
    expect(validRegionMap({ w: 64, h: 48, labels: "nope" })).toBeNull();
  });

  it("grows a mask so the soft edge goes too", () => {
    const w = 9, h = 9;
    const m = new Uint8Array(81); m[4 * w + 4] = 255;
    const d = dilate(m, w, h, 2);
    expect(d[4 * w + 6]).toBe(255); expect(d[4 * w + 7]).toBe(0);
    expect(d[2 * w + 4]).toBe(255); expect(d[1 * w + 4]).toBe(0);
  });

  it("shows the new picture only inside the mask", () => {
    const orig = new Uint8Array([10, 10, 10, 255, 10, 10, 10, 255]);
    const fresh = new Uint8Array([200, 200, 200, 255, 200, 200, 200, 255]);
    const out = blendInto(orig, fresh, new Uint8Array([0, 255]));
    expect(Array.from(out)).toEqual([10, 10, 10, 255, 200, 200, 200, 255]);
  });
});
