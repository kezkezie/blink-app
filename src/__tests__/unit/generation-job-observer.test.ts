import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchOwnedGenerationJob,
  observeGenerationJob,
  type GenerationJobSnapshot,
  type JobReadResult,
  type JobSubscriber,
} from "@/lib/generation-job-observer";
import type { GenerationState, ImageGenerationStatus } from "@/lib/image-generation-state";

const CID = "content-123";

const st = (generationState: GenerationState, over: Partial<ImageGenerationStatus> = {}): ImageGenerationStatus => ({
  generationState, billingState: "not_charged", retryState: "none", message: null, errorCode: null, attempt: 1, ...over,
});
const ok = (status: ImageGenerationStatus, imageUrls: string[] = []): JobReadResult => ({ ok: true, status, imageUrls });

const row = (generation_state: string, over: Record<string, unknown> = {}) => ({
  id: CID, image_urls: [], generation_state, billing_state: "not_charged", retry_state: "none",
  generation_status_text: null, generation_error_code: null, generation_attempt: 1, ...over,
});

// Scriptable fetcher: per-call step (result | "throw" | "hang"), else fallback.
function createFetcher(fallback: JobReadResult = ok(st("generating"))) {
  const signals: AbortSignal[] = [];
  const script: Array<JobReadResult | "throw" | "hang"> = [];
  const pending: Array<(r: JobReadResult) => void> = [];
  let current = fallback;
  const fetchJob = vi.fn((_id: string, signal: AbortSignal) => {
    signals.push(signal);
    const step = script.length ? script.shift()! : current;
    if (step === "throw") return Promise.reject(new Error("raw-supabase-network-boom"));
    if (step === "hang") return new Promise<JobReadResult>((res) => pending.push(res));
    return Promise.resolve(step);
  });
  return {
    fetchJob, signals,
    queue: (...steps: Array<JobReadResult | "throw" | "hang">) => script.push(...steps),
    setFallback: (r: JobReadResult) => { current = r; },
    resolveHung: (r: JobReadResult) => pending.shift()?.(r),
    calls: () => fetchJob.mock.calls.length,
    argAt: (i: number) => fetchJob.mock.calls[i],
  };
}

function createSubscriber() {
  let onRow: ((r: Record<string, unknown>) => void) | null = null;
  let subCount = 0;
  let unsubCount = 0;
  const subscribe: JobSubscriber = vi.fn((_id, cb) => {
    subCount += 1; onRow = cb;
    return () => { unsubCount += 1; onRow = null; };
  });
  return {
    subscribe,
    push: (r: Record<string, unknown>) => onRow?.(r),
    subCount: () => subCount,
    unsubCount: () => unsubCount,
    argAt: (i: number) => (subscribe as unknown as { mock: { calls: unknown[][] } }).mock.calls[i],
  };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("observeGenerationJob — initial restoration", () => {
  it("loads a valid active owned job and subscribes exactly once", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    const obs = observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 100_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    expect(s.subCount()).toBe(1);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ contentId: CID, observationTimedOut: false });
    expect(snaps[0].status.generationState).toBe("generating");
    obs.dispose();
  });

  it("loads a succeeded job and stops observation (no further polling)", async () => {
    const f = createFetcher(ok(st("succeeded", { billingState: "charged" }), ["u1"]));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    expect(snaps[0].status.generationState).toBe("succeeded");
    expect(snaps[0].imageUrls).toEqual(["u1"]);
    const after = f.calls();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.calls()).toBe(after); // polling stopped on terminal
  });

  it("loads a failed/refunded job accurately", async () => {
    const f = createFetcher(ok(st("failed", { billingState: "refunded", errorCode: "safety_blocked", message: "AI Provider Failed." })));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    expect(snaps[0].status).toMatchObject({ generationState: "failed", billingState: "refunded", errorCode: "safety_blocked" });
  });

  it("surfaces sanitized errors for 401/404/read failure without delivering a snapshot", async () => {
    for (const code of ["unauthorized", "not_found", "read_failed"] as const) {
      const f = createFetcher({ ok: false, code });
      const s = createSubscriber();
      const snaps: GenerationJobSnapshot[] = [];
      const errs: Array<{ code: string; message: string }> = [];
      observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), onError: (e) => errs.push(e), pollIntervalMs: 100_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
      await flush();
      expect(snaps).toHaveLength(0);
      expect(errs[0].code).toBe(code);
      expect(errs[0].message).not.toContain("raw"); // sanitized
    }
  });

  it("rejects an invalid mapped response safely (onError, no snapshot)", async () => {
    const f = createFetcher({ ok: false, code: "invalid_response" });
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    const errs: Array<{ code: string }> = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), onError: (e) => errs.push(e), pollIntervalMs: 100_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    expect(snaps).toHaveLength(0);
    expect(errs[0].code).toBe("invalid_response");
  });
});

describe("observeGenerationJob — Realtime", () => {
  it("delivers a matching row update mapped through the durable mapper", async () => {
    const f = createFetcher(ok(st("queued")));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 100_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    s.push(row("generating"));
    await flush();
    expect(snaps.at(-1)!.status.generationState).toBe("generating");
    expect(s.argAt(0)![0]).toBe(CID); // subscribed to the exact content id
  });

  it("ignores a non-matching content id", async () => {
    const f = createFetcher(ok(st("queued")));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 100_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    const before = snaps.length;
    s.push(row("succeeded", { id: "some-other-content" }));
    await flush();
    expect(snaps.length).toBe(before);
  });

  it("does not re-deliver a duplicate snapshot", async () => {
    const f = createFetcher(ok(st("queued")));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 100_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    s.push(row("generating"));
    await flush();
    const count = snaps.length;
    s.push(row("generating")); // identical
    await flush();
    expect(snaps.length).toBe(count);
  });

  it("does not let a stale initial GET overwrite a newer Realtime event", async () => {
    const f = createFetcher();
    f.queue("hang"); // the initial read hangs
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 100_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    s.push(row("succeeded", { billing_state: "charged" })); // newer Realtime arrives first
    await flush();
    f.resolveHung(ok(st("queued"))); // the older initial GET resolves late
    await flush();
    expect(snaps.at(-1)!.status.generationState).toBe("succeeded");
    expect(snaps.map((x) => x.status.generationState)).not.toContain("queued");
  });

  it("keeps polling active when Realtime is silent/disconnected", async () => {
    const f = createFetcher(ok(st("queued")));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    // No Realtime pushes at all; a later poll still advances the visible state.
    f.setFallback(ok(st("generating")));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(snaps.at(-1)!.status.generationState).toBe("generating");
  });

  it("unsubscribes exactly once even if disposed twice", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    const obs = observeGenerationJob({ contentId: CID, onSnapshot: () => {}, pollIntervalMs: 100_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    obs.dispose();
    obs.dispose();
    expect(s.unsubCount()).toBe(1);
  });
});

describe("observeGenerationJob — polling", () => {
  it("polls while active and stops on succeeded", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    await vi.advanceTimersByTimeAsync(1_000); // poll (still generating, deduped)
    await vi.advanceTimersByTimeAsync(1_000); // poll
    const callsBeforeTerminal = f.calls();
    expect(callsBeforeTerminal).toBeGreaterThanOrEqual(3); // initial + 2 polls
    f.setFallback(ok(st("succeeded", { billingState: "charged" })));
    await vi.advanceTimersByTimeAsync(1_000); // poll → succeeded, stops
    const afterTerminal = f.calls();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.calls()).toBe(afterTerminal); // no further polls after terminal
    expect(snaps.at(-1)!.status.generationState).toBe("succeeded");
  });

  it("stops polling on failed", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    observeGenerationJob({ contentId: CID, onSnapshot: () => {}, pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    f.setFallback(ok(st("failed", { billingState: "refunded" })));
    await vi.advanceTimersByTimeAsync(1_000);
    const after = f.calls();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.calls()).toBe(after);
  });

  it("retries safely after a transient polling failure without failing the job", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    const errs: Array<{ code: string }> = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), onError: (e) => errs.push(e), pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    f.queue("throw"); // one poll throws
    await vi.advanceTimersByTimeAsync(1_000);
    expect(errs.some((e) => e.code === "poll_failed")).toBe(true);
    // The generation is not marked failed by a transient poll error.
    expect(snaps.every((x) => x.status.generationState !== "failed")).toBe(true);
    // Next poll recovers.
    f.setFallback(ok(st("saving")));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(snaps.at(-1)!.status.generationState).toBe("saving");
  });

  it("never issues overlapping poll requests", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    observeGenerationJob({ contentId: CID, onSnapshot: () => {}, pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush(); // initial read resolves
    f.queue("hang"); // next poll hangs
    await vi.advanceTimersByTimeAsync(1_000); // poll #1 starts and hangs
    const during = f.calls();
    await vi.advanceTimersByTimeAsync(1_000); // interval fires but must skip (in-flight)
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.calls()).toBe(during); // no overlapping poll while one is in flight
  });

  it("aborts the in-flight request on disposal and ignores its late resolution", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    const obs = observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    f.queue("hang");
    await vi.advanceTimersByTimeAsync(1_000); // poll hangs
    const inFlightSignal = f.signals.at(-1)!;
    obs.dispose();
    expect(inFlightSignal.aborted).toBe(true);
    const count = snaps.length;
    f.resolveHung(ok(st("succeeded"))); // late resolution after disposal
    await flush();
    expect(snaps.length).toBe(count); // ignored
  });

  it("clears timers on disposal (no further polling)", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    const obs = observeGenerationJob({ contentId: CID, onSnapshot: () => {}, pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    obs.dispose();
    const after = f.calls();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.calls()).toBe(after);
  });

  it("delivers when the image count is unchanged but a URL value changes", async () => {
    // Same status + same count, different URL → must NOT be suppressed.
    const f = createFetcher(ok(st("saving"), ["a.jpg"]));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    expect(snaps.at(-1)!.imageUrls).toEqual(["a.jpg"]);
    const count = snaps.length;
    f.setFallback(ok(st("saving"), ["b.jpg"])); // same status + same count (1), different URL
    await vi.advanceTimersByTimeAsync(1_000);
    expect(snaps.length).toBe(count + 1);
    expect(snaps.at(-1)!.imageUrls).toEqual(["b.jpg"]);
  });

  it("delivers when the same URL set is reordered (image order is meaningful)", async () => {
    // Non-terminal state so the terminal latch doesn't short-circuit — this
    // isolates the signature's order-sensitivity. Reordered URLs are a distinct
    // ordered result and must be delivered (order preserved, never normalized).
    const f = createFetcher(ok(st("saving"), ["one.jpg", "two.jpg"]));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 100_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    s.push(row("saving", { image_urls: ["two.jpg", "one.jpg"] }));
    await flush();
    expect(snaps).toHaveLength(2);
    expect(snaps[0].imageUrls).toEqual(["one.jpg", "two.jpg"]);
    expect(snaps[1].imageUrls).toEqual(["two.jpg", "one.jpg"]);
  });

  it("still deduplicates an identical status with an identical ordered URL list", async () => {
    const f = createFetcher(ok(st("saving"), ["a.jpg", "b.jpg"]));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    const count = snaps.length;
    s.push(row("saving", { image_urls: ["a.jpg", "b.jpg"] })); // identical status + identical ordered URLs
    await flush();
    await vi.advanceTimersByTimeAsync(1_000); // poll reports the same again
    expect(snaps.length).toBe(count);
  });

  it("does not double-deliver when polling and Realtime report the same snapshot", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush(); // generating via initial read
    s.push(row("generating")); // realtime reports the same state
    await flush();
    await vi.advanceTimersByTimeAsync(1_000); // poll reports the same state again
    expect(snaps.filter((x) => x.status.generationState === "generating")).toHaveLength(1);
  });
});

describe("observeGenerationJob — timeout & late completion", () => {
  it("surfaces an honest timed-out presentation without claiming refund or failure", async () => {
    const f = createFetcher(ok(st("generating", { billingState: "charged" })));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 100_000, observationTimeoutMs: 5_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    await vi.advanceTimersByTimeAsync(5_000);
    const last = snaps.at(-1)!;
    expect(last.observationTimedOut).toBe(true);
    expect(last.status.generationState).toBe("timed_out");
    expect(last.status.errorCode).toBe("timeout");
    expect(last.status.billingState).toBe("charged"); // preserved — NOT refund_pending/refunded/failed
  });

  it("replaces the timeout presentation with a later durable succeeded update", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 100_000, observationTimeoutMs: 5_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(snaps.at(-1)!.observationTimedOut).toBe(true);
    s.push(row("succeeded", { billing_state: "charged", image_urls: ["late-url"] }));
    await flush();
    const last = snaps.at(-1)!;
    expect(last.status.generationState).toBe("succeeded");
    expect(last.observationTimedOut).toBe(false);
    expect(last.imageUrls).toEqual(["late-url"]);
  });

  it("replaces the timeout presentation with a later durable failed/refunded update", async () => {
    const f = createFetcher(ok(st("generating", { billingState: "charged" })));
    const s = createSubscriber();
    const snaps: GenerationJobSnapshot[] = [];
    observeGenerationJob({ contentId: CID, onSnapshot: (x) => snaps.push(x), pollIntervalMs: 100_000, observationTimeoutMs: 5_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    await vi.advanceTimersByTimeAsync(5_000);
    s.push(row("failed", { billing_state: "refunded", generation_status_text: "AI Provider Failed.", generation_error_code: "safety_blocked" }));
    await flush();
    const last = snaps.at(-1)!;
    expect(last.status).toMatchObject({ generationState: "failed", billingState: "refunded", errorCode: "safety_blocked" });
    expect(last.observationTimedOut).toBe(false);
  });
});

describe("observeGenerationJob — lifecycle & security", () => {
  it("uses exactly one subscription and one polling loop per observer", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    observeGenerationJob({ contentId: CID, onSnapshot: () => {}, pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    expect(s.subCount()).toBe(1);
    const initial = f.calls();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.calls()).toBe(initial + 1); // one poll per interval, not two loops
  });

  it("prevents old-job updates after switching job ids (dispose then observe new)", async () => {
    const fA = createFetcher(ok(st("generating")));
    const sA = createSubscriber();
    const snapsA: GenerationJobSnapshot[] = [];
    const a = observeGenerationJob({ contentId: CID, onSnapshot: (x) => snapsA.push(x), pollIntervalMs: 100_000, fetchJob: fA.fetchJob, subscribe: sA.subscribe });
    await flush();
    a.dispose();
    const countA = snapsA.length;
    sA.push(row("succeeded")); // late event for the old job → handler detached, ignored
    await flush();
    expect(snapsA.length).toBe(countA);
    expect(sA.unsubCount()).toBe(1);
  });

  it("keeps cleanup working even when a snapshot callback throws", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    const obs = observeGenerationJob({
      contentId: CID,
      onSnapshot: () => { throw new Error("callback boom"); },
      pollIntervalMs: 1_000, fetchJob: f.fetchJob, subscribe: s.subscribe,
    });
    await flush(); // delivery throws internally, must be swallowed
    expect(() => obs.dispose()).not.toThrow();
    expect(s.unsubCount()).toBe(1);
    const after = f.calls();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.calls()).toBe(after); // timers cleared despite the throwing callback
  });

  it("passes only the content id to fetch and subscribe (no tenant identifiers)", async () => {
    const f = createFetcher(ok(st("generating")));
    const s = createSubscriber();
    observeGenerationJob({ contentId: CID, onSnapshot: () => {}, pollIntervalMs: 100_000, fetchJob: f.fetchJob, subscribe: s.subscribe });
    await flush();
    expect(f.argAt(0)![0]).toBe(CID);
    expect(f.argAt(0)!.length).toBe(2); // (contentId, signal) only
    expect(s.argAt(0)![0]).toBe(CID);
  });
});

describe("fetchOwnedGenerationJob (default reader) — validation & mapping", () => {
  const goodStatus = st("generating");
  afterEach(() => vi.unstubAllGlobals());

  it("maps a valid owned response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: CID, status: goodStatus, image_urls: ["u"] }), { status: 200 })));
    const result = await fetchOwnedGenerationJob(CID, new AbortController().signal);
    expect(result).toEqual({ ok: true, status: goodStatus, imageUrls: ["u"] });
  });

  it("maps 401 → unauthorized and 404 → not_found without leaking a body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    expect(await fetchOwnedGenerationJob(CID, new AbortController().signal)).toEqual({ ok: false, code: "unauthorized" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect(await fetchOwnedGenerationJob(CID, new AbortController().signal)).toEqual({ ok: false, code: "not_found" });
  });

  it("rejects a mismatched id or malformed status as invalid_response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "other", status: goodStatus }), { status: 200 })));
    expect(await fetchOwnedGenerationJob(CID, new AbortController().signal)).toEqual({ ok: false, code: "invalid_response" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: CID, status: { generationState: "bogus" } }), { status: 200 })));
    expect(await fetchOwnedGenerationJob(CID, new AbortController().signal)).toEqual({ ok: false, code: "invalid_response" });
  });

  it("requests only the owned endpoint with the job id and no-store", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ id: CID, status: goodStatus, image_urls: [] }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    await fetchOwnedGenerationJob(CID, new AbortController().signal);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/image-jobs?id=${CID}`);
    expect((init.headers as Record<string, string>)["Cache-Control"]).toBe("no-store");
  });
});
