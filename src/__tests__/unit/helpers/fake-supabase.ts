/**
 * Minimal in-memory stand-in for the supabase-js query builder, for tests that
 * must check what the code DOES to data (which rows change) rather than which
 * mocks it calls in which order. Supports the subset BlinkSpot uses:
 * select (incl. count/head), insert, update, eq, maybeSingle, single, awaiting.
 */
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

let idSeq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++idSeq).padStart(12, "0")}`;

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: [string, unknown][] = [];
  private op: "select" | "insert" | "update" = "select";
  private payload: Row | Row[] | null = null;
  private countMode = false;
  private headOnly = false;
  private wantRows = false;
  private singleMode: "none" | "single" | "maybe" = "none";

  constructor(private tables: Tables, private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.op = "select";
    else this.wantRows = true;
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }
  insert(payload: Row | Row[]) { this.op = "insert"; this.payload = payload; return this; }
  update(payload: Row) { this.op = "update"; this.payload = payload; return this; }
  eq(col: string, val: unknown) { this.filters.push([col, val]); return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }

  private matches(r: Row) { return this.filters.every(([c, v]) => r[c] === v); }

  private run() {
    const rows = (this.tables[this.table] ??= []);
    let out: Row[] = [];
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      out = list.map((r) => ({ id: newId(), is_active: true, ...r }));
      rows.push(...out);
    } else if (this.op === "update") {
      out = rows.filter((r) => this.matches(r));
      for (const r of out) Object.assign(r, this.payload);
    } else {
      out = rows.filter((r) => this.matches(r));
    }
    const count = this.countMode ? out.length : null;
    if (this.headOnly) return { data: null, error: null, count };
    if (this.singleMode === "single") {
      return out.length === 1 ? { data: { ...out[0] }, error: null, count } : { data: null, error: { message: `expected 1 row, got ${out.length}` }, count };
    }
    if (this.singleMode === "maybe") {
      return out.length <= 1 ? { data: out[0] ? { ...out[0] } : null, error: null, count } : { data: null, error: { message: "multiple rows" }, count };
    }
    if (this.op !== "select" && !this.wantRows) return { data: null, error: null, count };
    return { data: out.map((r) => ({ ...r })), error: null, count };
  }

  then<T1 = { data: unknown; error: unknown }, T2 = never>(
    onFulfilled?: ((v: { data: unknown; error: unknown; count?: number | null }) => T1 | PromiseLike<T1>) | null,
    onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }
}

export function fakeSupabase(seed: Tables = {}) {
  const tables: Tables = JSON.parse(JSON.stringify(seed));
  return {
    tables,
    client: {
      from: (table: string) => new Query(tables, table),
      auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: `${id}@example.test` } }, error: null }) } },
    },
  };
}
