import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getUser, from, rpc, providerFetch } = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), providerFetch: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser } }) }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from, rpc } }));

import { POST } from "@/app/api/content/analyze/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const IMG = "https://res.cloudinary.com/demo/image/upload/v1/post.png";
const CAPTION = { caption_long: "Long.", caption_short: "Short.", hashtags: "#a #b", call_to_action: "Order today." };

function chain(result: unknown) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "eq", "single", "maybeSingle"]) c[m] = vi.fn(() => c);
  c.single = vi.fn(() => Promise.resolve(result));
  return c;
}
const owner = () => chain({ data: { id: CLIENT_ID }, error: null });
const notOwner = () => chain({ data: null, error: null });
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const req = (body: unknown) => new NextRequest("http://localhost/api/content/analyze", { method: "POST", body: JSON.stringify(body) });
const BODY = { clientId: CLIENT_ID, mediaUrl: IMG, mediaType: "image/png", lengthPreference: "short" };
const refunded = () => rpc.mock.calls.some(([fn]) => fn === "refund_credits");

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  vi.stubGlobal("fetch", providerFetch);
  providerFetch.mockReset(); from.mockReset(); rpc.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  // Real deduct_credits success shape (verified live 2026-09-29).
  rpc.mockResolvedValue({ data: { success: true }, error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/content/analyze", () => {
  it("401 unauthenticated: no charge, no provider call", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req(BODY))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("403 for a client the caller does not own: no charge", async () => {
    from.mockReturnValueOnce(notOwner());
    expect((await POST(req(BODY))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("charges 1 credit, returns the caption, never refunds on success", async () => {
    from.mockReturnValueOnce(owner());
    providerFetch.mockResolvedValueOnce(ok(JSON.stringify(CAPTION)));
    const res = await POST(req(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(CAPTION);
    expect(rpc).toHaveBeenCalledWith("deduct_credits", expect.objectContaining({ p_client_id: CLIENT_ID, p_amount: 1 }));
    expect(refunded()).toBe(false);
    // Vision: the image is sent to the model.
    const sent = JSON.parse(providerFetch.mock.calls[0][1].body);
    expect(sent.model).toBe("gpt-4o");
    expect(JSON.stringify(sent.messages)).toContain(IMG);
  });

  it("402 on the REAL failed-deduction shape: no provider call, no refund", async () => {
    from.mockReturnValueOnce(owner());
    rpc.mockResolvedValueOnce({ data: { success: false, error: "Insufficient credits" }, error: null });
    expect((await POST(req(BODY))).status).toBe(402);
    expect(providerFetch).not.toHaveBeenCalled();
    expect(refunded()).toBe(false);
  });

  it("refunds exactly the 1 credit when the provider fails after a real charge", async () => {
    from.mockReturnValueOnce(owner());
    providerFetch.mockResolvedValue(new Response("{}", { status: 400 }));
    expect((await POST(req(BODY))).status).toBe(500);
    expect(rpc).toHaveBeenCalledWith("refund_credits", expect.objectContaining({ p_client_id: CLIENT_ID, p_amount: 1 }));
  });

  it("refunds when the model returns non-JSON (was an unhandled parse after charging)", async () => {
    from.mockReturnValueOnce(owner());
    providerFetch.mockResolvedValueOnce(ok("sorry, I can't"));
    expect((await POST(req(BODY))).status).toBe(500);
    expect(refunded()).toBe(true);
  });

  it("never returns the provider's error text", async () => {
    from.mockReturnValueOnce(owner());
    providerFetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: "org quota detail" } }), { status: 400 }));
    const res = await POST(req(BODY));
    expect(JSON.stringify(await res.json())).not.toContain("quota");
  });

  it.each([
    ["a non-https media URL", { ...BODY, mediaUrl: "http://evil.example/x.png" }],
    ["a non-URL media value", { ...BODY, mediaUrl: "file:///etc/passwd" }],
    ["an oversize brand voice", { ...BODY, brandVoice: "x".repeat(2001) }],
    ["an unknown length preference", { ...BODY, lengthPreference: "novel" }],
  ])("400 for %s, before any charge", async (_l, body) => {
    expect((await POST(req(body))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
