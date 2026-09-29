import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getUser, lookup } = vi.hoisted(() => ({ getUser: vi.fn(), lookup: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser } }) }));
vi.mock("node:dns/promises", () => ({ lookup }));

import { POST } from "@/app/api/brand/autofill/route";

const net = vi.fn();
const req = (body: unknown) => new NextRequest("http://localhost/api/brand/autofill", { method: "POST", body: JSON.stringify(body) });
const EXTRACTED = { brandName: "Acme", companyName: "Acme Ltd", description: "d", industry: "Retail", brandVoice: "v", toneKeywords: ["a", "b"], primaryColor: "#112233", secondaryColor: "nope", accentColor: "#abc", primaryFont: "Inter", secondaryFont: "null" };
const llm = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const isLlmCall = (u: unknown) => String(u).includes("api.openai.com");

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  vi.stubGlobal("fetch", net);
  net.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  lookup.mockImplementation(async (host: string) => {
    const map: Record<string, string> = { "acme.example": "93.184.216.34", "evil.example": "10.0.0.8" };
    if (!map[host]) throw new Error("ENOTFOUND");
    return [{ address: map[host], family: 4 }];
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/brand/autofill", () => {
  it("401 when unauthenticated, no network at all", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req({ website_url: "https://acme.example" }))).status).toBe(401);
    expect(net).not.toHaveBeenCalled();
  });

  it("400 when neither a website nor socials are given", async () => {
    expect((await POST(req({}))).status).toBe(400);
  });

  it.each([
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
    ["localhost", "http://127.0.0.1:3000"],
    ["a host resolving to a private IP", "https://evil.example"],
    ["a file URL", "file:///etc/passwd"],
  ])("SSRF: refuses %s with 400 and makes NO request at all", async (_l, url) => {
    const res = await POST(req({ website_url: url }));
    expect(res.status).toBe(400);
    expect(net).not.toHaveBeenCalled();
  });

  it("scrapes a public site, extracts, and sanitises the model output", async () => {
    net.mockImplementation(async (url: unknown) =>
      isLlmCall(url)
        ? llm(JSON.stringify(EXTRACTED))
        : new Response('<title>Acme</title><style>a{color:#112233;font-family:Inter}</style>', { status: 200 }));
    const res = await POST(req({ website_url: "https://acme.example" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ brandName: "Acme", primaryColor: "#112233", secondaryColor: null, accentColor: "#abc", primaryFont: "Inter", secondaryFont: null });
    // One page fetch + one model call; the page fetch never follows redirects blindly.
    const pageCall = net.mock.calls.find(([u]) => !isLlmCall(u));
    expect(pageCall?.[1]?.redirect).toBe("manual");
    const llmBody = JSON.parse(net.mock.calls.find(([u]) => isLlmCall(u))![1].body);
    expect(llmBody.model).toBe("gpt-4o-mini");
    expect(llmBody.messages[1].content).toContain("#112233");
  });

  it("socials only: no page fetch, still extracts", async () => {
    net.mockResolvedValue(llm(JSON.stringify(EXTRACTED)));
    const res = await POST(req({ social_urls: "https://instagram.com/acme" }));
    expect(res.status).toBe(200);
    expect(net.mock.calls.every(([u]) => isLlmCall(u))).toBe(true);
  });

  it("bounds the inputs before doing anything", async () => {
    expect((await POST(req({ website_url: "https://acme.example/" + "x".repeat(2100) }))).status).toBe(400);
    expect((await POST(req({ social_urls: "x".repeat(4001) }))).status).toBe(400);
    expect(net).not.toHaveBeenCalled();
  });
});
