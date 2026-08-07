import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Real video-execution validation is exercised; auth, ownership canonicalization,
// the rate limiter, and the n8n provider fetch are mocked.
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  bodySizeAllowed: vi.fn(),
  authorizeGeneric: vi.fn(),
  parseImage: vi.fn(),
  authorizeImage: vi.fn(),
  parseSemantic: vi.fn(),
  authorizeSemantic: vi.fn(),
  consume: vi.fn(),
  providerFetch: vi.fn(),
  undiciFetch: vi.fn(),
  loadBrandContext: vi.fn(),
}));

vi.mock("@/lib/execution-security", () => ({
  authenticateExecutionRequest: mocks.authenticate,
  isExecutionBodySizeAllowed: mocks.bodySizeAllowed,
  authorizeGenericExecutionPayload: mocks.authorizeGeneric,
  parseImageWorkflowRequest: mocks.parseImage,
  authorizeImageWorkflow: mocks.authorizeImage,
  parseSemanticImageRequest: mocks.parseSemantic,
  authorizeSemanticImage: mocks.authorizeSemantic,
}));
vi.mock("@/lib/execution-rate-limit", () => ({ consumeExecutionRateLimit: mocks.consume }));
vi.mock("@/lib/brand-creative-context", () => ({
  loadOwnedBrandCreativeContext: mocks.loadBrandContext,
  toVideoWorkflowFields: (ctx: { name: string }) => ({
    brand_name: ctx.name,
    brand_info: "CANONICAL BRIEF",
    brand_context_version: 1,
  }),
}));
vi.mock("undici", () => ({ Agent: class Agent {}, fetch: mocks.undiciFetch }));

import { POST as workflowsPost } from "@/app/api/workflows/route";
import { POST as nanoBananaPost } from "@/app/api/video/nano-banana/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "22222222-2222-4222-8222-222222222222";
const POST_ID = "33333333-3333-4333-8333-333333333333";
const HTTPS = "https://cdn.example/owned.png";

function request(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ALLOWED = { ok: true, allowed: true, remaining: 9, resetAt: new Date(Date.now() + 3600_000).toISOString(), retryAfterSeconds: 3600 };

const VIDEO_WORKFLOW_BODY = {
  client_id: CLIENT_ID, brand_id: BRAND_ID, post_id: POST_ID,
  video_mode: "ugc", primary_image_url: HTTPS, user_prompt: "a warm hero shot",
  ai_model_override: "kling-3.0/video", duration: "10", aspect_ratio: "9:16",
};

const SCENE_VIDEO_BODY = {
  mode: "scene_video_generator", post_id: POST_ID, client_id: CLIENT_ID,
  ai_model_override: "bytedance/seedance-2", aspect_ratio: "16:9", video_resolution: "720p",
  scene_data: { visual_prompt: "a dramatic reveal", video_mode: "showcase", duration: "5", frames: { start_frame: HTTPS, end_frame: null } },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({ ok: true, value: "user-1" });
  mocks.bodySizeAllowed.mockReturnValue(true);
  mocks.consume.mockResolvedValue(ALLOWED);
  mocks.authorizeGeneric.mockResolvedValue({ ok: true, value: { client_id: "canonical-client", brand_id: BRAND_ID, post_id: POST_ID, video_mode: "ugc" } });
  mocks.loadBrandContext.mockResolvedValue({ ok: true, context: { name: "Canonical Brand" } });
  mocks.providerFetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
  mocks.undiciFetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
  vi.stubGlobal("fetch", mocks.providerFetch);
});

describe("workflows blink-generate-video-v1 boundary", () => {
  const url = "http://localhost/api/workflows?path=blink-generate-video-v1";

  it("returns 401 before validation, rate limit, or provider work", async () => {
    mocks.authenticate.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const res = await workflowsPost(request(url, VIDEO_WORKFLOW_BODY));
    expect(res.status).toBe(401);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.authorizeGeneric).not.toHaveBeenCalled();
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("returns 400 on an unknown field before rate limit, ownership, or provider work", async () => {
    const res = await workflowsPost(request(url, { ...VIDEO_WORKFLOW_BODY, webhook_url: "https://evil" }));
    expect(res.status).toBe(400);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.authorizeGeneric).not.toHaveBeenCalled();
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("returns 400 on an unknown model", async () => {
    const res = await workflowsPost(request(url, { ...VIDEO_WORKFLOW_BODY, ai_model_override: "gpt-secret" }));
    expect(res.status).toBe(400);
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("returns 429 when over budget with no provider work", async () => {
    mocks.consume.mockResolvedValue({ ...ALLOWED, allowed: false });
    const res = await workflowsPost(request(url, VIDEO_WORKFLOW_BODY));
    expect(res.status).toBe(429);
    expect(mocks.authorizeGeneric).not.toHaveBeenCalled();
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("returns 503 when the limiter backend is unavailable", async () => {
    mocks.consume.mockResolvedValue({ ok: false });
    const res = await workflowsPost(request(url, VIDEO_WORKFLOW_BODY));
    expect(res.status).toBe(503);
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("forwards only the canonical server-authorized payload on a valid request", async () => {
    const res = await workflowsPost(request(url, VIDEO_WORKFLOW_BODY));
    expect(res.status).toBe(200);
    expect(mocks.authorizeGeneric).toHaveBeenCalledTimes(1);
    // The identity fields passed to authorize are the validated caller values,
    // ownership-verified there; the forwarded body is the canonical result.
    const forwarded = JSON.parse(String(mocks.providerFetch.mock.calls[0][1]?.body));
    expect(forwarded).toMatchObject({ client_id: "canonical-client", brand_id: BRAND_ID, post_id: POST_ID });
  });

  it("propagates a denied tenant scope as 404 with no provider work", async () => {
    mocks.authorizeGeneric.mockResolvedValue({ ok: false, status: 404, error: "Resource not found" });
    const res = await workflowsPost(request(url, VIDEO_WORKFLOW_BODY));
    expect(res.status).toBe(404);
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });
});

describe("nano-banana video-mode boundary", () => {
  const url = "http://localhost/api/video/nano-banana";

  it("returns 400 on an invalid video field before rate limit or provider work", async () => {
    const res = await nanoBananaPost(request(url, { ...SCENE_VIDEO_BODY, ai_model_override: "secret-model" }));
    expect(res.status).toBe(400);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.authorizeGeneric).not.toHaveBeenCalled();
    expect(mocks.undiciFetch).not.toHaveBeenCalled();
  });

  it("returns 400 on an unsafe frame URL", async () => {
    const res = await nanoBananaPost(request(url, {
      ...SCENE_VIDEO_BODY,
      scene_data: { ...SCENE_VIDEO_BODY.scene_data, frames: { start_frame: "http://evil/x.png", end_frame: null } },
    }));
    expect(res.status).toBe(400);
    expect(mocks.undiciFetch).not.toHaveBeenCalled();
  });

  it("returns 400 on an unknown top-level mode", async () => {
    const res = await nanoBananaPost(request(url, { mode: "exfiltrate", prompt: "x" }));
    expect(res.status).toBe(400);
    expect(mocks.undiciFetch).not.toHaveBeenCalled();
  });

  it("returns 429 when over budget with no provider work", async () => {
    mocks.consume.mockResolvedValue({ ...ALLOWED, allowed: false });
    const res = await nanoBananaPost(request(url, SCENE_VIDEO_BODY));
    expect(res.status).toBe(429);
    expect(mocks.authorizeGeneric).not.toHaveBeenCalled();
    expect(mocks.undiciFetch).not.toHaveBeenCalled();
  });

  it("reaches the provider once on a valid scene video request", async () => {
    const res = await nanoBananaPost(request(url, SCENE_VIDEO_BODY));
    expect(res.status).toBe(200);
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "video_job");
    expect(mocks.authorizeGeneric).toHaveBeenCalledTimes(1);
    expect(mocks.undiciFetch).toHaveBeenCalledTimes(1);
  });

  it("rate-limits director/frame helpers under the video_director operation", async () => {
    mocks.authorizeGeneric.mockResolvedValue({ ok: true, value: { mode: "director", client_id: "canonical-client" } });
    const res = await nanoBananaPost(request(url, { mode: "director", prompt: "write a story", style: "Anime" }));
    expect(res.status).toBe(200);
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "video_director");
  });
});

describe("V6: brand identity is server-owned on the video path", () => {
  const url = "http://localhost/api/workflows?path=blink-generate-video-v1";

  it("DISCARDS browser-supplied brand_name/brand_info and injects the canonical context", async () => {
    mocks.authorizeGeneric.mockResolvedValue({
      ok: true,
      value: { client_id: "canonical-client", brand_id: BRAND_ID, post_id: POST_ID, brand_name: "SPOOFED", brand_info: "SPOOFED INFO" },
    });
    const res = await workflowsPost(request(url, {
      ...VIDEO_WORKFLOW_BODY,
      brand_name: "Totally Not Their Brand",
      brand_info: "attacker-authored description",
    }));
    expect(res.status).toBe(200);

    const forwarded = JSON.parse(String(mocks.providerFetch.mock.calls[0][1]?.body));
    expect(forwarded.brand_name).toBe("Canonical Brand");
    expect(forwarded.brand_info).toBe("CANONICAL BRIEF");
    expect(forwarded.brand_context_version).toBe(1);
    // Nothing the browser authored survives.
    expect(JSON.stringify(forwarded)).not.toContain("Totally Not Their Brand");
    expect(JSON.stringify(forwarded)).not.toContain("attacker-authored");
    expect(JSON.stringify(forwarded)).not.toContain("SPOOFED");
  });

  it("propagates a denied brand as 404 without provider work", async () => {
    mocks.loadBrandContext.mockResolvedValue({ ok: false, status: 404, error: "Brand not found" });
    const res = await workflowsPost(request(url, VIDEO_WORKFLOW_BODY));
    expect(res.status).toBe(404);
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("forwards NO brand identity when no brand is in scope", async () => {
    mocks.authorizeGeneric.mockResolvedValue({
      ok: true,
      value: { client_id: "canonical-client", post_id: POST_ID, brand_name: "LEFTOVER", brand_info: "LEFTOVER" },
    });
    const res = await workflowsPost(request(url, VIDEO_WORKFLOW_BODY));
    expect(res.status).toBe(200);
    const forwarded = JSON.parse(String(mocks.providerFetch.mock.calls[0][1]?.body));
    expect("brand_name" in forwarded).toBe(false);
    expect("brand_info" in forwarded).toBe(false);
  });
});

describe("BILLING INTEGRITY: per-model options are enforced before any n8n/billing work", () => {
  const url = "http://localhost/api/workflows?path=blink-generate-video-v1";

  // A direct API caller must not be able to buy a duration the provider cannot
  // render. Before 2026-08-06 these passed validation, were billed in full, and
  // were then silently clamped for the provider.
  const REJECTED: Array<[string, Record<string, unknown>]> = [
    ["Kling at 300s (billed 3600 for a 15s video)", { ai_model_override: "kling-3.0/video", duration: "300" }],
    ["Pruna at 300s", { ai_model_override: "replicate:prunaai/p-video", duration: "300" }],
    ["Pruna above its 10s maximum", { ai_model_override: "replicate:prunaai/p-video", duration: "15" }],
    ["Sora above its 12s maximum", { ai_model_override: "replicate:openai/sora-2", duration: "15" }],
    ["Sora at 5s (not in its {4,8,12} enum)", { ai_model_override: "replicate:openai/sora-2", duration: "5" }],
    ["Sora at 10s (not in its enum)", { ai_model_override: "replicate:openai/sora-2", duration: "10" }],
    ["Sora with 1:1 (builder maps to rejected 'square')", { ai_model_override: "replicate:openai/sora-2", duration: "4", aspect_ratio: "1:1" }],
    ["Sora with an end frame (no end-frame input exists)", { ai_model_override: "replicate:openai/sora-2", duration: "4", secondary_image_url: "https://cdn.example/end.png" }],
    ["Seedance with an end frame", { ai_model_override: "bytedance/seedance-2", duration: "5", secondary_image_url: "https://cdn.example/end.png" }],
    ["Gemini with an end frame", { ai_model_override: "gemini-omni-video", duration: "4", aspect_ratio: "16:9", secondary_image_url: "https://cdn.example/end.png" }],
    ["Gemini off its discrete set", { ai_model_override: "gemini-omni-video", duration: "5" }],
    ["Gemini with an unsupported aspect", { ai_model_override: "gemini-omni-video", duration: "4", aspect_ratio: "21:9" }],
  ];

  for (const [label, override] of REJECTED) {
    it(`rejects ${label} with no rate-limit, ownership, brand or provider work`, async () => {
      const res = await workflowsPost(request(url, { ...VIDEO_WORKFLOW_BODY, ...override }));
      expect(res.status).toBe(400);
      expect(mocks.consume).not.toHaveBeenCalled();
      expect(mocks.authorizeGeneric).not.toHaveBeenCalled();
      expect(mocks.loadBrandContext).not.toHaveBeenCalled();
      expect(mocks.providerFetch).not.toHaveBeenCalled();
    });
  }

  const ACCEPTED: Array<[string, Record<string, unknown>]> = [
    ["Kling at its 15s maximum", { ai_model_override: "kling-3.0/video", duration: "15" }],
    ["Pruna at its 10s maximum", { ai_model_override: "replicate:prunaai/p-video", duration: "10" }],
    ["Sora at its 12s maximum", { ai_model_override: "replicate:openai/sora-2", duration: "12" }],
    ["Sora at 4s", { ai_model_override: "replicate:openai/sora-2", duration: "4" }],
    ["Sora at 8s", { ai_model_override: "replicate:openai/sora-2", duration: "8" }],
    ["Pruna WITH an end frame (last_frame_image is genuinely supported)", { ai_model_override: "replicate:prunaai/p-video", duration: "5", secondary_image_url: "https://cdn.example/end.png" }],
    ["Kling WITH an end frame (image_urls[1] per Kie docs)", { ai_model_override: "kling-3.0/video", duration: "5", secondary_image_url: "https://cdn.example/end.png" }],
    ["Gemini on its discrete set", { ai_model_override: "gemini-omni-video", duration: "8", aspect_ratio: "16:9" }],
    ["Seedance at an in-range duration the UI does not offer", { ai_model_override: "bytedance/seedance-2", duration: "8" }],
  ];

  for (const [label, override] of ACCEPTED) {
    it(`still accepts ${label}`, async () => {
      const res = await workflowsPost(request(url, { ...VIDEO_WORKFLOW_BODY, ...override }));
      expect(res.status).toBe(200);
      expect(mocks.providerFetch).toHaveBeenCalledTimes(1);
    });
  }

  it("validates the model auto resolves to, not the sentinel", async () => {
    // auto + clothing -> Pruna (10s max), so 15s must be refused.
    const res = await workflowsPost(request(url, {
      ...VIDEO_WORKFLOW_BODY, ai_model_override: "auto", video_mode: "clothing", duration: "15",
    }));
    expect(res.status).toBe(400);
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("allows auto where the resolved model supports the duration", async () => {
    // auto + ugc -> Kling, which renders 15s.
    const res = await workflowsPost(request(url, {
      ...VIDEO_WORKFLOW_BODY, ai_model_override: "auto", video_mode: "ugc", duration: "15",
    }));
    expect(res.status).toBe(200);
  });
});
