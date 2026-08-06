import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from } }));

import { createVideoJobPlaceholder, loadOwnedVideoJob, parseVideoJobRequest } from "@/lib/video-job";
import { SCENE_SPEC_VERSION } from "@/lib/scene-spec";

const USER_ID = "user-1";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_BRAND_ID = "44444444-4444-4444-8444-444444444444";
const PARENT_ID = "33333333-3333-4333-8333-333333333333";
const NEW_ID = "55555555-5555-4555-8555-555555555555";
const KEY = "scene-abc123-def456";

const SPEC = {
  schemaVersion: SCENE_SPEC_VERSION,
  sceneId: "scene-1",
  sceneNumber: 2,
  videoPrompt: "slow dolly in as the blanket is unfolded",
  imagePrompt: "a warm living room at dusk",
  selectedModel: "kling-3.0/video",
  durationSeconds: "10",
  aspectRatio: "16:9",
  videoMode: "showcase",
};

function chain(result: unknown) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  c.select = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  c.upsert = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  return c;
}

const clientOk = () => chain({ data: { id: CLIENT_ID }, error: null });
const missing = () => chain({ data: null, error: null });
const brandOk = () => chain({ data: { id: BRAND_ID }, error: null });
const createdRow = (over: Record<string, unknown> = {}) =>
  chain({
    data: { id: NEW_ID, generation_state: "queued", billing_state: "not_charged", retry_state: "none", generation_attempt: 1, ...over },
    error: null,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("parseVideoJobRequest", () => {
  const valid = { brand_id: BRAND_ID, idempotency_key: KEY, content_type: "sequence_clip", scene_spec: SPEC };

  it("accepts a valid request and returns the validated spec", () => {
    const parsed = parseVideoJobRequest(valid);
    expect(parsed).not.toBeNull();
    expect(parsed!.brandId).toBe(BRAND_ID);
    expect(parsed!.contentType).toBe("sequence_clip");
    expect(parsed!.sceneSpec.videoPrompt).toBe("slow dolly in as the blanket is unfolded");
  });

  it("accepts a retry parent and the reel content type", () => {
    const parsed = parseVideoJobRequest({ ...valid, content_type: "reel", retry_of_content_id: PARENT_ID });
    expect(parsed!.contentType).toBe("reel");
    expect(parsed!.retryOfContentId).toBe(PARENT_ID);
  });

  it("rejects unknown fields, bad ids, bad keys and bad content types", () => {
    expect(parseVideoJobRequest({ ...valid, webhook: "https://evil" })).toBeNull();
    expect(parseVideoJobRequest({ ...valid, brand_id: "not-a-uuid" })).toBeNull();
    expect(parseVideoJobRequest({ ...valid, idempotency_key: "short" })).toBeNull();
    expect(parseVideoJobRequest({ ...valid, content_type: "post_image" })).toBeNull();
    expect(parseVideoJobRequest({ ...valid, retry_of_content_id: "nope" })).toBeNull();
  });

  it("rejects an invalid SceneSpec (strict V2 validation applies here)", () => {
    expect(parseVideoJobRequest({ ...valid, scene_spec: { ...SPEC, schemaVersion: 99 } })).toBeNull();
    expect(parseVideoJobRequest({ ...valid, scene_spec: { ...SPEC, selectedModel: "secret-model" } })).toBeNull();
    // 16s exceeds every provider maximum ("7" is renderable — 2026-08-06 slice).
    expect(parseVideoJobRequest({ ...valid, scene_spec: { ...SPEC, durationSeconds: "16" } })).toBeNull();
    expect(parseVideoJobRequest({ ...valid, scene_spec: { ...SPEC, videoPrompt: "x".repeat(8001) } })).toBeNull();
    expect(parseVideoJobRequest({ ...valid, scene_spec: { ...SPEC, startFrameRef: "http://insecure/x.png" } })).toBeNull();
    expect(parseVideoJobRequest({ ...valid, scene_spec: null })).toBeNull();
  });
});

describe("createVideoJobPlaceholder", () => {
  const input = { brandId: BRAND_ID, idempotencyKey: KEY, contentType: "sequence_clip" as const, sceneSpec: parseVideoJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, content_type: "sequence_clip", scene_spec: SPEC })!.sceneSpec };

  it("creates a queued placeholder after verifying client and brand ownership", async () => {
    const created = createdRow();
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(created);

    const result = await createVideoJobPlaceholder(USER_ID, input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ id: NEW_ID, generationState: "queued", billingState: "not_charged", retryState: "none", attempt: 1, idempotent: false });

    const row = created.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.client_id).toBe(CLIENT_ID); // server-derived, never from the browser
    expect(row.content_type).toBe("sequence_clip");
    expect(row.generation_state).toBe("queued");
    expect(row.generation_idempotency_key).toBe(KEY);
    expect(row.ai_model).toBe("kling-3.0/video");
    // Slice-4 envelope + the V2 spec travel together.
    expect(row.creation_metadata_version).toBe(1);
    const spec = (row.creation_metadata as Record<string, unknown>).scene_spec as Record<string, unknown>;
    expect(spec.videoPrompt).toBe("slow dolly in as the blanket is unfolded");
    expect(spec.generationState).toBe("queued");
  });

  it("never sets a credit cost — n8n owns the video deduction", async () => {
    const created = createdRow();
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(created);
    await createVideoJobPlaceholder(USER_ID, input);
    const row = created.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect("credit_cost" in row).toBe(false);
  });

  it("denies an unknown client and a brand owned by someone else, identically", async () => {
    from.mockReturnValueOnce(missing());
    expect(await createVideoJobPlaceholder(USER_ID, input)).toMatchObject({ ok: false, status: 404 });

    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(missing());
    expect(await createVideoJobPlaceholder(USER_ID, { ...input, brandId: OTHER_BRAND_ID })).toMatchObject({ ok: false, status: 404 });
  });

  it("returns the SAME placeholder for a repeated idempotency key (no second job)", async () => {
    const conflicted = chain({ data: null, error: null });
    const existing = chain({
      data: { id: NEW_ID, generation_state: "queued", billing_state: "not_charged", retry_state: "none", generation_attempt: 1 },
      error: null,
    });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(conflicted).mockReturnValueOnce(existing);

    const result = await createVideoJobPlaceholder(USER_ID, input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(NEW_ID);
    expect(result.value.idempotent).toBe(true);
  });

  it("increments attempt and records lineage for a retry", async () => {
    const parent = chain({ data: { id: PARENT_ID, brand_id: BRAND_ID, generation_attempt: 2 }, error: null });
    const created = createdRow({ generation_attempt: 3, retry_state: "retrying" });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(parent).mockReturnValueOnce(created);

    const result = await createVideoJobPlaceholder(USER_ID, { ...input, retryOfContentId: PARENT_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.attempt).toBe(3);

    const row = created.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.generation_attempt).toBe(3);
    expect(row.retry_of_content_id).toBe(PARENT_ID);
    expect(row.retry_state).toBe("retrying");
    const spec = (row.creation_metadata as Record<string, unknown>).scene_spec as Record<string, unknown>;
    expect(spec.revisionParentId).toBe(PARENT_ID);
    expect(spec.retryState).toBe("retrying");
  });

  it("denies a retry parent belonging to another brand", async () => {
    const parent = chain({ data: { id: PARENT_ID, brand_id: OTHER_BRAND_ID, generation_attempt: 1 }, error: null });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(parent);
    expect(await createVideoJobPlaceholder(USER_ID, { ...input, retryOfContentId: PARENT_ID })).toMatchObject({ ok: false, status: 404 });
  });

  it("performs no provider, n8n, or billing work", async () => {
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(createdRow());
    await createVideoJobPlaceholder(USER_ID, input);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("loadOwnedVideoJob", () => {
  it("scopes the read to the caller's client", async () => {
    const row = chain({ data: { id: NEW_ID, generation_state: "generating" }, error: null });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(row);
    const result = await loadOwnedVideoJob(USER_ID, NEW_ID);
    expect(result.ok).toBe(true);
    expect(row.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns 404 for a row owned by another tenant", async () => {
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(missing());
    expect(await loadOwnedVideoJob(USER_ID, NEW_ID)).toMatchObject({ ok: false, status: 404 });
  });
});
