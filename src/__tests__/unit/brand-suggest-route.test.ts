import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import { POST } from "@/app/api/brand/suggest/route";

const providerFetch = vi.fn();
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const req = (body: unknown) => new NextRequest("http://localhost/api/brand/suggest", { method: "POST", body: JSON.stringify(body) });
const VALID = { companyName: "Nuf Farms", industry: "Agriculture", context: "tagline" };

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  vi.stubGlobal("fetch", providerFetch);
  providerFetch.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/brand/suggest", () => {
  it("rejects an unauthenticated request with no provider call", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req(VALID));
    expect(res.status).toBe(401);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("returns the trimmed suggestion using gpt-4o-mini", async () => {
    providerFetch.mockResolvedValueOnce(ok("  Fresh from Nairobi, every week.  "));
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestion: "Fresh from Nairobi, every week." });
    expect(providerFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(providerFetch.mock.calls[0][1].body).model).toBe("gpt-4o-mini");
  });

  it.each([
    ["missing company name", { ...VALID, companyName: undefined }],
    ["non-string industry", { ...VALID, industry: 42 }],
    ["oversize context", { ...VALID, context: "x".repeat(501) }],
    ["oversize company name", { ...VALID, companyName: "x".repeat(201) }],
  ])("rejects %s with 400 and no provider call", async (_label, body) => {
    const res = await POST(req(body));
    expect(res.status).toBe(400);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("never leaks the provider's error message to the client", async () => {
    providerFetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: "internal org quota detail" } }), { status: 400 }));
    const res = await POST(req(VALID));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("quota");
  });
});
