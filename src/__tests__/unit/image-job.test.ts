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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("parseImageJobRequest", () => {
  it("accepts a minimal valid request", () => {
    expect(parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, mode: "standard" })).toEqual({
      brandId: BRAND_ID,
      idempotencyKey: KEY,
      mode: "standard",
    });
  });

  it("accepts aspect ratio and retry parent", () => {
    expect(
      parseImageJobRequest({
        brand_id: BRAND_ID,
        idempotency_key: KEY,
        mode: "grid",
        aspect_ratio: "9:16",
        retry_of_content_id: PARENT_ID,
      }),
    ).toEqual({ brandId: BRAND_ID, idempotencyKey: KEY, mode: "grid", aspectRatio: "9:16", retryOfContentId: PARENT_ID });
  });

  it("rejects unknown keys, bad ids, short keys, and unknown enums", () => {
    expect(parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, mode: "standard", hidden: 1 })).toBeNull();
    expect(parseImageJobRequest({ brand_id: "not-a-uuid", idempotency_key: KEY, mode: "standard" })).toBeNull();
    expect(parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: "short", mode: "standard" })).toBeNull();
    expect(parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, mode: "hidden_mode" })).toBeNull();
    expect(parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, mode: "standard", aspect_ratio: "5:5" })).toBeNull();
    expect(parseImageJobRequest({ brand_id: BRAND_ID, idempotency_key: KEY, mode: "standard", retry_of_content_id: "x" })).toBeNull();
    expect(parseImageJobRequest("nope")).toBeNull();
  });
});

describe("createImageJobPlaceholder — ownership and creation", () => {
  it("creates one brand-scoped placeholder with verified ids and valid initial states", async () => {
    const content = chain({ data: { id: NEW_ID, generation_state: "queued", billing_state: "not_charged", retry_state: "none", generation_attempt: 1 }, error: null });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(content);

    const result = await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", aspectRatio: "4:5" });

    expect(result).toEqual({
      ok: true,
      value: { id: NEW_ID, generationState: "queued", billingState: "not_charged", retryState: "none", attempt: 1, idempotent: false },
    });
    // Stored row uses the server-verified client id, never a caller value.
    const [row, options] = content.upsert.mock.calls[0];
    expect(row).toMatchObject({
      client_id: CLIENT_ID,
      brand_id: BRAND_ID,
      generation_state: "queued",
      billing_state: "not_charged",
      retry_state: "none",
      generation_attempt: 1,
      generation_idempotency_key: KEY,
      creation_metadata_version: 1,
      creation_metadata: { operation: "standard", mode: "standard", aspect_ratio: "4:5" },
    });
    expect(row.retry_of_content_id).toBeUndefined();
    expect(options).toEqual({ onConflict: "client_id,generation_idempotency_key", ignoreDuplicates: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("denies a brand outside the authenticated client without writing content", async () => {
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandMissing());
    const result = await createImageJobPlaceholder(USER_ID, { brandId: OTHER_BRAND_ID, idempotencyKey: KEY, mode: "standard" });
    expect(result).toEqual({ ok: false, status: 404, error: "Resource not found" });
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("returns 404 when the authenticated user has no client", async () => {
    from.mockReturnValueOnce(clientMissing());
    const result = await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard" });
    expect(result).toEqual({ ok: false, status: 404, error: "Resource not found" });
    expect(from).toHaveBeenCalledTimes(1);
  });
});

describe("createImageJobPlaceholder — idempotency", () => {
  it("returns the existing placeholder when the key conflicts (durable, not memory)", async () => {
    const upsertConflict = chain({ data: null, error: null }); // ON CONFLICT DO NOTHING → no row
    const existing = chain({ data: { id: NEW_ID, generation_state: "queued", billing_state: "not_charged", retry_state: "none", generation_attempt: 1 }, error: null });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(upsertConflict).mockReturnValueOnce(existing);

    const result = await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard" });
    expect(result).toEqual({
      ok: true,
      value: { id: NEW_ID, generationState: "queued", billingState: "not_charged", retryState: "none", attempt: 1, idempotent: true },
    });
    expect(existing.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(existing.eq).toHaveBeenCalledWith("generation_idempotency_key", KEY);
  });

  it("scopes uniqueness to the client so different clients can reuse a textual key", async () => {
    const contentA = chain({ data: { id: NEW_ID, generation_state: "queued", billing_state: "not_charged", retry_state: "none", generation_attempt: 1 }, error: null });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(contentA);
    await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard" });
    expect(contentA.upsert.mock.calls[0][1]).toEqual({ onConflict: "client_id,generation_idempotency_key", ignoreDuplicates: true });

    const OTHER_CLIENT = "99999999-9999-4999-8999-999999999999";
    const clientB = chain({ data: { id: OTHER_CLIENT }, error: null });
    const contentB = chain({ data: { id: "66666666-6666-4666-8666-666666666666", generation_state: "queued", billing_state: "not_charged", retry_state: "none", generation_attempt: 1 }, error: null });
    from.mockReturnValueOnce(clientB).mockReturnValueOnce(brandOk()).mockReturnValueOnce(contentB);
    const resultB = await createImageJobPlaceholder("user-2", { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard" });
    expect(resultB.ok).toBe(true);
    expect(contentB.upsert.mock.calls[0][0].client_id).toBe(OTHER_CLIENT);
  });
});

describe("createImageJobPlaceholder — retry lineage", () => {
  it("accepts a same-client, same-brand parent and increments the attempt", async () => {
    const parent = chain({ data: { id: PARENT_ID, brand_id: BRAND_ID, generation_attempt: 2 }, error: null });
    const content = chain({ data: { id: NEW_ID, generation_state: "queued", billing_state: "not_charged", retry_state: "retrying", generation_attempt: 3 }, error: null });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(parent).mockReturnValueOnce(content);

    const result = await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", retryOfContentId: PARENT_ID });
    expect(result.ok).toBe(true);
    const row = content.upsert.mock.calls[0][0];
    expect(row).toMatchObject({ retry_state: "retrying", generation_attempt: 3, retry_of_content_id: PARENT_ID });
    if (result.ok) expect(result.value.attempt).toBe(3);
  });

  it("denies a retry parent from another brand identically to a missing one", async () => {
    const parentOtherBrand = chain({ data: { id: PARENT_ID, brand_id: OTHER_BRAND_ID, generation_attempt: 1 }, error: null });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(parentOtherBrand);
    const result = await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", retryOfContentId: PARENT_ID });
    expect(result).toEqual({ ok: false, status: 404, error: "Resource not found" });
    // No content write occurred: clients, brand_profiles, parent — three reads only.
    expect(from).toHaveBeenCalledTimes(3);
  });

  it("denies a cross-tenant retry parent (not found under the client)", async () => {
    const parentMissing = chain({ data: null, error: null });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(parentMissing);
    const result = await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard", retryOfContentId: PARENT_ID });
    expect(result).toEqual({ ok: false, status: 404, error: "Resource not found" });
  });

  it("treats a first attempt as attempt 1 with retry_state none", async () => {
    const content = chain({ data: { id: NEW_ID, generation_state: "queued", billing_state: "not_charged", retry_state: "none", generation_attempt: 1 }, error: null });
    from.mockReturnValueOnce(clientOk()).mockReturnValueOnce(brandOk()).mockReturnValueOnce(content);
    await createImageJobPlaceholder(USER_ID, { brandId: BRAND_ID, idempotencyKey: KEY, mode: "standard" });
    expect(content.upsert.mock.calls[0][0]).toMatchObject({ generation_attempt: 1, retry_state: "none" });
  });
});
