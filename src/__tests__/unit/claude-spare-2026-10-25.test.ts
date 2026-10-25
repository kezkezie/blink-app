import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: {} }));

import { OPENROUTER_MESSAGES_URL, claudeFetch, openRouterModel } from "@/lib/assistant/agent";

const anthropic = { name: "anthropic", url: "https://api.anthropic.com/v1/messages", headers: { "x-api-key": "sk-ant-test", "anthropic-version": "2023-06-01" } };
const init = (extra: Partial<RequestInit> = {}): RequestInit => ({
  method: "POST", headers: { ...anthropic.headers, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "claude-opus-5-5", max_tokens: 10, messages: [{ role: "user", content: "hi" }] }), ...extra,
});
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Claude with OpenRouter as the spare (2026-10-25)", () => {
  beforeEach(() => { process.env.OPENROUTER_API_KEY = "sk-or-test"; vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { delete process.env.OPENROUTER_API_KEY; vi.restoreAllMocks(); });

  it("names the same models the OpenRouter way", () => {
    expect(openRouterModel("claude-opus-5-5")).toBe("anthropic/claude-opus-5.5");
    expect(openRouterModel("claude-sonnet-5-5")).toBe("anthropic/claude-sonnet-5.5");
    expect(openRouterModel("claude-haiku-5-5")).toBe("anthropic/claude-haiku-5.5");
    expect(openRouterModel("claude-opus-5")).toBe("anthropic/claude-opus-5");
  });

  it("uses Anthropic when it answers", async () => {
    const f = vi.fn(async () => reply(200, { content: [] }));
    const r = await claudeFetch(anthropic, init(), f as unknown as typeof fetch);
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("goes to OpenRouter, same model, when Anthropic is down", async () => {
    for (const down of [500, 529]) {
      const f = vi.fn(async (url: string) => (url === OPENROUTER_MESSAGES_URL ? reply(200, { content: [{ type: "text", text: "ok" }] }) : reply(down)));
      const r = await claudeFetch(anthropic, init(), f as unknown as typeof fetch);
      expect(r.status).toBe(200);
      const [url, second] = f.mock.calls[1] as unknown as [string, RequestInit];
      expect(url).toBe(OPENROUTER_MESSAGES_URL);
      const h = second.headers as Record<string, string>;
      expect(h.Authorization).toBe("Bearer sk-or-test");
      expect(h["x-api-key"]).toBeUndefined();
      expect(JSON.parse(second.body as string).model).toBe("anthropic/claude-opus-5.5");
    }
  });

  it("goes to OpenRouter when the monthly spend cap is reached, not for an ordinary rate limit", async () => {
    const capped = vi.fn(async (url: string) => (url === OPENROUTER_MESSAGES_URL ? reply(200) : reply(429, { type: "error", error: { type: "rate_limit_error", details: { error_code: "enforced_spend_limit_reached" } } })));
    await claudeFetch(anthropic, init(), capped as unknown as typeof fetch);
    expect(capped).toHaveBeenCalledTimes(2);
    const limited = vi.fn(async () => reply(429, { type: "error", error: { type: "rate_limit_error", message: "Too many requests" } }));
    expect((await claudeFetch(anthropic, init(), limited as unknown as typeof fetch)).status).toBe(429);
    expect(limited).toHaveBeenCalledTimes(1);
  });

  it("doesn't send bad requests twice, or retry when our own time ran out", async () => {
    const bad = vi.fn(async () => reply(400));
    expect((await claudeFetch(anthropic, init(), bad as unknown as typeof fetch)).status).toBe(400);
    expect(bad).toHaveBeenCalledTimes(1);
    const ac = new AbortController(); ac.abort();
    const timedOut = vi.fn(async () => { throw new Error("aborted"); });
    await expect(claudeFetch(anthropic, init({ signal: ac.signal }), timedOut as unknown as typeof fetch)).rejects.toThrow("aborted");
    expect(timedOut).toHaveBeenCalledTimes(1);
  });

  it("tries OpenRouter when Anthropic can't be reached at all", async () => {
    const f = vi.fn(async (url: string) => { if (url !== OPENROUTER_MESSAGES_URL) throw new TypeError("fetch failed"); return reply(200); });
    expect((await claudeFetch(anthropic, init(), f as unknown as typeof fetch)).status).toBe(200);
  });

  it("does nothing different without an OpenRouter key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const f = vi.fn(async () => reply(529));
    expect((await claudeFetch(anthropic, init(), f as unknown as typeof fetch)).status).toBe(529);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
