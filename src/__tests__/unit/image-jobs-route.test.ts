import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  bodySizeAllowed: vi.fn(),
  parseJob: vi.fn(),
  createPlaceholder: vi.fn(),
  loadOwnedJob: vi.fn(),
  providerFetch: vi.fn(),
}));

vi.mock("@/lib/execution-security", () => ({
  authenticateExecutionRequest: mocks.authenticate,
  isExecutionBodySizeAllowed: mocks.bodySizeAllowed,
}));
vi.mock("@/lib/image-job", () => ({
  parseImageJobRequest: mocks.parseJob,
  createImageJobPlaceholder: mocks.createPlaceholder,
  loadOwnedImageJob: mocks.loadOwnedJob,
  // real UUID shape check so the GET route's validation is exercised
  isValidContentId: (v: unknown) =>
    typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}));

import { GET, POST } from "@/app/api/image-jobs/route";

const BRAND_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/image-jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.providerFetch);
  mocks.authenticate.mockResolvedValue({ ok: true, value: "user-1" });
  mocks.bodySizeAllowed.mockReturnValue(true);
  mocks.parseJob.mockReturnValue({ brandId: BRAND_ID, idempotencyKey: "studio-abc123-def456", mode: "standard" });
  mocks.createPlaceholder.mockResolvedValue({
    ok: true,
    value: { id: "content-1", generationState: "queued", billingState: "not_charged", retryState: "none", attempt: 1, idempotent: false },
  });
  mocks.loadOwnedJob.mockResolvedValue({
    ok: true,
    value: {
      id: JOB_ID,
      image_urls: ["https://cdn.example/x.jpg"],
      generation_state: "succeeded",
      billing_state: "charged",
      retry_state: "none",
      generation_attempt: 1,
    },
  });
});

function getRequest(id: string | null) {
  const url = id === null ? "http://localhost/api/image-jobs" : `http://localhost/api/image-jobs?id=${id}`;
  return new NextRequest(url, { method: "GET" });
}

describe("POST /api/image-jobs", () => {
  it("returns 401 before parsing or creating when unauthenticated", async () => {
    mocks.authenticate.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const response = await POST(request({ brand_id: BRAND_ID }));
    expect(response.status).toBe(401);
    expect(mocks.parseJob).not.toHaveBeenCalled();
    expect(mocks.createPlaceholder).not.toHaveBeenCalled();
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("returns 400 for an oversized body without parsing", async () => {
    mocks.bodySizeAllowed.mockReturnValue(false);
    const response = await POST(request({ brand_id: BRAND_ID }));
    expect(response.status).toBe(400);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.parseJob).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed input before creating a placeholder", async () => {
    mocks.parseJob.mockReturnValue(null);
    const response = await POST(request({ brand_id: BRAND_ID, hidden: true }));
    expect(response.status).toBe(400);
    expect(mocks.createPlaceholder).not.toHaveBeenCalled();
  });

  it("returns 404 for a denied tenant scope without provider work", async () => {
    mocks.createPlaceholder.mockResolvedValue({ ok: false, status: 404, error: "Resource not found" });
    const response = await POST(request({ brand_id: BRAND_ID }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Resource not found" });
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("creates a placeholder and returns 201 with the durable state", async () => {
    const response = await POST(request({ brand_id: BRAND_ID, idempotency_key: "studio-abc123-def456", mode: "standard" }));
    expect(response.status).toBe(201);
    expect(mocks.createPlaceholder).toHaveBeenCalledWith("user-1", expect.objectContaining({ brandId: BRAND_ID }));
    expect(await response.json()).toEqual({
      id: "content-1",
      generation_state: "queued",
      billing_state: "not_charged",
      retry_state: "none",
      attempt: 1,
      idempotent: false,
    });
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("returns 200 when the idempotency key returns an existing placeholder", async () => {
    mocks.createPlaceholder.mockResolvedValue({
      ok: true,
      value: { id: "content-1", generationState: "queued", billingState: "not_charged", retryState: "retrying", attempt: 2, idempotent: true },
    });
    const response = await POST(request({ brand_id: BRAND_ID }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "content-1", idempotent: true, attempt: 2 });
  });

  it("returns a sanitized 500 when creation throws", async () => {
    mocks.createPlaceholder.mockRejectedValue(new Error("db connection string leak"));
    const response = await POST(request({ brand_id: BRAND_ID }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});

describe("GET /api/image-jobs (durable restore)", () => {
  it("returns 401 before any tenant read when unauthenticated", async () => {
    mocks.authenticate.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const response = await GET(getRequest(JOB_ID));
    expect(response.status).toBe(401);
    expect(mocks.loadOwnedJob).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing or malformed id", async () => {
    expect((await GET(getRequest(null))).status).toBe(400);
    expect((await GET(getRequest("not-a-uuid"))).status).toBe(400);
    expect(mocks.loadOwnedJob).not.toHaveBeenCalled();
  });

  it("returns 404 for a cross-tenant or missing job", async () => {
    mocks.loadOwnedJob.mockResolvedValue({ ok: false, status: 404, error: "Resource not found" });
    const response = await GET(getRequest(JOB_ID));
    expect(response.status).toBe(404);
    expect(mocks.loadOwnedJob).toHaveBeenCalledWith("user-1", JOB_ID);
  });

  it("returns 404 when the owned row carries no generation envelope", async () => {
    mocks.loadOwnedJob.mockResolvedValue({ ok: true, value: { id: JOB_ID, image_urls: [], generation_state: null } });
    const response = await GET(getRequest(JOB_ID));
    expect(response.status).toBe(404);
  });

  it("returns the derived durable status and image urls for an owned job", async () => {
    const response = await GET(getRequest(JOB_ID));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(JOB_ID);
    expect(body.image_urls).toEqual(["https://cdn.example/x.jpg"]);
    expect(body.status).toMatchObject({ generationState: "succeeded", billingState: "charged", retryState: "none" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("returns a sanitized 500 when the read throws", async () => {
    mocks.loadOwnedJob.mockRejectedValue(new Error("db url leak"));
    const response = await GET(getRequest(JOB_ID));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});
