import { describe, expect, it, vi } from "vitest";
import { mintIdempotencyKey, submitGenerationJob } from "@/lib/generation-job-client";

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
  it("sends only job-shaping inputs — no client/tenant/billing/credentials", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: JOB, generation_state: "queued", billing_state: "not_charged", retry_state: "none", attempt: 1, idempotent: false }));
    const result = await submitGenerationJob({ brandId: BRAND, mode: "standard", aspectRatio: "4:5", idempotencyKey: "studio-abc12345" }, fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ ok: true, contentId: JOB, jobId: JOB, idempotent: false, attempt: 1 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/image-jobs");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(["aspect_ratio", "brand_id", "idempotency_key", "mode"]);
    expect(body).toMatchObject({ brand_id: BRAND, mode: "standard", aspect_ratio: "4:5", idempotency_key: "studio-abc12345" });
    // Explicitly NOT present:
    for (const forbidden of ["client_id", "clientId", "user_id", "billing", "credit_cost", "service_role"]) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it("includes retry_of_content_id to preserve retry lineage", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: JOB, attempt: 2, idempotent: false }));
    await submitGenerationJob({ brandId: BRAND, mode: "standard", idempotencyKey: "studio-retry123", retryOfContentId: PARENT }, fetchMock as unknown as typeof fetch);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.retry_of_content_id).toBe(PARENT);
  });

  it("reports the idempotent flag and attempt from a repeated key", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: JOB, attempt: 2, idempotent: true }, 200));
    const result = await submitGenerationJob({ brandId: BRAND, mode: "standard", idempotencyKey: "studio-dup12345" }, fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, contentId: JOB, jobId: JOB, idempotent: true, attempt: 2 });
  });

  it("maps error statuses to sanitized codes", async () => {
    const cases: Array<[number, string]> = [[401, "unauthorized"], [404, "not_found"], [400, "invalid_request"], [500, "submit_failed"]];
    for (const [status, code] of cases) {
      const fetchMock = vi.fn(async () => new Response("nope", { status }));
      expect(await submitGenerationJob({ brandId: BRAND, mode: "standard", idempotencyKey: "studio-err12345" }, fetchMock as unknown as typeof fetch)).toEqual({ ok: false, code });
    }
  });

  it("rejects a malformed success body and a thrown fetch", async () => {
    const bad = vi.fn(async () => jsonResponse({ nope: true }));
    expect(await submitGenerationJob({ brandId: BRAND, mode: "standard", idempotencyKey: "studio-bad12345" }, bad as unknown as typeof fetch)).toEqual({ ok: false, code: "invalid_response" });
    const boom = vi.fn(async () => { throw new Error("network down"); });
    expect(await submitGenerationJob({ brandId: BRAND, mode: "standard", idempotencyKey: "studio-boom1234" }, boom as unknown as typeof fetch)).toEqual({ ok: false, code: "submit_failed" });
  });
});
