import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient, getUser, from, providerFetch, consumeRateLimit } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  providerFetch: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from } }));
vi.mock("@/lib/assisted-creation-rate-limit", () => ({
  consumeAssistedCreationRateLimit: consumeRateLimit,
}));

import { POST } from "@/app/api/ai/assisted-creation/route";

const BRAND_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_BRAND_ID = "44444444-4444-4444-8444-444444444444";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const IDEA = "Create a warm launch story for our new blanket.";
const CONCEPT = { id: "concept-1", title: "Homecoming", idea: "Comfort arrives at the end of the day.", angle: "Relief and belonging", format: "video" };
const CONCEPTS = [
  CONCEPT,
  { id: "concept-2", title: "Texture Study", idea: "Soft details become a landscape.", angle: "Sensory desire", format: "image" },
  { id: "concept-3", title: "Three Rituals", idea: "Three pauses reveal everyday comfort.", angle: "Calm aspiration", format: "carousel" },
];
const DIRECTION = {
  visualDirection: "Warm evening light and tactile close-ups.",
  tone: "Intimate and reassuring.",
  composition: "Move from a wide room into blanket detail.",
  outputType: "video",
  style: "cinematic",
  summary: "A quiet homecoming story centered on comfort.",
};

function request(body: unknown, fixture = false) {
  return new NextRequest("http://localhost/api/ai/assisted-creation", {
    method: "POST",
    headers: { "content-type": "application/json", ...(fixture ? { "x-blinkspot-test-fixture": "1" } : {}) },
    body: JSON.stringify(body),
  });
}

function queryResult<T>(result: T) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(result);
  return chain;
}

function canonicalQueries() {
  const clientQuery = queryResult({ data: { id: CLIENT_ID, company_name: "Canonical Company", industry: "Home goods", website_url: "https://canonical.example" }, error: null });
  const brandQuery = queryResult({
    data: {
      brand_name: "Canonical Blankets",
      company_name: "Canonical Company",
      industry: "Home goods",
      description: "Considered blankets for slower evenings.",
      website_url: "https://canonical.example",
      brand_voice: "Warm, clear, never pushy",
      tone_keywords: ["calm", "considered"],
      image_style: "Tactile editorial photography",
      visual_style_guide: "Warm natural light with generous negative space",
      composition_notes: "One clear focal subject",
      primary_color: "#112233",
      secondary_color: "#DDEEFF",
      accent_color: "#AA8844",
      primary_font: "Inter",
      secondary_font: "Cormorant",
      vocabulary_notes: "Prefer comfort over luxury",
      dos: "Show real lived-in rooms",
      donts: "Avoid hard-sell language",
    },
    error: null,
  });
  from.mockReturnValueOnce(clientQuery).mockReturnValueOnce(brandQuery);
  return { clientQuery, brandQuery };
}

function providerResponse(payload: unknown) {
  providerFetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 }));
}

function allowedRateLimit(remaining = 9) {
  return {
    ok: true as const,
    allowed: true,
    remaining,
    resetAt: "2026-07-15T11:00:00.000Z",
    retryAfterSeconds: 3600,
  };
}

function deniedRateLimit() {
  return {
    ok: true as const,
    allowed: false,
    remaining: 0,
    resetAt: "2026-07-15T11:00:00.000Z",
    retryAfterSeconds: 900,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-placeholder");
  // Default runtime: non-production but fixtures NOT authorized (server flag off).
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("BLINKSPOT_TEST_MODE", "");
  vi.stubGlobal("fetch", providerFetch);
  createServerClient.mockReturnValue({ auth: { getUser } });
  getUser.mockResolvedValue({ data: { user: { id: "authenticated-user" } } });
  consumeRateLimit.mockResolvedValue(allowedRateLimit());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assisted creation API boundary", () => {
  it("returns 401 before service-role or provider work when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }));
    expect(response.status).toBe(401);
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("returns 400 for missing brandId and malformed requests", async () => {
    const missing = await POST(request({ operation: "concepts", idea: IDEA }));
    const malformed = await POST(request({ operation: "unknown", brandId: BRAND_ID, idea: IDEA }));
    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied Brand DNA instead of allowing canonical overrides", async () => {
    const response = await POST(request({
      operation: "concepts",
      brandId: BRAND_ID,
      idea: IDEA,
      clientId: "caller-selected-client",
      brandContext: { name: "Fake Brand", primaryColor: "#FFFFFF", tone: "Fake tone" },
    }));
    expect(response.status).toBe(400);
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("allows an authenticated owner and scopes canonical brand lookup by client and brand", async () => {
    const { clientQuery, brandQuery } = canonicalQueries();
    vi.stubEnv("BLINKSPOT_TEST_MODE", "1");
    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }, true));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.concepts).toHaveLength(3);
    expect(body.fallback).toBe(true);
    expect(body.concepts[0].idea).toContain("Canonical Blankets");
    expect(consumeRateLimit).toHaveBeenCalledWith("authenticated-user", "concepts");
    expect(clientQuery.eq).toHaveBeenCalledWith("user_id", "authenticated-user");
    expect(brandQuery.eq).toHaveBeenCalledWith("id", BRAND_ID);
    expect(brandQuery.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("allows concept requests within quota and rejects the next request", async () => {
    canonicalQueries();
    canonicalQueries();
    vi.stubEnv("BLINKSPOT_TEST_MODE", "1");
    consumeRateLimit
      .mockResolvedValueOnce(allowedRateLimit(1))
      .mockResolvedValueOnce(allowedRateLimit(0))
      .mockResolvedValueOnce(deniedRateLimit());

    const first = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }, true));
    const second = await POST(request({ operation: "concepts", brandId: SECOND_BRAND_ID, idea: IDEA }, true));
    const denied = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }, true));
    const body = await denied.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("900");
    expect(denied.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      error: "Too many assisted-creation requests. Please try again later.",
      retryAt: "2026-07-15T11:00:00.000Z",
    });
    expect(consumeRateLimit).toHaveBeenNthCalledWith(1, "authenticated-user", "concepts");
    expect(consumeRateLimit).toHaveBeenNthCalledWith(2, "authenticated-user", "concepts");
    expect(consumeRateLimit).toHaveBeenNthCalledWith(3, "authenticated-user", "concepts");
    expect(from).toHaveBeenCalledTimes(4);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("keeps concept and direction quotas independent", async () => {
    const counts = new Map<string, number>();
    consumeRateLimit.mockImplementation(async (userId: string, operation: "concepts" | "direction") => {
      const key = `${userId}:${operation}`;
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next <= 1 ? allowedRateLimit(0) : deniedRateLimit();
    });
    canonicalQueries();
    canonicalQueries();
    vi.stubEnv("BLINKSPOT_TEST_MODE", "1");

    const conceptAllowed = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }, true));
    const conceptDenied = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }, true));
    const directionAllowed = await POST(request({ operation: "direction", brandId: BRAND_ID, idea: IDEA, concept: CONCEPT }, true));
    const directionDenied = await POST(request({ operation: "direction", brandId: BRAND_ID, idea: IDEA, concept: CONCEPT }, true));

    expect(conceptAllowed.status).toBe(200);
    expect(conceptDenied.status).toBe(429);
    expect(directionAllowed.status).toBe(200);
    expect(directionDenied.status).toBe(429);
    expect(from).toHaveBeenCalledTimes(4);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("keeps authenticated users independent and ignores brand IDs for limiter identity", async () => {
    const counts = new Map<string, number>();
    consumeRateLimit.mockImplementation(async (userId: string, operation: "concepts") => {
      const key = `${userId}:${operation}`;
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next <= 1 ? allowedRateLimit(0) : deniedRateLimit();
    });
    getUser
      .mockResolvedValueOnce({ data: { user: { id: "user-a" } } })
      .mockResolvedValueOnce({ data: { user: { id: "user-b" } } })
      .mockResolvedValueOnce({ data: { user: { id: "user-a" } } });
    canonicalQueries();
    canonicalQueries();
    vi.stubEnv("BLINKSPOT_TEST_MODE", "1");

    const userA = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }, true));
    const userB = await POST(request({ operation: "concepts", brandId: SECOND_BRAND_ID, idea: IDEA }, true));
    const userAChangedBrand = await POST(request({ operation: "concepts", brandId: SECOND_BRAND_ID, idea: IDEA }, true));

    expect(userA.status).toBe(200);
    expect(userB.status).toBe(200);
    expect(userAChangedBrand.status).toBe(429);
    expect(consumeRateLimit.mock.calls).toEqual([
      ["user-a", "concepts"],
      ["user-b", "concepts"],
      ["user-a", "concepts"],
    ]);
    expect(from).toHaveBeenCalledTimes(4);
  });

  it("performs no tenant or provider work when quota is exhausted", async () => {
    consumeRateLimit.mockResolvedValue(deniedRateLimit());
    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }));

    expect(response.status).toBe(429);
    expect(consumeRateLimit).toHaveBeenCalledWith("authenticated-user", "concepts");
    expect(from).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("fails closed without tenant or provider work when the limiter is unavailable", async () => {
    consumeRateLimit.mockResolvedValue({ ok: false });
    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(body).toEqual({ error: "Assisted creation is temporarily unavailable" });
    expect(from).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("denies a brand outside the authenticated tenant without provider work", async () => {
    const clientQuery = queryResult({ data: { id: CLIENT_ID }, error: null });
    const brandQuery = queryResult({ data: null, error: null });
    from.mockReturnValueOnce(clientQuery).mockReturnValueOnce(brandQuery);
    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }));
    expect(response.status).toBe(404);
    expect(brandQuery.eq).toHaveBeenCalledWith("id", BRAND_ID);
    expect(brandQuery.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("builds the AI prompt from canonical server context and preserves exactly three concepts", async () => {
    canonicalQueries();
    providerResponse({ concepts: CONCEPTS });
    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.concepts).toHaveLength(3);
    const providerBody = JSON.parse(String(providerFetch.mock.calls[0][1]?.body));
    const userPrompt = providerBody.messages[1].content;
    expect(userPrompt).toContain("Canonical Blankets");
    expect(userPrompt).toContain("Warm, clear, never pushy");
    expect(userPrompt).toContain("#112233");
    expect(userPrompt).not.toContain("Fake Brand");
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });

  it("preserves the creative-direction response contract", async () => {
    canonicalQueries();
    providerResponse(DIRECTION);
    const response = await POST(request({ operation: "direction", brandId: BRAND_ID, idea: IDEA, concept: CONCEPT }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.direction).toEqual(DIRECTION);
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });

  it("ignores the fixture header in a production runtime and runs the real provider", async () => {
    canonicalQueries();
    providerResponse({ concepts: CONCEPTS });
    // Production runtime WITH the server flag set and the client header present:
    // the fixture must still be ignored and the real provider path must run.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BLINKSPOT_TEST_MODE", "1");

    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }, true));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fallback).toBe(false);
    expect(body.concepts).toHaveLength(3);
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps unauthenticated fixture requests at 401 with no downstream work", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    vi.stubEnv("BLINKSPOT_TEST_MODE", "1");
    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }, true));
    expect(response.status).toBe(401);
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("denies a cross-tenant fixture request instead of returning fixture data", async () => {
    const clientQuery = queryResult({ data: { id: CLIENT_ID }, error: null });
    const brandQuery = queryResult({ data: null, error: null });
    from.mockReturnValueOnce(clientQuery).mockReturnValueOnce(brandQuery);
    vi.stubEnv("BLINKSPOT_TEST_MODE", "1");

    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }, true));

    expect(response.status).toBe(404);
    expect(brandQuery.eq).toHaveBeenCalledWith("id", BRAND_ID);
    expect(brandQuery.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(providerFetch).not.toHaveBeenCalled();
  });
});

describe("assisted format honesty (allowedFormats capability)", () => {
  const IMAGE_CONCEPT = { id: "concept-1", title: "Hero Frame", idea: "One premium hero frame.", angle: "Desire", format: "image" };

  it("accepts allowedFormats [image] and returns three image-only concepts", async () => {
    canonicalQueries();
    vi.stubEnv("BLINKSPOT_TEST_MODE", "1");
    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA, allowedFormats: ["image"] }, true));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.concepts).toHaveLength(3);
    expect(body.concepts.every((concept: { format: string }) => concept.format === "image")).toBe(true);
    expect(new Set(body.concepts.map((concept: { title: string }) => concept.title)).size).toBe(3);
  });

  it("rejects invalid allowedFormats lists before quota, tenant, or provider work", async () => {
    const invalidLists = [
      ["image", "hologram"], // unknown format
      [],                      // empty
      ["image", "image"],     // duplicates
      "image",                 // not an array
      ["image", "video", "carousel", "image"], // over-length + duplicate
    ];
    for (const allowedFormats of invalidLists) {
      const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA, allowedFormats }));
      expect(response.status).toBe(400);
    }
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("still rejects unexpected extra fields alongside allowedFormats", async () => {
    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA, allowedFormats: ["image"], surprise: true }));
    expect(response.status).toBe(400);
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it("filters disallowed AI concepts without relabelling and repairs to three images", async () => {
    canonicalQueries();
    providerResponse({ concepts: CONCEPTS }); // video + image + carousel
    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA, allowedFormats: ["image"] }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.concepts).toHaveLength(3);
    expect(body.concepts.every((concept: { format: string }) => concept.format === "image")).toBe(true);
    const titles = body.concepts.map((concept: { title: string }) => concept.title);
    expect(titles).not.toContain(CONCEPTS[0].title); // video concept dropped, not relabelled
    expect(titles).not.toContain(CONCEPTS[2].title); // carousel concept dropped, not relabelled
    expect(titles).toContain(CONCEPTS[1].title);     // valid image concept kept
    expect(body.fallback).toBe(true);
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });

  it("repairs malformed provider output into three distinct image concepts", async () => {
    canonicalQueries();
    providerFetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "not json at all" } }] }), { status: 200 }));
    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA, allowedFormats: ["image"] }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.concepts).toHaveLength(3);
    expect(body.concepts.every((concept: { format: string }) => concept.format === "image")).toBe(true);
    expect(new Set(body.concepts.map((concept: { title: string }) => concept.title)).size).toBe(3);
    expect(body.fallback).toBe(true);
  });

  it("develops a direction for a valid image concept with an image output type", async () => {
    canonicalQueries();
    providerResponse({ ...DIRECTION, outputType: "image", style: "lifestyle" });
    const response = await POST(request({ operation: "direction", brandId: BRAND_ID, idea: IDEA, concept: IMAGE_CONCEPT, allowedFormats: ["image"] }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.direction.outputType).toBe("image");
    expect(body.fallback).toBe(false);
  });

  it("refuses to develop an unsupported legacy concept into an image direction", async () => {
    // CONCEPT is a video concept — a legacy draft selection under allowedFormats ["image"].
    const response = await POST(request({ operation: "direction", brandId: BRAND_ID, idea: IDEA, concept: CONCEPT, allowedFormats: ["image"] }));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe("unsupported_format");
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("replaces a disallowed provider output type with an image-native fallback direction", async () => {
    canonicalQueries();
    providerResponse(DIRECTION); // provider claims outputType "video"
    const response = await POST(request({ operation: "direction", brandId: BRAND_ID, idea: IDEA, concept: IMAGE_CONCEPT, allowedFormats: ["image"] }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.direction.outputType).toBe("image");
    expect(body.direction.style).toBe("lifestyle"); // image-native fallback, not a relabel of the video direction
    expect(body.direction.visualDirection).not.toBe(DIRECTION.visualDirection);
    expect(body.fallback).toBe(true);
  });

  it("keeps the default contract when allowedFormats is absent", async () => {
    canonicalQueries();
    providerResponse({ concepts: CONCEPTS });
    const response = await POST(request({ operation: "concepts", brandId: BRAND_ID, idea: IDEA }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.concepts.map((concept: { format: string }) => concept.format)).toEqual(["video", "image", "carousel"]);
    expect(body.fallback).toBe(false);
  });
});
