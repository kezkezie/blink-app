/**
 * Magic outline (Kezie, 2026-10-20: "tracing through edges as you move the pen tool to define a
 * perimeter"): the live-wire / intelligent scissors behind Photoshop's magnetic lasso. Each pixel
 * costs less the stronger the edge on it; the outline from the last fixed point to the pointer is
 * the cheapest path between them, so it hugs the edges. Pure: runs in the browser on a working copy
 * of the photo (about 1024 px), never on a server, and costs nothing.
 */

/** Per-pixel cost (0.02 on the strongest edges, 1 on flat colour), from RGBA pixels. */
export function edgeCost(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  // A light blur first: JPEG noise and texture shouldn't read as edges.
  const b = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += g[yy * w + xx]; n++;
        }
      }
      b[y * w + x] = s / n;
    }
  }
  const mag = new Float32Array(w * h);
  let max = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = b[i - w + 1] + 2 * b[i + 1] + b[i + w + 1] - b[i - w - 1] - 2 * b[i - 1] - b[i + w - 1];
      const gy = b[i + w - 1] + 2 * b[i + w] + b[i + w + 1] - b[i - w - 1] - 2 * b[i - w] - b[i - w + 1];
      const m = Math.sqrt(gx * gx + gy * gy);
      mag[i] = m;
      if (m > max) max = m;
    }
  }
  const cost = new Float32Array(w * h);
  // Square root: a soft edge still pulls, a hard one pulls hardest.
  for (let i = 0; i < w * h; i++) cost[i] = 0.02 + 0.98 * (1 - (max > 0 ? Math.sqrt(mag[i] / max) : 0));
  return cost;
}

/** The strongest edge within r pixels of (x, y): where a click starts the outline. */
export function snapToEdge(cost: Float32Array, w: number, h: number, x: number, y: number, r = 4): [number, number] {
  let best: [number, number] = [clampInt(x, 0, w - 1), clampInt(y, 0, h - 1)];
  let bestCost = cost[best[1] * w + best[0]];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || dx * dx + dy * dy > r * r) continue;
      const c = cost[yy * w + xx] + 0.01 * Math.hypot(dx, dy);
      if (c < bestCost) { bestCost = c; best = [xx, yy]; }
    }
  }
  return best;
}

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
const SQRT2 = Math.SQRT2;

/**
 * Cheapest paths from one seed point, within a square window around it (radius pixels each way):
 * set the seed once (one Dijkstra pass, a few tens of ms), then any pointer position inside the
 * window traces back instantly.
 */
export class LiveWire {
  private x0 = 0; private y0 = 0; private ww = 0; private wh = 0;
  private prev = new Int32Array(0);
  private seedAt: [number, number] = [0, 0];
  constructor(private cost: Float32Array, readonly w: number, readonly h: number) {}

  get seed() { return this.seedAt; }

  /** Whether (x, y) is inside the current window (with a margin). */
  covers(x: number, y: number, margin = 2) {
    return x >= this.x0 + margin && y >= this.y0 + margin && x < this.x0 + this.ww - margin && y < this.y0 + this.wh - margin;
  }

  setSeed(sx: number, sy: number, radius = 160) {
    const x = clampInt(sx, 0, this.w - 1), y = clampInt(sy, 0, this.h - 1);
    this.seedAt = [x, y];
    this.x0 = Math.max(0, x - radius); this.y0 = Math.max(0, y - radius);
    this.ww = Math.min(this.w, x + radius + 1) - this.x0; this.wh = Math.min(this.h, y + radius + 1) - this.y0;
    const n = this.ww * this.wh;
    const dist = new Float32Array(n).fill(Infinity);
    const done = new Uint8Array(n);
    this.prev = new Int32Array(n).fill(-1);
    const heap = new Heap(n);
    const s = (y - this.y0) * this.ww + (x - this.x0);
    dist[s] = 0; heap.push(s, 0);
    const ww = this.ww, wh = this.wh, x0 = this.x0, y0 = this.y0, W = this.w, cost = this.cost;
    while (heap.size) {
      const i = heap.pop();
      if (done[i]) continue;
      done[i] = 1;
      const ix = i % ww, iy = (i - ix) / ww;
      const d = dist[i];
      for (let dy = -1; dy <= 1; dy++) {
        const ny = iy + dy;
        if (ny < 0 || ny >= wh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = ix + dx;
          if (nx < 0 || nx >= ww) continue;
          const j = ny * ww + nx;
          if (done[j]) continue;
          const nd = d + cost[(ny + y0) * W + (nx + x0)] * (dx && dy ? SQRT2 : 1);
          if (nd < dist[j]) { dist[j] = nd; this.prev[j] = i; heap.push(j, nd); }
        }
      }
    }
  }

  /** The cheapest path from the seed to (x, y) (clamped into the window), as [x, y] pairs from the seed. */
  pathTo(tx: number, ty: number): Array<[number, number]> {
    const x = clampInt(tx, this.x0, this.x0 + this.ww - 1), y = clampInt(ty, this.y0, this.y0 + this.wh - 1);
    const out: Array<[number, number]> = [];
    let i = (y - this.y0) * this.ww + (x - this.x0);
    let guard = this.ww * this.wh;
    while (i >= 0 && guard-- > 0) {
      const ix = i % this.ww;
      out.push([ix + this.x0, (i - ix) / this.ww + this.y0]);
      i = this.prev[i];
    }
    return out.reverse();
  }
}

/** A binary min-heap of indices by key (lazy deletion: an index may be in it more than once). */
class Heap {
  private ids: Int32Array; private keys: Float32Array; size = 0;
  constructor(capacity: number) { this.ids = new Int32Array(Math.max(16, capacity)); this.keys = new Float32Array(Math.max(16, capacity)); }
  push(id: number, key: number) {
    if (this.size === this.ids.length) {
      const ids = new Int32Array(this.ids.length * 2); ids.set(this.ids); this.ids = ids;
      const keys = new Float32Array(this.keys.length * 2); keys.set(this.keys); this.keys = keys;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.ids[i] = this.ids[p]; this.keys[i] = this.keys[p]; i = p;
    }
    this.ids[i] = id; this.keys[i] = key;
  }
  pop(): number {
    const top = this.ids[0];
    const id = this.ids[--this.size], key = this.keys[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= key) break;
      this.ids[i] = this.ids[c]; this.keys[i] = this.keys[c]; i = c;
    }
    this.ids[i] = id; this.keys[i] = key;
    return top;
  }
}

/**
 * Fewer points, same shape (Ramer–Douglas–Peucker, tolerance in pixels). A closed loop (first point
 * = last) is split at its farthest point first: measured against a zero-length line, everything
 * would look straight and the loop would collapse to a dot.
 */
export function simplify(points: Array<[number, number]>, tolerance = 0.8): Array<[number, number]> {
  if (points.length < 3) return points.slice();
  const [fx, fy] = points[0], [lx, ly] = points[points.length - 1];
  if (Math.hypot(fx - lx, fy - ly) < 1e-6) {
    let far = 1, farD = -1;
    for (let i = 1; i < points.length - 1; i++) { const d = Math.hypot(points[i][0] - fx, points[i][1] - fy); if (d > farD) { farD = d; far = i; } }
    if (farD <= tolerance) return [points[0]];
    return [...simplify(points.slice(0, far + 1), tolerance), ...simplify(points.slice(far), tolerance).slice(1)];
  }
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = points[a], [bx, by] = points[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, farD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > farD) { farD = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Length of a path in pixels. */
export const pathLength = (p: Array<[number, number]>) => p.reduce((n, q, i) => (i ? n + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);

/**
 * Where to fix the next point as the pointer moves on (Photoshop drops these by itself): once the
 * live path is longer than `every` pixels, the point `every * 0.6` along it, else null.
 */
export function fastenAt(path: Array<[number, number]>, every = 48): number | null {
  if (path.length < 3 || pathLength(path) < every) return null;
  let n = 0;
  for (let i = 1; i < path.length; i++) {
    n += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    if (n >= every * 0.6) return i;
  }
  return null;
}
