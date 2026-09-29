import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOpenAiBody, complete, completeJson, LLM_TASKS, resolveTaskConfig, LlmError } from "@/lib/llm";
import { openAiChat } from "@/lib/openai-proxy";

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const fail = (status: number) => new Response("{}", { status });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("llm adapter: configuration", () => {
  it("keeps every task on the model its route used before the adapter (no behaviour change)", () => {
    expect(LLM_TASKS.conceptSeed).toMatchObject({ model: "gpt-4o", maxTokens: 80, temperature: 0.9 });
    expect(LLM_TASKS.assistedCreation.model).toBe("gpt-4o");
    expect(LLM_TASKS.contentAnalyze.model).toBe("gpt-4o");
    expect(LLM_TASKS.brandSuggest.model).toBe("gpt-4o-mini");
    expect(LLM_TASKS.videoHelper.model).toBe("gpt-4o-mini");
  });

  it("per-call overrides win over the task default", () => {
    expect(resolveTaskConfig({ task: "conceptSeed", system: "", user: "", model: "x", maxTokens: 5 }))
      .toMatchObject({ model: "x", maxTokens: 5, temperature: 0.9 });
  });
});

describe("llm adapter: request shape", () => {
  it("sends plain text when there are no images", () => {
    const body = buildOpenAiBody({ task: "videoHelper", system: "S", user: "U" }, resolveTaskConfig({ task: "videoHelper", system: "", user: "" }));
    expect(body.messages[1].content).toBe("U");
    expect(body).not.toHaveProperty("response_format");
  });

  it("sends images as image_url parts after the text", () => {
    const opts = { task: "assistedCreation" as const, system: "S", user: "U", images: [{ url: "https://a/1.png" }], json: true };
    const body = buildOpenAiBody(opts, resolveTaskConfig(opts));
    expect(body.messages[1].content).toEqual([
      { type: "text", text: "U" },
      { type: "image_url", image_url: { url: "https://a/1.png" } },
    ]);
    expect(body.response_format).toEqual({ type: "json_object" });
  });
});

describe("llm adapter: reliability", () => {
  it("makes exactly one call on success", async () => {
    fetchMock.mockResolvedValueOnce(ok("hi"));
    await expect(complete({ task: "videoHelper", system: "s", user: "u" })).resolves.toBe("hi");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a network drop, then succeeds", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(ok("recovered"));
    await expect(complete({ task: "videoHelper", system: "s", user: "u" })).resolves.toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries 429 and 5xx up to 3 attempts, then fails with the status", async () => {
    fetchMock.mockResolvedValue(fail(503));
    const err = await complete({ task: "videoHelper", system: "s", user: "u" }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a permanent 4xx", async () => {
    fetchMock.mockResolvedValue(fail(400));
    await expect(complete({ task: "videoHelper", system: "s", user: "u" })).rejects.toThrow("AI service request failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("makes no provider call when the key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(complete({ task: "videoHelper", system: "s", user: "u" })).rejects.toThrow("AI service unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("completeJson fails loudly on invalid JSON instead of returning a half-object", async () => {
    fetchMock.mockResolvedValueOnce(ok("not json"));
    await expect(completeJson({ task: "videoHelper", system: "s", user: "u" })).rejects.toThrow("invalid JSON");
  });
});

describe("openai-proxy delegates to the adapter without changing its contract", () => {
  it("defaults to gpt-4o-mini and honours jsonObject + model override", async () => {
    fetchMock.mockResolvedValueOnce(ok("{}"));
    await openAiChat({ system: "s", user: "u", jsonObject: true, model: "gpt-4o" });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.model).toBe("gpt-4o");
    expect(sent.response_format).toEqual({ type: "json_object" });

    fetchMock.mockResolvedValueOnce(ok("x"));
    await openAiChat({ system: "s", user: "u" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe("gpt-4o-mini");
  });
});
