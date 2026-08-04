import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Real request validation (video-execution) is exercised; only auth, the rate
// limiter, and the OpenAI provider are mocked so we can prove that rejected
// paths perform no provider work.
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  consume: vi.fn(),
  openAiChat: vi.fn(),
  openAiSpeech: vi.fn(),
  hasOpenAiKey: vi.fn(),
}));

vi.mock("@/lib/execution-security", () => ({ authenticateExecutionRequest: mocks.authenticate }));
vi.mock("@/lib/execution-rate-limit", () => ({ consumeExecutionRateLimit: mocks.consume }));
vi.mock("@/lib/openai-proxy", () => ({
  openAiChat: mocks.openAiChat,
  openAiSpeech: mocks.openAiSpeech,
  hasOpenAiKey: mocks.hasOpenAiKey,
}));

import { POST as suggestPost } from "@/app/api/video/suggest/route";
import { POST as storyboardPost } from "@/app/api/video/storyboard/route";
import { POST as suggestFramePost } from "@/app/api/video/suggest-frame/route";
import { POST as ttsPost } from "@/app/api/tts/route";

function request(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ALLOWED = { ok: true, allowed: true, remaining: 9, resetAt: new Date(Date.now() + 3600_000).toISOString(), retryAfterSeconds: 3600 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({ ok: true, value: "user-1" });
  mocks.consume.mockResolvedValue(ALLOWED);
  mocks.openAiChat.mockResolvedValue('{"scenes":[]}');
  mocks.openAiSpeech.mockResolvedValue(new ArrayBuffer(8));
  mocks.hasOpenAiKey.mockReturnValue(true);
});

const routes = [
  { name: "suggest", post: suggestPost, url: "http://localhost/api/video/suggest", valid: { userConcept: "a hero shot" }, provider: () => mocks.openAiChat },
  { name: "storyboard", post: storyboardPost, url: "http://localhost/api/video/storyboard", valid: { concept: "escape story" }, provider: () => mocks.openAiChat },
  { name: "suggest-frame", post: suggestFramePost, url: "http://localhost/api/video/suggest-frame", valid: { concept: "a cat" }, provider: () => mocks.openAiChat },
  { name: "tts", post: ttsPost, url: "http://localhost/api/tts", valid: { text: "hello" }, provider: () => mocks.openAiSpeech },
];

for (const route of routes) {
  describe(`${route.name} execution boundary`, () => {
    it("returns 401 before rate limit or provider work", async () => {
      mocks.authenticate.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
      const res = await route.post(request(route.url, route.valid));
      expect(res.status).toBe(401);
      expect(mocks.consume).not.toHaveBeenCalled();
      expect(route.provider()).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid input before rate limit or provider work", async () => {
      const res = await route.post(request(route.url, { evil: true, junk: "x".repeat(9000) }));
      expect(res.status).toBe(400);
      expect(mocks.consume).not.toHaveBeenCalled();
      expect(route.provider()).not.toHaveBeenCalled();
    });

    it("returns 429 when over budget with no provider work", async () => {
      mocks.consume.mockResolvedValue({ ...ALLOWED, allowed: false });
      const res = await route.post(request(route.url, route.valid));
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBeTruthy();
      expect(route.provider()).not.toHaveBeenCalled();
    });

    it("returns 503 (fail-closed) when the limiter backend is unavailable", async () => {
      mocks.consume.mockResolvedValue({ ok: false });
      const res = await route.post(request(route.url, route.valid));
      expect(res.status).toBe(503);
      expect(route.provider()).not.toHaveBeenCalled();
    });

    it("reaches the provider once on a valid authorized request", async () => {
      const res = await route.post(request(route.url, route.valid));
      expect(res.status).toBe(200);
      expect(route.provider()).toHaveBeenCalledTimes(1);
    });
  });
}

describe("suggest fallback safety", () => {
  it("serves a fallback (no provider) when no OpenAI key is configured", async () => {
    mocks.hasOpenAiKey.mockReturnValue(false);
    const res = await suggestPost(request("http://localhost/api/video/suggest", { mode: "ugc" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("suggestion");
    expect(mocks.openAiChat).not.toHaveBeenCalled();
  });
});
