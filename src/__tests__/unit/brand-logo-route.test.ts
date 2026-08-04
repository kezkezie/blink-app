import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient, getUser, from, rpc, providerFetch } = vi.hoisted(() => ({
  createServerClient: vi.fn(), getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), providerFetch: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from, rpc } }));

import { PATCH, POST } from "@/app/api/brand/logo/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "22222222-2222-4222-8222-222222222222";

function chain(result: unknown) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  c.select = vi.fn(() => c); c.eq = vi.fn(() => c); c.maybeSingle = vi.fn(() => Promise.resolve(result));
  return c;
}
const clientRow = () => chain({ data: { id: CLIENT_ID, company_name: "Acme Co", industry: "Home", website_url: "https://a.example" }, error: null });
const brandRow = () => chain({ data: { brand_name: "Acme", description: "d", primary_color: "#112233", secondary_color: "#ddeeff" }, error: null });
const brandMissing = () => chain({ data: null, error: null });

function request(body: unknown, method = "POST") {
  return new NextRequest("http://localhost/api/brand/logo", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

// Chain for an .update(...).eq(...).eq(...) that resolves.
function updateChain(result: unknown = { error: null }) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  c.update = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  // second .eq resolves the promise
  let calls = 0;
  c.eq = vi.fn(() => { calls += 1; return calls >= 2 ? Promise.resolve(result) : c; });
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://p.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubGlobal("fetch", providerFetch);
  createServerClient.mockReturnValue({ auth: { getUser } });
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  rpc.mockResolvedValue({ data: true, error: null });
});

describe("POST /api/brand/logo", () => {
  it("401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request({ brandId: BRAND_ID }))).status).toBe(401);
  });

  it("400 for a malformed brandId (no deduct, no provider call)", async () => {
    expect((await POST(request({ brandId: "nope" }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("404 for a brand outside the caller's client, before any charge", async () => {
    from.mockReturnValueOnce(clientRow()).mockReturnValueOnce(brandMissing());
    expect((await POST(request({ brandId: BRAND_ID }))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("402 and no provider call when credits are insufficient", async () => {
    from.mockReturnValueOnce(clientRow()).mockReturnValueOnce(brandRow());
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await POST(request({ brandId: BRAND_ID }))).status).toBe(402);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("charges 6, generates, and returns logo URLs on success (no refund)", async () => {
    from.mockReturnValueOnce(clientRow()).mockReturnValueOnce(brandRow());
    providerFetch.mockResolvedValue(new Response(JSON.stringify({ imageUrls: ["https://cdn.example/logo.png"] }), { status: 200 }));
    const res = await POST(request({ brandId: BRAND_ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ logoUrls: ["https://cdn.example/logo.png"], cost: 6 });
    expect(rpc).toHaveBeenCalledWith("deduct_credits", expect.objectContaining({ p_client_id: CLIENT_ID, p_amount: 6, p_operation: "logo_generation" }));
    // the vision-less logo prompt carried the brand name
    const sent = JSON.parse((providerFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.prompt).toContain('"Acme"');
    expect(sent.model).toBe("ideogram-ai/ideogram-v3-turbo");
    expect(rpc).not.toHaveBeenCalledWith("refund_credits", expect.anything());
  });

  it("refunds and returns 502 when the (gated) n8n logo workflow is unavailable", async () => {
    from.mockReturnValueOnce(clientRow()).mockReturnValueOnce(brandRow());
    providerFetch.mockResolvedValue(new Response("not found", { status: 404 }));
    const res = await POST(request({ brandId: BRAND_ID }));
    expect(res.status).toBe(502);
    expect(rpc).toHaveBeenCalledWith("deduct_credits", expect.anything());
    expect(rpc).toHaveBeenCalledWith("refund_credits", expect.objectContaining({ p_client_id: CLIENT_ID, p_amount: 6 }));
  });

  it("refunds when the provider returns no usable URLs", async () => {
    from.mockReturnValueOnce(clientRow()).mockReturnValueOnce(brandRow());
    providerFetch.mockResolvedValue(new Response(JSON.stringify({ imageUrls: [] }), { status: 200 }));
    const res = await POST(request({ brandId: BRAND_ID }));
    expect(res.status).toBe(502);
    expect(rpc).toHaveBeenCalledWith("refund_credits", expect.anything());
  });
});

describe("PATCH /api/brand/logo — accept/save", () => {
  const LOGO = "https://cdn.example/logo.png";

  it("401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await PATCH(request({ brandId: BRAND_ID, logoUrl: LOGO }, "PATCH"))).status).toBe(401);
  });

  it("400 for a bad brandId or a non-https / oversized logoUrl", async () => {
    expect((await PATCH(request({ brandId: "nope", logoUrl: LOGO }, "PATCH"))).status).toBe(400);
    expect((await PATCH(request({ brandId: BRAND_ID, logoUrl: "http://x/y.png" }, "PATCH"))).status).toBe(400);
    expect((await PATCH(request({ brandId: BRAND_ID, logoUrl: "https://x/" + "a".repeat(2048) }, "PATCH"))).status).toBe(400);
  });

  it("404 for a brand outside the caller's client", async () => {
    from.mockReturnValueOnce(clientRow()).mockReturnValueOnce(brandMissing());
    expect((await PATCH(request({ brandId: BRAND_ID, logoUrl: LOGO }, "PATCH"))).status).toBe(404);
  });

  it("saves the logo to the owned brand (scoped by id + client)", async () => {
    const upd = updateChain({ error: null });
    from.mockReturnValueOnce(clientRow()).mockReturnValueOnce(brandRow()).mockReturnValueOnce(upd);
    const res = await PATCH(request({ brandId: BRAND_ID, logoUrl: LOGO }, "PATCH"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, logoUrl: LOGO });
    expect(upd.update).toHaveBeenCalledWith({ logo_url: LOGO });
    expect(upd.eq).toHaveBeenCalledWith("id", BRAND_ID);
    expect(upd.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });
});
