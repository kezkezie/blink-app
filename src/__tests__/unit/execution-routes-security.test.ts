import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  bodySizeAllowed: vi.fn(),
  parseImage: vi.fn(),
  authorizeImage: vi.fn(),
  parseSemantic: vi.fn(),
  authorizeSemantic: vi.fn(),
  authorizeGeneric: vi.fn(),
  providerFetch: vi.fn(),
  undiciFetch: vi.fn(),
}));

vi.mock("@/lib/execution-security", () => ({
  authenticateExecutionRequest: mocks.authenticate,
  isExecutionBodySizeAllowed: mocks.bodySizeAllowed,
  parseImageWorkflowRequest: mocks.parseImage,
  authorizeImageWorkflow: mocks.authorizeImage,
  parseSemanticImageRequest: mocks.parseSemantic,
  authorizeSemanticImage: mocks.authorizeSemantic,
  authorizeGenericExecutionPayload: mocks.authorizeGeneric,
}));

vi.mock("undici", () => ({
  Agent: class Agent {},
  fetch: mocks.undiciFetch,
}));

import { POST as workflowsPost } from "@/app/api/workflows/route";
import { POST as nanoBananaPost } from "@/app/api/video/nano-banana/route";

const BRAND_ID = "22222222-2222-4222-8222-222222222222";
const CONTENT_ID = "33333333-3333-4333-8333-333333333333";

function request(url: string, body: unknown) {
  return new NextRequest(url, {
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
  mocks.parseImage.mockReturnValue({ requestedBrandId: BRAND_ID, payload: {}, referenceUrls: [], inputUrls: [] });
  mocks.authorizeImage.mockResolvedValue({ ok: true, value: { client_id: "canonical-client", brand_id: BRAND_ID, prompt: "safe" } });
  mocks.parseSemantic.mockReturnValue({ operation: "xray_image", contentId: CONTENT_ID });
  mocks.authorizeSemantic.mockResolvedValue({
    ok: true,
    value: {
      mode: "scene_video_generator",
      video_mode: "xray_image",
      client_id: "canonical-client",
      post_id: CONTENT_ID,
      primary_image_url: "https://cdn.example/owned.png",
    },
  });
  mocks.authorizeGeneric.mockResolvedValue({ ok: true, value: { mode: "generator", client_id: "canonical-client" } });
  mocks.providerFetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
  mocks.undiciFetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
});

describe("workflow execution boundary", () => {
  it("returns 401 before parsing, tenant lookup, or provider work", async () => {
    mocks.authenticate.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const response = await workflowsPost(request(
      "http://localhost/api/workflows?path=blink-generate-images",
      { brand_id: BRAND_ID, prompt: "valid prompt" }
    ));
    expect(response.status).toBe(401);
    expect(mocks.parseImage).not.toHaveBeenCalled();
    expect(mocks.authorizeImage).not.toHaveBeenCalled();
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("rejects malformed image input before ownership or provider work", async () => {
    mocks.parseImage.mockReturnValue(null);
    const response = await workflowsPost(request(
      "http://localhost/api/workflows?path=blink-generate-images",
      { brand_id: BRAND_ID, prompt: "valid prompt", unknown: true }
    ));
    expect(response.status).toBe(400);
    expect(mocks.authorizeImage).not.toHaveBeenCalled();
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("returns 404 for denied tenant scope without provider work", async () => {
    mocks.authorizeImage.mockResolvedValue({ ok: false, status: 404, error: "Resource not found" });
    const response = await workflowsPost(request(
      "http://localhost/api/workflows?path=blink-generate-images",
      { brand_id: BRAND_ID, prompt: "valid prompt" }
    ));
    expect(response.status).toBe(404);
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("forwards only the server-authorized image payload", async () => {
    const response = await workflowsPost(request(
      "http://localhost/api/workflows?path=blink-generate-images",
      { client_id: "caller-client", brand_id: BRAND_ID, prompt: "caller prompt" }
    ));
    expect(response.status).toBe(200);
    expect(mocks.authorizeImage).toHaveBeenCalledWith("user-1", expect.any(Object));
    const forwarded = JSON.parse(String(mocks.providerFetch.mock.calls[0][1]?.body));
    expect(forwarded).toEqual({ client_id: "canonical-client", brand_id: BRAND_ID, prompt: "safe" });
  });

  it("rejects a durable request with an orphan job_id before authorization or provider work", async () => {
    // The real parser returns null for job_id without an ownership-verified post_id;
    // the route must short-circuit to 400 before any tenant lookup or provider call.
    mocks.parseImage.mockReturnValue(null);
    const response = await workflowsPost(request(
      "http://localhost/api/workflows?path=blink-generate-images",
      { brand_id: BRAND_ID, prompt: "valid prompt", job_id: CONTENT_ID, idempotency_key: "studio_abc-123.def", is_sync: false }
    ));
    expect(response.status).toBe(400);
    expect(mocks.authorizeImage).not.toHaveBeenCalled();
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("forwards the canonical authorized durable id, not the caller's job_id", async () => {
    // Authorization re-derives post_id/job_id from the owned content row; the route
    // must forward exactly that canonical payload downstream.
    mocks.authorizeImage.mockResolvedValue({
      ok: true,
      value: { client_id: "canonical-client", brand_id: BRAND_ID, prompt: "safe", post_id: CONTENT_ID, job_id: CONTENT_ID, idempotency_key: "studio_abc-123.def", is_sync: false },
    });
    const response = await workflowsPost(request(
      "http://localhost/api/workflows?path=blink-generate-images",
      { brand_id: BRAND_ID, prompt: "caller prompt", post_id: CONTENT_ID, job_id: "99999999-9999-4999-8999-999999999999", idempotency_key: "studio_abc-123.def", is_sync: false }
    ));
    expect(response.status).toBe(200);
    const forwarded = JSON.parse(String(mocks.providerFetch.mock.calls[0][1]?.body));
    expect(forwarded.post_id).toBe(CONTENT_ID);
    expect(forwarded.job_id).toBe(CONTENT_ID); // canonical authorized id, not the caller's 9999… claim
    expect(JSON.stringify(forwarded)).not.toContain("99999999-9999-4999-8999-999999999999");
  });

  it("sanitizes downstream workflow failures", async () => {
    mocks.providerFetch.mockResolvedValue(new Response("private provider detail", { status: 500 }));
    const response = await workflowsPost(request(
      "http://localhost/api/workflows?path=blink-generate-images",
      { brand_id: BRAND_ID, prompt: "valid prompt" }
    ));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Generation service request failed" });
  });
});

describe("semantic and shared nano-banana execution boundary", () => {
  it("requires authentication for every mode before provider work", async () => {
    mocks.authenticate.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const response = await nanoBananaPost(request(
      "http://localhost/api/video/nano-banana",
      { mode: "generator", prompt: "valid" }
    ));
    expect(response.status).toBe(401);
    expect(mocks.authorizeGeneric).not.toHaveBeenCalled();
    expect(mocks.undiciFetch).not.toHaveBeenCalled();
  });

  it("rejects malformed semantic input before ownership or provider work", async () => {
    mocks.parseSemantic.mockReturnValue(null);
    const response = await nanoBananaPost(request(
      "http://localhost/api/video/nano-banana",
      { mode: "scene_video_generator", video_mode: "xray_image", primary_image_url: "https://attacker.example/x.png" }
    ));
    expect(response.status).toBe(400);
    expect(mocks.authorizeSemantic).not.toHaveBeenCalled();
    expect(mocks.undiciFetch).not.toHaveBeenCalled();
  });

  it("forwards the server-owned semantic source and identifiers", async () => {
    const response = await nanoBananaPost(request(
      "http://localhost/api/video/nano-banana",
      { mode: "scene_video_generator", video_mode: "xray_image", content_id: CONTENT_ID }
    ));
    expect(response.status).toBe(200);
    expect(mocks.authorizeSemantic).toHaveBeenCalledWith("user-1", { operation: "xray_image", contentId: CONTENT_ID });
    const forwarded = JSON.parse(String(mocks.undiciFetch.mock.calls[0][1]?.body));
    expect(forwarded).toMatchObject({
      client_id: "canonical-client",
      post_id: CONTENT_ID,
      primary_image_url: "https://cdn.example/owned.png",
    });
  });

  it("returns safe errors without exposing the downstream body", async () => {
    mocks.undiciFetch.mockResolvedValue(new Response(JSON.stringify({ error: "private workflow detail" }), { status: 500 }));
    const response = await nanoBananaPost(request(
      "http://localhost/api/video/nano-banana",
      { mode: "scene_video_generator", video_mode: "xray_image", content_id: CONTENT_ID }
    ));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Generation service request failed" });
  });
});
