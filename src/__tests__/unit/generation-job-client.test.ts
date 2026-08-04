import { describe, expect, it, vi } from "vitest";
import { mintIdempotencyKey, submitGenerationJob, submitVideoJob } from "@/lib/generation-job-client";

const BRAND = "22222222-2222-4222-8222-222222222222";
const JOB = "33333333-3333-4333-8333-333333333333";
const PARENT = "44444444-4444-4444-8444-444444444444";

const jsonResponse = (body: unknown, status = 201) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("mintIdempotencyKey", () => {
  it("produces a bounded key matching the server pattern", () => {
    const pattern = /^[A-Za-z0-9._:-]{8,128}$/;
    for (let i = 0; i < 50; i += 1) {
      const key = mintIdempotencyKey();
      expect(key).toMatch(pattern);
    }
    expect(mintIdempotencyKey()).not.toBe(mintIdempotencyKey());
  });
});

describe("submitGenerationJob", () => {
  it("sends only job-shaping inputs incl. the engine alias — no client/tenant/billing/price", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: JOB, generation_state: "queued", billing_state: "not_charged", retry_state: "none", attempt: 1, credit_cost: 8, idempotent: false }));
    const result = await submitGenerationJob({ brandId: BRAND, mode: "standard", imageEngine: "nb2", aspectRatio: "4:5", idempotencyKey: "studio-abc12345" }, fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ ok: true, contentId: JOB, jobId: JOB, idempotent: false, attempt: 1, creditCost: 8 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/image-jobs");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(["aspect_ratio", "brand_id", "idempotency_key", "image_engine", "mode"]);
    expect(body).toMatchObject({ brand_id: BRAND, mode: "standard", image_engine: "nb2", aspect_ratio: "4:5", idempotency_key: "studio-abc12345" });
    // The browser sends the engine ALIAS, never a numeric price or tenant/billing data.
    for (const forbidden of ["client_id", "clientId", "user_id", "billing", "credit_cost", "price", "service_role"]) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it("includes retry_of_content_id to preserve retry lineage", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: JOB, attempt: 2, idempotent: false }));
    await submitGenerationJob({ brandId: BRAND, mode: "standard", imageEngine: "nb2", idempotencyKey: "studio-retry123", retryOfContentId: PARENT }, fetchMock as unknown as typeof fetch);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.retry_of_content_id).toBe(PARENT);
  });

  it("reports the idempotent flag, attempt, and persisted cost from a repeated key", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: JOB, attempt: 2, credit_cost: 8, idempotent: true }, 200));
    const result = await submitGenerationJob({ brandId: BRAND, mode: "standard", imageEngine: "nb2", idempotencyKey: "studio-dup12345" }, fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, contentId: JOB, jobId: JOB, idempotent: true, attempt: 2, creditCost: 8 });
  });

  it("maps error statuses to sanitized codes", async () => {
    const cases: Array<[number, string]> = [[401, "unauthorized"], [404, "not_found"], [400, "invalid_request"], [500, "submit_failed"]];
    for (const [status, code] of cases) {
      const fetchMock = vi.fn(async () => new Response("nope", { status }));
      expect(await submitGenerationJob({ brandId: BRAND, mode: "standard", imageEngine: "nb2", idempotencyKey: "studio-err12345" }, fetchMock as unknown as typeof fetch)).toEqual({ ok: false, code });
    }
  });

  it("rejects a malformed success body and a thrown fetch", async () => {
    const bad = vi.fn(async () => jsonResponse({ nope: true }));
    expect(await submitGenerationJob({ brandId: BRAND, mode: "standard", imageEngine: "nb2", idempotencyKey: "studio-bad12345" }, bad as unknown as typeof fetch)).toEqual({ ok: false, code: "invalid_response" });
    const boom = vi.fn(async () => { throw new Error("network down"); });
    expect(await submitGenerationJob({ brandId: BRAND, mode: "standard", imageEngine: "nb2", idempotencyKey: "studio-boom1234" }, boom as unknown as typeof fetch)).toEqual({ ok: false, code: "submit_failed" });
  });
});

// ── V3: video job submission ────────────────────────────────────────────────
describe("submitVideoJob", () => {
  const SPEC = { schemaVersion: 1, sceneId: "s1", sceneNumber: 1, videoPrompt: "dolly in", castRefs: [], styleRefs: [] };
  const base = { brandId: "brand-1", idempotencyKey: "scene-abc123-def456", contentType: "sequence_clip" as const, sceneSpec: SPEC };

  function jsonResponse(body: unknown, status = 201) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  it("posts to the owned video-jobs endpoint with only job-shaping inputs", async () => {
    const doFetch = vi.fn().mockResolvedValue(jsonResponse({ id: "content-1", attempt: 1, idempotent: false }));
    const result = await submitVideoJob(base, doFetch as unknown as typeof fetch);

    expect(result).toEqual({ ok: true, contentId: "content-1", jobId: "content-1", idempotent: false, attempt: 1 });
    const [url, init] = doFetch.mock.calls[0];
    expect(url).toBe("/api/video-jobs");
    const sent = JSON.parse(String((init as RequestInit).body));
    expect(sent).toEqual({
      brand_id: "brand-1",
      idempotency_key: "scene-abc123-def456",
      content_type: "sequence_clip",
      scene_spec: SPEC,
    });
    // No tenant id, billing authority or price ever leaves the browser.
    expect(Object.keys(sent)).not.toContain("client_id");
    expect(Object.keys(sent)).not.toContain("credit_cost");
  });

  it("forwards a retry parent to preserve lineage", async () => {
    const doFetch = vi.fn().mockResolvedValue(jsonResponse({ id: "content-2", attempt: 2, idempotent: false }));
    const result = await submitVideoJob({ ...base, retryOfContentId: "parent-1" }, doFetch as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: true, attempt: 2 });
    expect(JSON.parse(String(doFetch.mock.calls[0][1].body)).retry_of_content_id).toBe("parent-1");
  });

  it("reports an idempotent replay without treating it as a new job", async () => {
    const doFetch = vi.fn().mockResolvedValue(jsonResponse({ id: "content-1", attempt: 1, idempotent: true }, 200));
    expect(await submitVideoJob(base, doFetch as unknown as typeof fetch)).toMatchObject({ ok: true, idempotent: true });
  });

  it("maps failures to stable codes", async () => {
    for (const [status, code] of [[401, "unauthorized"], [404, "not_found"], [400, "invalid_request"], [500, "submit_failed"]] as const) {
      const doFetch = vi.fn().mockResolvedValue(new Response("{}", { status }));
      expect(await submitVideoJob(base, doFetch as unknown as typeof fetch)).toEqual({ ok: false, code });
    }
  });

  it("returns submit_failed when the network throws", async () => {
    const doFetch = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await submitVideoJob(base, doFetch as unknown as typeof fetch)).toEqual({ ok: false, code: "submit_failed" });
  });
});
