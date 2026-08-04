import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient, getUser, from, rpc, providerFetch, consumeRateLimit } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  providerFetch: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from, rpc } }));
vi.mock("@/lib/assisted-creation-rate-limit", () => ({ consumeAssistedCreationRateLimit: consumeRateLimit }));

import { POST } from "@/app/api/ai/assisted-creation/route";
import {
  parseAssistedCreationRequest,
  parseInspirationImageUrl,
  verifyOwnedInspirationImage,
} from "@/lib/assisted-creation-server";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "22222222-2222-4222-8222-222222222222";
const SUPA = "https://project.supabase.co";
const OWNED_IMG = `${SUPA}/storage/v1/object/public/assets/images/${CLIENT_ID}/ref.png`;
const FOREIGN_IMG = "https://cdn.attacker.example/x.png";

function chain(result: unknown, extra: Record<string, unknown> = {}) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  c.select = vi.fn(() => c); c.eq = vi.fn(() => c); c.maybeSingle = vi.fn(() => Promise.resolve(result));
  c.limit = vi.fn(() => Promise.resolve(result));
  Object.assign(c, extra);
  return c;
}
const clientRow = () => chain({ data: { id: CLIENT_ID, company_name: "Co", industry: "Home", website_url: "https://c.example" }, error: null });
const brandRow = () => chain({ data: { brand_name: "Brand", description: "d", website_url: "https://c.example" }, error: null });

function request(body: unknown, fixture = false) {
  return new NextRequest("http://localhost/api/ai/assisted-creation", {
    method: "POST",
    headers: { "content-type": "application/json", ...(fixture ? { "x-blinkspot-test-fixture": "1" } : {}) },
    body: JSON.stringify(body),
  });
}
const aiConcepts = () => providerFetch.mockResolvedValue(new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify({ concepts: [
    { title: "A", idea: "a", angle: "x", format: "image" },
    { title: "B", idea: "b", angle: "y", format: "image" },
    { title: "C", idea: "c", angle: "z", format: "image" },
  ] }) } }],
}), { status: 200 }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPA);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubGlobal("fetch", providerFetch);
  createServerClient.mockReturnValue({ auth: { getUser } });
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  consumeRateLimit.mockResolvedValue({ ok: true, allowed: true, remaining: 9, resetAt: "", retryAfterSeconds: 3600 });
  rpc.mockResolvedValue({ data: true, error: null });
});

describe("parseInspirationImageUrl", () => {
  it("accepts a bounded https url, treats absent as undefined, rejects the rest", () => {
    expect(parseInspirationImageUrl(undefined)).toBeUndefined();
    expect(parseInspirationImageUrl("")).toBeUndefined();
    expect(parseInspirationImageUrl(null)).toBeUndefined();
    expect(parseInspirationImageUrl(OWNED_IMG)).toBe(OWNED_IMG);
    expect(parseInspirationImageUrl("http://insecure.example/x.png")).toBeNull();
    expect(parseInspirationImageUrl("not a url")).toBeNull();
    expect(parseInspirationImageUrl("https://x.example/" + "a".repeat(2048))).toBeNull();
    expect(parseInspirationImageUrl(123)).toBeNull();
  });
});

describe("parseAssistedCreationRequest — image-driven concepts", () => {
  it("accepts an image-only concepts request (no idea)", () => {
    expect(parseAssistedCreationRequest({ operation: "concepts", brandId: BRAND_ID, inspirationImageUrl: OWNED_IMG }))
      .toEqual({ operation: "concepts", brandId: BRAND_ID, idea: "", inspirationImageUrl: OWNED_IMG });
  });
  it("accepts image + idea together", () => {
    expect(parseAssistedCreationRequest({ operation: "concepts", brandId: BRAND_ID, idea: "warm", inspirationImageUrl: OWNED_IMG }))
      .toMatchObject({ idea: "warm", inspirationImageUrl: OWNED_IMG });
  });
  it("rejects concepts with neither idea nor image, a malformed image, and unknown keys", () => {
    expect(parseAssistedCreationRequest({ operation: "concepts", brandId: BRAND_ID })).toBeNull();
    expect(parseAssistedCreationRequest({ operation: "concepts", brandId: BRAND_ID, inspirationImageUrl: "http://x/y.png" })).toBeNull();
    expect(parseAssistedCreationRequest({ operation: "concepts", brandId: BRAND_ID, idea: "hi", price: 1 })).toBeNull();
  });
  it("still requires an idea for direction (image not accepted there)", () => {
    expect(parseAssistedCreationRequest({ operation: "direction", brandId: BRAND_ID, concept: { title: "t", idea: "i", angle: "a", format: "image" } })).toBeNull();
  });
});

describe("verifyOwnedInspirationImage", () => {
  it("accepts a client-scoped storage path without a DB lookup", async () => {
    expect(await verifyOwnedInspirationImage(CLIENT_ID, OWNED_IMG)).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects another client's scoped path (falls through to content, which is empty)", async () => {
    from.mockReturnValueOnce(chain({ data: [], error: null }));
    const otherClientImg = `${SUPA}/storage/v1/object/public/assets/images/99999999-9999-4999-8999-999999999999/x.png`;
    expect(await verifyOwnedInspirationImage(CLIENT_ID, otherClientImg)).toBe(false);
  });
  it("accepts a url present on the client's own content", async () => {
    from.mockReturnValueOnce(chain({ data: [{ image_urls: ["https://cdn.example/owned.png"] }], error: null }));
    expect(await verifyOwnedInspirationImage(CLIENT_ID, "https://cdn.example/owned.png")).toBe(true);
  });
  it("rejects a foreign url not on any owned content", async () => {
    from.mockReturnValueOnce(chain({ data: [{ image_urls: ["https://cdn.example/owned.png"] }], error: null }));
    expect(await verifyOwnedInspirationImage(CLIENT_ID, FOREIGN_IMG)).toBe(false);
  });
});

describe("route — image-driven concepts billing", () => {
  it("charges exactly one credit, calls vision, and does not refund on success", async () => {
    from.mockReturnValueOnce(clientRow()).mockReturnValueOnce(brandRow());
    aiConcepts();
    const res = await POST(request({ operation: "concepts", brandId: BRAND_ID, inspirationImageUrl: OWNED_IMG, allowedFormats: ["image"] }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("deduct_credits", expect.objectContaining({ p_client_id: CLIENT_ID, p_amount: 1, p_operation: "inspiration_concepts" }));
    // vision message carried the image
    const body = JSON.parse((providerFetch.mock.calls[0][1] as RequestInit).body as string);
    const userMsg = body.messages[1];
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content.some((p: { type: string; image_url?: { url: string } }) => p.type === "image_url" && p.image_url?.url === OWNED_IMG)).toBe(true);
  });

  it("returns 402 and never calls the provider when credits are insufficient", async () => {
    from.mockReturnValueOnce(clientRow()).mockReturnValueOnce(brandRow());
    rpc.mockResolvedValueOnce({ data: false, error: null }); // deduct → insufficient
    const res = await POST(request({ operation: "concepts", brandId: BRAND_ID, inspirationImageUrl: OWNED_IMG, allowedFormats: ["image"] }));
    expect(res.status).toBe(402);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("rejects an unowned image with 400 before any deduct", async () => {
    from.mockReturnValueOnce(clientRow()).mockReturnValueOnce(brandRow()).mockReturnValueOnce(chain({ data: [], error: null })); // content: none
    const res = await POST(request({ operation: "concepts", brandId: BRAND_ID, inspirationImageUrl: FOREIGN_IMG, allowedFormats: ["image"] }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("refunds when the vision call fails", async () => {
    from.mockReturnValueOnce(clientRow()).mockReturnValueOnce(brandRow());
    providerFetch.mockResolvedValue(new Response("err", { status: 500 }));
    const res = await POST(request({ operation: "concepts", brandId: BRAND_ID, inspirationImageUrl: OWNED_IMG, allowedFormats: ["image"] }));
    expect(res.status).toBe(200); // returns a safe fallback set
    expect(rpc).toHaveBeenCalledWith("deduct_credits", expect.anything());
    expect(rpc).toHaveBeenCalledWith("refund_credits", expect.objectContaining({ p_client_id: CLIENT_ID, p_amount: 1 }));
  });

  it("text-only concepts remain free — no deduct or refund", async () => {
    from.mockReturnValueOnce(clientRow()).mockReturnValueOnce(brandRow());
    aiConcepts();
    const res = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: "a warm launch story", allowedFormats: ["image"] }));
    expect(res.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });
});
