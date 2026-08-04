import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  bodySizeAllowed: vi.fn(),
  parse: vi.fn(),
  create: vi.fn(),
  loadOwned: vi.fn(),
  providerFetch: vi.fn(),
}));

vi.mock("@/lib/execution-security", () => ({
  authenticateExecutionRequest: mocks.authenticate,
  isExecutionBodySizeAllowed: mocks.bodySizeAllowed,
}));
// The real video-job module (pulled in via importOriginal for isValidContentId)
// imports the admin client at module scope; stub it so no real client is built.
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("@/lib/video-job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/video-job")>();
  return {
    ...actual,
    parseVideoJobRequest: mocks.parse,
    createVideoJobPlaceholder: mocks.create,
    loadOwnedVideoJob: mocks.loadOwned,
  };
});

import { GET, POST } from "@/app/api/video-jobs/route";
import { SCENE_SPEC_VERSION } from "@/lib/scene-spec";

const CONTENT_ID = "55555555-5555-4555-8555-555555555555";
const BRAND_ID = "22222222-2222-4222-8222-222222222222";

const SPEC = { schemaVersion: SCENE_SPEC_VERSION, sceneId: "s1", sceneNumber: 1, videoPrompt: "dolly in", castRefs: [], styleRefs: [] };

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/video-jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { brand_id: BRAND_ID, idempotency_key: "scene-abc123-def456", content_type: "sequence_clip", scene_spec: SPEC };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.providerFetch);
  mocks.authenticate.mockResolvedValue({ ok: true, value: "user-1" });
  mocks.bodySizeAllowed.mockReturnValue(true);
  mocks.parse.mockReturnValue({ brandId: BRAND_ID, idempotencyKey: "scene-abc123-def456", contentType: "sequence_clip", sceneSpec: SPEC });
  mocks.create.mockResolvedValue({
    ok: true,
    value: { id: CONTENT_ID, generationState: "queued", billingState: "not_charged", retryState: "none", attempt: 1, idempotent: false },
  });
  mocks.loadOwned.mockResolvedValue({
    ok: true,
    value: {
      id: CONTENT_ID,
      generation_state: "succeeded",
      billing_state: "charged",
      retry_state: "none",
      generation_attempt: 1,
      video_urls: ["https://cdn.example/clip.mp4"],
      creation_metadata: { scene_spec: SPEC },
    },
  });
});

describe("POST /api/video-jobs", () => {
  it("returns 401 before parsing or any tenant work", async () => {
    mocks.authenticate.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an oversize body before authentication work is wasted", async () => {
    mocks.bodySizeAllowed.mockReturnValue(false);
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid request without creating anything", async () => {
    mocks.parse.mockReturnValue(null);
    const res = await POST(postRequest({ nope: true }));
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a placeholder and returns 201 with the durable envelope", async () => {
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: CONTENT_ID,
      generation_state: "queued",
      billing_state: "not_charged",
      retry_state: "none",
      attempt: 1,
      idempotent: false,
    });
    expect(mocks.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ brandId: BRAND_ID }));
  });

  it("returns 200 (not 201) for an idempotent replay", async () => {
    mocks.create.mockResolvedValue({
      ok: true,
      value: { id: CONTENT_ID, generationState: "queued", billingState: "not_charged", retryState: "none", attempt: 1, idempotent: true },
    });
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect((await res.json()).idempotent).toBe(true);
  });

  it("propagates a denied tenant scope as 404", async () => {
    mocks.create.mockResolvedValue({ ok: false, status: 404, error: "Resource not found" });
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it("never performs provider, n8n or billing work", async () => {
    await POST(postRequest(VALID_BODY));
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/video-jobs", () => {
  it("returns 401 unauthenticated", async () => {
    mocks.authenticate.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const res = await GET(new NextRequest(`http://localhost/api/video-jobs?id=${CONTENT_ID}`));
    expect(res.status).toBe(401);
    expect(mocks.loadOwned).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed id", async () => {
    const res = await GET(new NextRequest("http://localhost/api/video-jobs?id=not-a-uuid"));
    expect(res.status).toBe(400);
    expect(mocks.loadOwned).not.toHaveBeenCalled();
  });

  it("restores the durable envelope, video urls and the persisted SceneSpec", async () => {
    const res = await GET(new NextRequest(`http://localhost/api/video-jobs?id=${CONTENT_ID}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toMatchObject({ generationState: "succeeded", billingState: "charged", attempt: 1 });
    expect(body.video_urls).toEqual(["https://cdn.example/clip.mp4"]);
    expect(body.scene_spec.videoPrompt).toBe("dolly in");
  });

  it("parses a JSON-encoded video_urls string from legacy rows", async () => {
    mocks.loadOwned.mockResolvedValue({
      ok: true,
      value: { id: CONTENT_ID, generation_state: "succeeded", video_urls: JSON.stringify(["https://cdn.example/a.mp4"]) },
    });
    const res = await GET(new NextRequest(`http://localhost/api/video-jobs?id=${CONTENT_ID}`));
    expect((await res.json()).video_urls).toEqual(["https://cdn.example/a.mp4"]);
  });

  it("returns 404 for a row without a generation envelope", async () => {
    mocks.loadOwned.mockResolvedValue({ ok: true, value: { id: CONTENT_ID } });
    const res = await GET(new NextRequest(`http://localhost/api/video-jobs?id=${CONTENT_ID}`));
    expect(res.status).toBe(404);
  });

  it("BRIDGE: reports succeeded when a playable asset exists but the envelope has not advanced", async () => {
    // Today's n8n writes video_urls without advancing generation_state. Without
    // the bridge a finished scene would sit at "queued" forever and the client
    // would never settle — a regression of current behaviour.
    mocks.loadOwned.mockResolvedValue({
      ok: true,
      value: { id: CONTENT_ID, generation_state: "queued", video_urls: ["https://cdn.example/clip.mp4"] },
    });
    const res = await GET(new NextRequest(`http://localhost/api/video-jobs?id=${CONTENT_ID}`));
    expect((await res.json()).status.generationState).toBe("succeeded");
  });

  it("BRIDGE: reports failed for a legacy failed row and surfaces its error message", async () => {
    mocks.loadOwned.mockResolvedValue({
      ok: true,
      value: { id: CONTENT_ID, generation_state: "generating", status: "failed", error_message: "AI provider failed" },
    });
    const body = await (await GET(new NextRequest(`http://localhost/api/video-jobs?id=${CONTENT_ID}`))).json();
    expect(body.status.generationState).toBe("failed");
    expect(body.status.message).toBe("AI provider failed");
    expect(body.status.errorCode).toBe("provider_failed");
  });

  it("BRIDGE: a DURABLE terminal state always wins over the inference", async () => {
    mocks.loadOwned.mockResolvedValue({
      ok: true,
      value: {
        id: CONTENT_ID,
        generation_state: "failed",
        billing_state: "refunded",
        generation_status_text: "provider refused",
        video_urls: ["https://cdn.example/stale.mp4"],
      },
    });
    const body = await (await GET(new NextRequest(`http://localhost/api/video-jobs?id=${CONTENT_ID}`))).json();
    expect(body.status.generationState).toBe("failed");
    expect(body.status.billingState).toBe("refunded");
    expect(body.status.message).toBe("provider refused");
  });

  it("BRIDGE: leaves an in-flight job alone when there is neither asset nor failure", async () => {
    mocks.loadOwned.mockResolvedValue({ ok: true, value: { id: CONTENT_ID, generation_state: "queued" } });
    const body = await (await GET(new NextRequest(`http://localhost/api/video-jobs?id=${CONTENT_ID}`))).json();
    expect(body.status.generationState).toBe("queued");
  });

  it("returns null scene_spec for a legacy row with no persisted spec", async () => {
    mocks.loadOwned.mockResolvedValue({
      ok: true,
      value: { id: CONTENT_ID, generation_state: "succeeded", creation_metadata: { operation: "standard" } },
    });
    const res = await GET(new NextRequest(`http://localhost/api/video-jobs?id=${CONTENT_ID}`));
    expect((await res.json()).scene_spec).toBeNull();
  });
});
