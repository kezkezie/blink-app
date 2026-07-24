import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient, getUser, from } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from } }));

import {
  authenticateExecutionRequest,
  authorizeImageWorkflow,
  authorizeSemanticImage,
  parseImageWorkflowRequest,
  parseSemanticImageRequest,
} from "@/lib/execution-security";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "22222222-2222-4222-8222-222222222222";
const CONTENT_ID = "33333333-3333-4333-8333-333333333333";

function singleQuery(result: unknown) {
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(result);
  return chain;
}

function listQuery(result: unknown) {
  const chain = { select: vi.fn(), eq: vi.fn(), limit: vi.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  createServerClient.mockReturnValue({ auth: { getUser } });
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("execution request contracts", () => {
  it("authenticates from the cookie session without tenant input", async () => {
    const request = new NextRequest("http://localhost/api/workflows", { method: "POST" });
    await expect(authenticateExecutionRequest(request)).resolves.toEqual({ ok: true, value: "user-1" });
    expect(getUser).toHaveBeenCalledOnce();

    getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(authenticateExecutionRequest(request)).resolves.toEqual({ ok: false, status: 401, error: "Unauthorized" });
    expect(from).not.toHaveBeenCalled();
  });

  it("accepts current image modes but rejects unknown keys, models, and oversized references", () => {
    const valid = parseImageWorkflowRequest({
      client_id: CLIENT_ID,
      brand_id: BRAND_ID,
      mode: "product_drop",
      prompt: "Place the product in a calm studio scene",
      reference_image_urls: ["https://project.supabase.co/storage/v1/object/public/assets/images/11111111-1111-4111-8111-111111111111/ref.png"],
      kie_model: "nano-banana-2",
      aspect_ratio: "4:5",
      numImages: 1,
      is_sync: true,
    });
    expect(valid?.requestedClientId).toBe(CLIENT_ID);
    expect(valid?.requestedBrandId).toBe(BRAND_ID);
    expect(valid?.payload.mode).toBe("product_drop");

    expect(parseImageWorkflowRequest({ brand_id: BRAND_ID, prompt: "valid prompt", hidden_provider: true })).toBeNull();
    expect(parseImageWorkflowRequest({ brand_id: BRAND_ID, prompt: "valid prompt", kie_model: "unknown-model" })).toBeNull();
    expect(parseImageWorkflowRequest({
      brand_id: BRAND_ID,
      prompt: "valid prompt",
      reference_image_urls: Array.from({ length: 11 }, (_, index) => `https://example.com/${index}.png`),
    })).toBeNull();
  });

  it("accepts a COMPLETE durable correlation set but never forwards the caller's job_id", () => {
    const parsed = parseImageWorkflowRequest({
      brand_id: BRAND_ID,
      prompt: "valid prompt",
      post_id: CONTENT_ID,
      job_id: CONTENT_ID,
      idempotency_key: "studio_abc-123.def:456",
      is_sync: false,
    });
    expect(parsed?.postId).toBe(CONTENT_ID);
    expect(parsed?.payload.idempotency_key).toBe("studio_abc-123.def:456");
    // job_id is re-derived from the ownership-authorized post_id downstream — the
    // caller's claim is not trusted for forwarding.
    expect(parsed?.payload).not.toHaveProperty("job_id");
  });

  it("accepts a synchronous request that omits every durable correlation field (backward compatible)", () => {
    const parsed = parseImageWorkflowRequest({ brand_id: BRAND_ID, prompt: "valid prompt", is_sync: true });
    expect(parsed).not.toBeNull();
    expect(parsed?.payload).not.toHaveProperty("job_id");
    expect(parsed?.payload).not.toHaveProperty("idempotency_key");
    // omitting is_sync entirely (a plain sync call) is also fine
    expect(parseImageWorkflowRequest({ brand_id: BRAND_ID, prompt: "valid prompt" })).not.toBeNull();
  });

  it("rejects partial or inconsistent durable correlation before any workflow work", () => {
    const OTHER_ID = "44444444-4444-4444-8444-444444444444";
    const KEY = "studio_abc-123.def:456";
    // job_id without post_id — orphan alias with no ownership-verified content row
    expect(parseImageWorkflowRequest({ brand_id: BRAND_ID, prompt: "p", job_id: CONTENT_ID, idempotency_key: KEY, is_sync: false })).toBeNull();
    // job_id !== post_id
    expect(parseImageWorkflowRequest({ brand_id: BRAND_ID, prompt: "p", post_id: CONTENT_ID, job_id: OTHER_ID, idempotency_key: KEY, is_sync: false })).toBeNull();
    // is_sync:false missing idempotency_key
    expect(parseImageWorkflowRequest({ brand_id: BRAND_ID, prompt: "p", post_id: CONTENT_ID, job_id: CONTENT_ID, is_sync: false })).toBeNull();
    // is_sync:false with post_id but no job_id
    expect(parseImageWorkflowRequest({ brand_id: BRAND_ID, prompt: "p", post_id: CONTENT_ID, idempotency_key: KEY, is_sync: false })).toBeNull();
    // durable markers on a synchronous request
    expect(parseImageWorkflowRequest({ brand_id: BRAND_ID, prompt: "p", post_id: CONTENT_ID, job_id: CONTENT_ID, idempotency_key: KEY, is_sync: true })).toBeNull();
    // idempotency_key alone on an async request with no ids
    expect(parseImageWorkflowRequest({ brand_id: BRAND_ID, prompt: "p", idempotency_key: KEY, is_sync: false })).toBeNull();
    // malformed idempotency_key even with a matching id pair
    expect(parseImageWorkflowRequest({ brand_id: BRAND_ID, prompt: "p", post_id: CONTENT_ID, job_id: CONTENT_ID, idempotency_key: "short", is_sync: false })).toBeNull();
  });

  it("re-derives the durable job_id from the ownership-authorized post_id (never the caller's claim)", async () => {
    const clientQuery = singleQuery({ data: { id: CLIENT_ID }, error: null });
    const postQuery = singleQuery({ data: { id: CONTENT_ID, brand_id: BRAND_ID, content_type: "post", image_urls: [] }, error: null });
    const brandQuery = singleQuery({ data: { id: BRAND_ID, brand_name: "Durable Brand", website_url: "https://durable.example", logo_url: null }, error: null });
    from.mockReturnValueOnce(clientQuery).mockReturnValueOnce(postQuery).mockReturnValueOnce(brandQuery);

    const parsed = parseImageWorkflowRequest({
      brand_id: BRAND_ID,
      prompt: "A durable async prompt",
      post_id: CONTENT_ID,
      job_id: CONTENT_ID,
      idempotency_key: "studio_abc-123.def:456",
      is_sync: false,
    });
    expect(parsed).not.toBeNull();

    const result = await authorizeImageWorkflow("user-1", parsed!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(postQuery.eq).toHaveBeenCalledWith("id", CONTENT_ID);
    expect(postQuery.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(result.value.post_id).toBe(CONTENT_ID);
    expect(result.value.job_id).toBe(CONTENT_ID); // canonicalized from the authorized post id
    expect(result.value.idempotency_key).toBe("studio_abc-123.def:456");
    expect(result.value.is_sync).toBe(false);
  });

  it("canonicalizes owned image execution scope and ignores caller brand context", async () => {
    const clientQuery = singleQuery({ data: { id: CLIENT_ID }, error: null });
    const brandQuery = singleQuery({
      data: {
        id: BRAND_ID,
        brand_name: "Canonical Brand",
        website_url: "https://canonical.example",
        description: "Canonical description",
        industry: "Home goods",
        primary_color: "#112233",
        secondary_color: "#DDEEFF",
        logo_url: "https://cdn.example/canonical-logo.png",
      },
      error: null,
    });
    from.mockReturnValueOnce(clientQuery).mockReturnValueOnce(brandQuery);
    const parsed = parseImageWorkflowRequest({
      client_id: CLIENT_ID,
      brand_id: BRAND_ID,
      mode: "standard",
      prompt: "A warm blanket campaign",
      brand_name: "Caller Fake",
      logo_url: "https://attacker.example/logo.png",
    });
    expect(parsed).not.toBeNull();

    const result = await authorizeImageWorkflow("user-1", parsed!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(clientQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(brandQuery.eq).toHaveBeenCalledWith("id", BRAND_ID);
    expect(brandQuery.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(result.value).toMatchObject({
      client_id: CLIENT_ID,
      brand_id: BRAND_ID,
      brand_name: "Canonical Brand",
      logo_url: "https://cdn.example/canonical-logo.png",
    });
    expect(JSON.stringify(result.value)).not.toContain("Caller Fake");
    expect(JSON.stringify(result.value)).not.toContain("attacker.example");
  });

  it("rejects a brand outside the authenticated tenant before reference or provider work", async () => {
    const clientQuery = singleQuery({ data: { id: CLIENT_ID }, error: null });
    const brandQuery = singleQuery({ data: null, error: null });
    from.mockReturnValueOnce(clientQuery).mockReturnValueOnce(brandQuery);
    const parsed = parseImageWorkflowRequest({ brand_id: BRAND_ID, prompt: "A valid image prompt" });
    const result = await authorizeImageWorkflow("user-1", parsed!);
    expect(result).toEqual({ ok: false, status: 404, error: "Resource not found" });
    expect(brandQuery.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("rejects arbitrary external image references that are not in owned brand content", async () => {
    const clientQuery = singleQuery({ data: { id: CLIENT_ID }, error: null });
    const brandQuery = singleQuery({ data: { id: BRAND_ID, logo_url: null }, error: null });
    const libraryQuery = listQuery({ data: [{ image_urls: ["https://cdn.example/owned.png"] }], error: null });
    from.mockReturnValueOnce(clientQuery).mockReturnValueOnce(brandQuery).mockReturnValueOnce(libraryQuery);
    const parsed = parseImageWorkflowRequest({
      brand_id: BRAND_ID,
      prompt: "A valid image prompt",
      reference_image_urls: ["https://attacker.example/reference.png"],
    });
    const result = await authorizeImageWorkflow("user-1", parsed!);
    expect(result).toEqual({ ok: false, status: 404, error: "Resource not found" });
    expect(libraryQuery.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(libraryQuery.eq).toHaveBeenCalledWith("brand_id", BRAND_ID);
  });

  it("validates semantic schemas and derives source media from owned content", async () => {
    const schema = {
      scene_description: "A product on a table",
      lighting_and_weather: "Warm window light",
      objects: [{ id: "product", name: "Bottle", color: "Amber", material: "Glass", type: "product" }],
    };
    const parsed = parseSemanticImageRequest({
      mode: "scene_video_generator",
      video_mode: "json_image_edit",
      content_id: CONTENT_ID,
      json_schema: schema,
      replacements: {},
      kie_model: "nano-banana-2",
    });
    expect(parsed?.operation).toBe("json_image_edit");
    expect(parseSemanticImageRequest({
      mode: "scene_video_generator",
      video_mode: "json_image_edit",
      content_id: CONTENT_ID,
      primary_image_url: "https://attacker.example/source.png",
      json_schema: schema,
      replacements: {},
    })).toBeNull();
    expect(parseSemanticImageRequest({
      mode: "scene_video_generator",
      video_mode: "json_image_edit",
      content_id: CONTENT_ID,
      json_schema: schema,
      replacements: { unknown_object: "https://project.supabase.co/storage/v1/object/public/assets/edits/x.png" },
    })).toBeNull();

    const clientQuery = singleQuery({ data: { id: CLIENT_ID }, error: null });
    const contentQuery = singleQuery({
      data: { id: CONTENT_ID, brand_id: BRAND_ID, content_type: "post_image", image_urls: ["https://cdn.example/owned.png"] },
      error: null,
    });
    const brandQuery = singleQuery({ data: { id: BRAND_ID }, error: null });
    from.mockReturnValueOnce(clientQuery).mockReturnValueOnce(contentQuery).mockReturnValueOnce(brandQuery);
    const result = await authorizeSemanticImage("user-1", parsed!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(contentQuery.eq).toHaveBeenCalledWith("id", CONTENT_ID);
    expect(contentQuery.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(result.value).toMatchObject({
      client_id: CLIENT_ID,
      brand_id: BRAND_ID,
      post_id: CONTENT_ID,
      primary_image_url: "https://cdn.example/owned.png",
    });
  });
});
