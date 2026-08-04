import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from } }));

import { createImageJobPlaceholder, parseImageJobRequest } from "@/lib/image-job";

const USER_ID = "user-1";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_BRAND_ID = "44444444-4444-4444-8444-444444444444";
const PARENT_ID = "33333333-3333-4333-8333-333333333333";
const NEW_ID = "55555555-5555-4555-8555-555555555555";
const KEY = "studio-abc123-def456";
const ENGINE = "nb2"; // resolves to nano-banana-2, cost 8

// Chain mock supporting select/eq/upsert/maybeSingle.
function chain(result: unknown) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  c.select = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  c.upsert = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  return c;
}

const clientOk = () => chain({ data: { id: CLIENT_ID }, error: null });
const clientMissing = () => chain({ data: null, error: null });
const brandOk = () => chain({ data: { id: BRAND_ID }, error: null });
const brandMissing = () => chain({ data: null, error: null });
// A created placeholder row now carries a server-derived credit_cost.
const createdRow = (over: Record<string, unknown> = {}) =>
  chain({ data: { id: NEW_ID, generation_state: "queued", billing_state: "not_charged", retry_state: "none", generation_attempt: 1, credit_cost: 8, ...over }, error: null });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("parseImageJobRequest", () => {
  it("accepts a minimal valid request with an engine alias", () => {
    expect(parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, mode: "standard", image_engine: ENGINE })).toEqual({
      brandId: BRAND_ID,
      idempotencyKey: KEY,
      mode: "standard",
      imageEngine: ENGINE,
    });
  });

  it("accepts aspect ratio and retry parent", () => {
    expect(
      parseImageJobRequest({
        brand_id: BRAND_ID,
        idempotency_key: KEY,
        mode: "grid",
        image_engine: "gpt-image-2-image-to-image",
        aspect_ratio: "9:16",
        retry_of_content_id: PARENT_ID,
      }),
    ).toEqual({ brandId: BRAND_ID, idempotencyKey: KEY, mode: "grid", imageEngine: "gpt-image-2-image-to-image", aspectRatio: "9:16", retryOfContentId: PARENT_ID });
  });

  it("rejects unknown keys, bad ids, short keys, and unknown enums", () => {
    const base = { brand_id: BRAND_ID, idempotency_key: KEY, mode: "standard", image_engine: ENGINE };
    expect(parseImageJobRequest({ ...base, hidden: 1 })).toBeNull();
    expect(parseImageJobRequest({ ...base, brand_id: "not-a-uuid" })).toBeNull();
    expect(parseImageJobRequest({ ...base, idempotency_key: "short" })).toBeNull();
    expect(parseImageJobRequest({ ...base, mode: "hidden_mode" })).toBeNull();
    expect(parseImageJobRequest({ ...base, aspect_ratio: "5:5" })).toBeNull();
    expect(parseImageJobRequest({ ...base, retry_of_content_id: "x" })).toBeNull();
    expect(parseImageJobRequest("nope")).toBeNull();
  });

  it("requires a resolvable engine and rejects an unknown one", () => {
    // Missing engine entirely.
    expect(parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, mode: "standard" })).toBeNull();
    // Unknown/unsupported engine alias.
    expect(parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, mode: "standard", image_engine: "midjourney" })).toBeNull();
    expect(parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, mode: "standard", image_engine: "" })).toBeNull();
  });

  it("ignores/rejects a browser-supplied price — cost is never accepted from the client", () => {
    // Any extra key (a price the browser tries to inject) fails the strict allowlist.
    expect(parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, mode: "standard", image_engine: ENGINE, credit_cost: 2 })).toBeNull();
    expect(parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, mode: "standard", image_engine: ENGINE, price: 2 })).toBeNull();
    // A parsed request never carries a price field the server could trust.
    const parsed = parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, mode: "standard", image_engine: ENGINE });
    expect(parsed).not.toHaveProperty("creditCost");
    expect(parsed).not.toHaveProperty("credit_cost");
  });
});

describe("createImageJobPlaceholder — ownership, creation, and server-derived cost", () => {
  it("persists the canonical engine/model + server-derived credit_cost and returns it", async () => {
    const content = createdRow();
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(content);

    const result = await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", imageEngine: ENGINE, aspectRatio: "4:5" });

    expect(result).toEqual({
      ok: true,
      value: { id: NEW_ID, generationState: "queued", billingState: "not_charged", retryState: "none", attempt: 1, creditCost: 8, idempotent: false },
    });
    const [row, options] = content.upsert.mock.calls[0];
    expect(row).toMatchObject({
      client_id: CLIENT_ID,
      brand_id: BRAND_ID,
      generation_state: "queued",
      billing_state: "not_charged",
      retry_state: "none",
      generation_attempt: 1,
      generation_idempotency_key: KEY,
      credit_cost: 8, // server-derived from the registry, not the browser
      creation_metadata_version: 1,
      creation_metadata: { operation: "standard", mode: "standard", image_engine: "nb2", image_model: "nano-banana-2", credit_cost: 8, aspect_ratio: "4:5" },
    });
    expect(row.retry_of_content_id).toBeUndefined();
    expect(options).toEqual({ onConflict: "client_id,generation_idempotency_key", ignoreDuplicates: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("prices GPT Image 2 · I2I from the registry (canonical model + verified 6cr persisted)", async () => {
    const content = createdRow({ credit_cost: 6 });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(content);
    await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", imageEngine: "gpt-image-2-image-to-image" });
    const row = content.upsert.mock.calls[0][0];
    expect(row.credit_cost).toBe(6);
    expect(row.creation_metadata).toMatchObject({ image_engine: "gpt-image-2-image-to-image", image_model: "gpt-image-2-image-to-image", credit_cost: 6 });
  });

  it("denies a brand outside the authenticated client without writing content", async () => {
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandMissing());
    const result = await createImageJobPlaceholder(USER_ID, { brandId: OTHER_BRAND_ID, idempotencyKey: KEY, mode: "standard", imageEngine: ENGINE });
    expect(result).toEqual({ ok: false, status: 404, error: "Resource not found" });
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("returns 404 when the authenticated user has no client", async () => {
    from.mockReturnValueOnce(clientMissing());
    const result = await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", imageEngine: ENGINE });
    expect(result).toEqual({ ok: false, status: 404, error: "Resource not found" });
    expect(from).toHaveBeenCalledTimes(1);
  });
});

describe("createImageJobPlaceholder — idempotency preserves the original cost", () => {
  it("returns the EXISTING placeholder's stored cost on replay (never repriced)", async () => {
    const upsertConflict = chain({ data: null, error: null }); // ON CONFLICT DO NOTHING → no row
    // The original job was created earlier at cost 8; even if the registry later
    // changed, the durable row's stored cost is what a replay returns.
    const existing = chain({ data: { id: NEW_ID, generation_state: "generating", billing_state: "charged", retry_state: "none", generation_attempt: 1, credit_cost: 8 }, error: null });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(upsertConflict).mockReturnValueOnce(existing);

    const result = await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", imageEngine: ENGINE });
    expect(result).toEqual({
      ok: true,
      value: { id: NEW_ID, generationState: "generating", billingState: "charged", retryState: "none", attempt: 1, creditCost: 8, idempotent: true },
    });
    expect(existing.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(existing.eq).toHaveBeenCalledWith("generation_idempotency_key", KEY);
  });

  it("scopes uniqueness to the client so different clients can reuse a textual key", async () => {
    const contentA = createdRow();
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(contentA);
    await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", imageEngine: ENGINE });
    expect(contentA.upsert.mock.calls[0][1]).toEqual({ onConflict: "client_id,generation_idempotency_key", ignoreDuplicates: true });

    const OTHER_CLIENT = "99999999-9999-4999-8999-999999999999";
    const clientB = chain({ data: { id: OTHER_CLIENT }, error: null });
    const contentB = createdRow({ id: "66666666-6666-4666-8666-666666666666" });
    from.mockReturnValueOnce(clientB).mockReturnValueOnce(brandOk()).mockReturnValueOnce(contentB);
    const resultB = await createImageJobPlaceholder("user-2", { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", imageEngine: ENGINE });
    expect(resultB.ok).toBe(true);
    expect(contentB.upsert.mock.calls[0][0].client_id).toBe(OTHER_CLIENT);
  });
});

describe("createImageJobPlaceholder — retry lineage", () => {
  it("accepts a same-client, same-brand parent and increments the attempt", async () => {
    const parent = chain({ data: { id: PARENT_ID, brand_id: BRAND_ID, generation_attempt: 2 }, error: null });
    const content = createdRow({ retry_state: "retrying", generation_attempt: 3 });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(parent).mockReturnValueOnce(content);

    const result = await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", imageEngine: ENGINE, retryOfContentId: PARENT_ID });
    expect(result.ok).toBe(true);
    const row = content.upsert.mock.calls[0][0];
    expect(row).toMatchObject({ retry_state: "retrying", generation_attempt: 3, retry_of_content_id: PARENT_ID });
    if (result.ok) expect(result.value.attempt).toBe(3);
  });

  it("denies a retry parent from another brand identically to a missing one", async () => {
    const parentOtherBrand = chain({ data: { id: PARENT_ID, brand_id: OTHER_BRAND_ID, generation_attempt: 1 }, error: null });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(parentOtherBrand);
    const result = await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", imageEngine: ENGINE, retryOfContentId: PARENT_ID });
    expect(result).toEqual({ ok: false, status: 404, error: "Resource not found" });
    expect(from).toHaveBeenCalledTimes(3);
  });

  it("denies a cross-tenant retry parent (not found under the client)", async () => {
    const parentMissing = chain({ data: null, error: null });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(parentMissing);
    const result = await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", imageEngine: ENGINE, retryOfContentId: PARENT_ID });
    expect(result).toEqual({ ok: false, status: 404, error: "Resource not found" });
  });

  it("treats a first attempt as attempt 1 with retry_state none", async () => {
    const content = createdRow();
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(content);
    await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", imageEngine: ENGINE });
    expect(content.upsert.mock.calls[0][0]).toMatchObject({ generation_attempt: 1, retry_state: "none" });
  });
});
