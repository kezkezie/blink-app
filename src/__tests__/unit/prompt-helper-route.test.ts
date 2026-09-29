import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import { POST } from "@/app/api/ai/prompt-helper/route";

const providerFetch = vi.fn();
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const req = (body: unknown) => new NextRequest("http://localhost/api/ai/prompt-helper", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  vi.stubGlobal("fetch", providerFetch);
  providerFetch.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/ai/prompt-helper", () => {
  it("rejects an unauthenticated request with no provider call", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req({ prompt: "a chair" }))).status).toBe(401);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("returns a trimmed concept seed from gpt-4o capped at 80 tokens (by design)", async () => {
    providerFetch.mockResolvedValueOnce(ok("  A walnut chair in morning light.  "));
    const res = await POST(req({ prompt: "our new chair", style: { id: "studio" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestion: "A walnut chair in morning light." });
    const sent = JSON.parse(providerFetch.mock.calls[0][1].body);
    expect(sent.model).toBe("gpt-4o");
    expect(sent.max_tokens).toBe(80);
  });

  it("zero-prompt still works: an empty prompt asks the model to invent a concept", async () => {
    providerFetch.mockResolvedValueOnce(ok("x"));
    expect((await POST(req({ prompt: "" }))).status).toBe(200);
    const sent = JSON.parse(providerFetch.mock.calls[0][1].body);
    expect(sent.messages[1].content).toContain("has not written anything");
  });

  it.each([
    ["non-string prompt", { prompt: 42 }],
    ["oversize prompt", { prompt: "x".repeat(2001) }],
    ["oversize brand description", { prompt: "hi", useBrand: true, brandContext: { name: "B", description: "x".repeat(2001) } }],
    ["unknown mode", { prompt: "hi", mode: "rm -rf" }],
  ])("rejects %s with 400 and no provider call", async (_l, body) => {
    expect((await POST(req(body))).status).toBe(400);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it.each([
    // Image Studio (generate/page.tsx)
    "standard", "grid", "organic_blend", "product_drop",
    // Content detail page (content/[id]/page.tsx GenerationMode)
    "generate", "style_transfer", "gpt_image_2_t2i", "gpt_image_2_i2i",
  ])("accepts the real caller mode %s", async (mode) => {
    providerFetch.mockResolvedValueOnce(ok("x"));
    expect((await POST(req({ prompt: "hi", mode }))).status).toBe(200);
  });

  it("never returns the provider's error text to the client", async () => {
    providerFetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: "org quota secret detail" } }), { status: 400 }));
    const res = await POST(req({ prompt: "hi" }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("quota");
  });
});
