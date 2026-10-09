import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from } }));

import { AssistantUnavailableError, runAssistant } from "@/lib/assistant/agent";
import { parseAssistantRequest } from "@/lib/assistant/request";
import { ASSISTANT_TOOLS, priceSheet, quoteVideo, runAssistantTool, VIDEO_QUALITY } from "@/lib/assistant/tools";
import { estimateVideoCredits } from "@/lib/video-model-registry";

const ctx = { clientId: "c1", brandId: "b1" };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("Ask BlinkSpot request parsing", () => {
  it("accepts plain user/assistant text ending with the user", () => {
    const p = parseAssistantRequest({ messages: [{ role: "user", text: "hi" }, { role: "assistant", text: "hello" }, { role: "user", text: "make a video" }], brandId: "6f1c2a3b-1d2e-4f5a-8b9c-0d1e2f3a4b5c", page: "/studio/video" });
    expect(p?.messages).toHaveLength(3);
    expect(p?.brandId).toBe("6f1c2a3b-1d2e-4f5a-8b9c-0d1e2f3a4b5c");
    expect(p?.page).toBe("/studio/video");
  });
  it("rejects tool traffic, other roles, empty or oversized input", () => {
    expect(parseAssistantRequest({ messages: [{ role: "system", text: "x" }] })).toBeNull();
    expect(parseAssistantRequest({ messages: [{ role: "user", content: [{ type: "tool_result" }] }] })).toBeNull();
    expect(parseAssistantRequest({ messages: [{ role: "user", text: "   " }] })).toBeNull();
    expect(parseAssistantRequest({ messages: [{ role: "user", text: "x".repeat(4001) }] })).toBeNull();
    expect(parseAssistantRequest({ messages: [{ role: "user", text: "a" }, { role: "assistant", text: "b" }] })).toBeNull();
    expect(parseAssistantRequest({ messages: Array.from({ length: 21 }, () => ({ role: "user", text: "a" })) })).toBeNull();
  });
  it("drops a brand id that is not a uuid and a page outside the studio", () => {
    const p = parseAssistantRequest({ messages: [{ role: "user", text: "hi" }], brandId: "'; drop", page: "https://evil" });
    expect(p?.brandId).toBeNull();
    expect(p?.page).toBeUndefined();
  });
  it("starts the conversation with the user", () => {
    const p = parseAssistantRequest({ messages: [{ role: "assistant", text: "welcome" }, { role: "user", text: "hi" }] });
    expect(p?.messages.map((m) => m.role)).toEqual(["user"]);
  });
});

describe("Ask BlinkSpot tools", () => {
  it("prices video with the same registry the studio and n8n use", () => {
    for (const q of Object.keys(VIDEO_QUALITY) as Array<keyof typeof VIDEO_QUALITY>) {
      expect(quoteVideo(q, 10, "showcase").credits).toBe(estimateVideoCredits(VIDEO_QUALITY[q].model, 10, { videoMode: "showcase", hasStartFrame: true }));
    }
    expect(quoteVideo("cinema", 5, "showcase").credits).toBe(790); // Seedance 2.5 1080p at 158/s
  });
  it("proposes a long video as a link into the scene planner, never a spend", async () => {
    const r = await runAssistantTool("propose_video", { style: "storytelling", brief: "farm to plate", seconds: 20, quality: "standard" }, ctx);
    expect(r.action?.kind).toBe("open_video_studio");
    const url = new URL(r.action!.href!, "https://x");
    expect(url.pathname).toBe("/studio/video");
    expect(url.searchParams.get("mode")).toBe("storytelling");
    expect(url.searchParams.get("brief")).toBe("farm to plate");
    // 4 scenes of 5 s: the clips plus one start frame (18) each
    expect(r.action!.estimatedCredits).toBe(quoteVideo("standard", 20, "storytelling").credits + 4 * 18);
    expect(r.content).toMatch(/Nothing has been spent/);
    expect(from).not.toHaveBeenCalled();
  });
  it("clamps and whitelists model input", async () => {
    const r = await runAssistantTool("propose_video", { style: "hack", brief: "x", seconds: 9999, aspect_ratio: "7:3", quality: "ultra" }, ctx);
    const url = new URL(r.action!.href!, "https://x");
    expect(url.searchParams.get("mode")).toBe("storytelling");
    expect(url.searchParams.get("aspect")).toBe("16:9");
    expect(r.action!.note).toMatch(/120s/);
    expect((await runAssistantTool("open_page", { page: "../admin" }, ctx)).action?.href).toBe("/studio/library");
  });
  it("scopes library reads to the signed-in client and open brand", async () => {
    const calls: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "order", "limit", "in"]) chain[m] = (...a: unknown[]) => { calls.push([m, a]); return chain; };
    (chain as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: [{ id: "1", caption: "x".repeat(300), content_type: "reel", status: "draft", created_at: "2026-10-01" }] });
    from.mockReturnValueOnce(chain);
    const r = await runAssistantTool("list_library", { kind: "video" }, ctx);
    expect(calls).toContainEqual(["eq", ["client_id", "c1"]]);
    expect(calls).toContainEqual(["eq", ["brand_id", "b1"]]);
    expect(JSON.parse(r.content)[0].caption).toHaveLength(140);
  });
  it("gives the model a price sheet from the live registry so it can propose without extra turns", () => {
    const sheet = priceSheet();
    expect(sheet).toContain(`5s: draft ${quoteVideo("draft", 5, "showcase").credits}, standard ${quoteVideo("standard", 5, "showcase").credits}, cinema 790`);
    expect(sheet).toContain("nb2 18");
  });

  it("declares every tool with a JSON schema", () => {
    for (const t of ASSISTANT_TOOLS) expect(t.input_schema.type).toBe("object");
  });
});

describe("Ask BlinkSpot agent loop", () => {
  const env = { kie: process.env.KIE_API_TOKEN, anthropic: process.env.ANTHROPIC_API_KEY };
  beforeEach(() => { process.env.KIE_API_TOKEN = "test-key"; delete process.env.ANTHROPIC_API_KEY; });
  afterEach(() => {
    if (env.kie === undefined) delete process.env.KIE_API_TOKEN; else process.env.KIE_API_TOKEN = env.kie;
    if (env.anthropic === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = env.anthropic;
  });

  it("is unavailable, not crashing, without a key", async () => {
    delete process.env.KIE_API_TOKEN;
    await expect(runAssistant([{ role: "user", content: "hi" }], ctx, vi.fn())).rejects.toBeInstanceOf(AssistantUnavailableError);
  });

  it("names the workspace for keys that are not scoped to one", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_test";
    const fetchImpl = vi.fn().mockResolvedValue(ok({ stop_reason: "end_turn", content: [{ type: "text", text: "hi" }] }));
    await runAssistant([{ role: "user", content: "hi" }], ctx, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls[0][1].headers["anthropic-workspace-id"]).toBe("wrkspc_test");
    delete process.env.ANTHROPIC_WORKSPACE_ID;
  });

  it("goes straight to Anthropic when an Anthropic key is set (same model and format)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchImpl = vi.fn().mockResolvedValue(ok({ stop_reason: "end_turn", content: [{ type: "text", text: "hi" }] }));
    const out = await runAssistant([{ role: "user", content: "hi" }], ctx, fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("sk-ant-test");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers["anthropic-workspace-id"]).toBeUndefined();
    expect(JSON.parse(init.body).model).toBe("claude-opus-5-5");
    expect(out.provider).toBe("anthropic");
  });

  it("runs tools, feeds results back and returns the reply plus proposed actions", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok({ stop_reason: "tool_use", usage: { input_tokens: 100, output_tokens: 20 }, content: [
        { type: "text", text: "Let me set that up." },
        { type: "tool_use", id: "t1", name: "propose_image", input: { idea: "launch poster", engine: "nb2" } },
      ] }))
      .mockResolvedValueOnce(ok({ stop_reason: "end_turn", usage: { input_tokens: 150, output_tokens: 30 }, content: [{ type: "text", text: "The button opens Image Studio. About 18 credits." }] }));
    const out = await runAssistant([{ role: "user", content: "poster please" }], { ...ctx, brief: "Active brand: KYRA", pageHint: "/studio" }, fetchImpl as unknown as typeof fetch);
    expect(out.reply).toBe("The button opens Image Studio. About 18 credits.");
    expect(out.actions).toHaveLength(1);
    expect(out.actions[0].href).toMatch(/^\/studio\/image\?prompt=launch\+poster/);
    expect(out.usage).toEqual({ input: 250, output: 50 });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.kie.ai/anthropic/v1/messages");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.system).toContain("Active brand: KYRA");
    expect(body.system).toContain("The user is on: /studio.");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const second = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(second.messages.at(-1)).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: expect.stringMatching(/Nothing has been spent/) }] });
  });

  it("in the editor: sends the timeline and frames, offers edit_timeline, returns an Apply action", async () => {
    const timeline = { length: 10, video: [{ id: "a", name: "Pour", type: "video" as const, start: 0, from: 0, to: 5, sourceLength: 8, row: 0 }, { id: "b", name: "Pack", type: "video" as const, start: 5, from: 0, to: 5, sourceLength: 6, row: 0 }], audio: [], text: [], library: [] };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "edit_timeline", input: { summary: "Pack first, tighter", ops: [{ op: "sequence", clipIds: ["b", "a"] }, { op: "trim", clipId: "a", from: 1, to: 3 }] } }] }))
      .mockResolvedValueOnce(ok({ stop_reason: "end_turn", content: [{ type: "text", text: "Opened on the pack, trimmed the pour." }] }));
    const out = await runAssistant([{ role: "user", content: "make it punchier" }], { ...ctx, editor: { timeline, frames: [{ clipId: "a", t: 2, data: "QUJD" }] } }, fetchImpl as unknown as typeof fetch);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.tools.map((t: { name: string }) => t.name)).toContain("edit_timeline");
    expect(body.system).toContain('"id":"a"');
    const last = body.messages.at(-1);
    expect(last.content[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
    expect(last.content.at(-1)).toEqual({ type: "text", text: "make it punchier" });
    expect(out.actions[0]).toMatchObject({ kind: "apply_edit", changes: ["Order: Pack → Pour", "Trim Pour to 1–3 s"] });
  });

  it("does not offer edit_timeline outside the editor", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ stop_reason: "end_turn", content: [{ type: "text", text: "hi" }] }));
    await runAssistant([{ role: "user", content: "hi" }], ctx, fetchImpl as unknown as typeof fetch);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).tools.map((t: { name: string }) => t.name)).not.toContain("edit_timeline");
  });

  it("surfaces a model error instead of an empty answer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }));
    await expect(runAssistant([{ role: "user", content: "hi" }], ctx, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/429.*rate limited/);
  });

  it("stops after a bounded number of tool turns", async () => {
    const loop = () => ok({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "open_page", input: { page: "plan" } }] });
    const fetchImpl = vi.fn().mockImplementation(async () => loop());
    const out = await runAssistant([{ role: "user", content: "hi" }], ctx, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(out.actions.length).toBeLessThanOrEqual(4);
  });
});
