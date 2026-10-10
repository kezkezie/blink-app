/**
 * Ask BlinkSpot agent loop: Claude Opus 5.5 with BlinkSpot's own read and propose tools.
 *
 * Provider: Kie (Anthropic Messages format at https://api.kie.ai/anthropic/v1/messages, chosen by
 * Kezie 2026-10-08; 320 credits per 1M input tokens, 1,600 per 1M output). Measured 2026-10-09:
 * 72-82 s for a 10-token reply and 2 of 3 calls past 120 s, so when ANTHROPIC_API_KEY is set the
 * same request goes straight to the Anthropic API instead (same model, same format).
 */
import { ASSISTANT_TOOLS, CANVAS_GUIDE, EDITOR_GUIDE, EDIT_CANVAS_TOOL, EDIT_TIMELINE_TOOL, runAssistantTool, type AssistantAction, type ToolContext } from "./tools";
import type { CanvasSummary } from "@/lib/canvas-ops";
import type { EditorContext } from "./request";

export const ASSISTANT_MODEL = "claude-opus-5-5";
const KIE_MESSAGES_URL = "https://api.kie.ai/anthropic/v1/messages";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MAX_TURNS = 6;
const MAX_TOKENS = 1500;
/** Drawing vectors on the canvas needs room for SVG paths. */
const MAX_TOKENS_CANVAS = 8000;
const CALL_TIMEOUT_MS = 120_000;
/** Don't start another model turn after this much time (the route allows 300 s). */
const TURN_BUDGET_MS = 170_000;

export function assistantProvider(): { name: "anthropic" | "kie"; url: string; headers: Record<string, string> } {
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (anthropic) {
    // A key that is not scoped to a workspace must name one, or Anthropic answers 400.
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
    return {
      name: "anthropic",
      url: ANTHROPIC_MESSAGES_URL,
      headers: { "x-api-key": anthropic, "anthropic-version": "2023-06-01", ...(workspace ? { "anthropic-workspace-id": workspace } : {}) },
    };
  }
  const kie = process.env.KIE_API_TOKEN;
  if (kie) return { name: "kie", url: KIE_MESSAGES_URL, headers: { Authorization: `Bearer ${kie}` } };
  throw new AssistantUnavailableError("The assistant is not configured (set ANTHROPIC_API_KEY or KIE_API_TOKEN).");
}

type TextBlock = { type: "text"; text: string };
type ImageBlock = { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string };
type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock | { type: string; [k: string]: unknown };
export type AgentMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };
type MessagesResponse = {
  content?: ContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string } | string;
};

export class AssistantUnavailableError extends Error {}

export const SYSTEM_PROMPT = `You are Ask BlinkSpot, the creative director inside BlinkSpot, an AI studio where small brands make social images and videos.

How you help:
- Find out what the user wants to make, then get them there in as few steps as possible.
- The brand, balance and prices are given below. Write every prompt or brief in that brand's look and voice. Only call quote_* for something the price sheet does not cover.
- If the user has an inspiration picture (Pinterest, Instagram, a competitor's post) or says "make something like this", send them to Inspo Remix with open_page "inspo": it remakes that design for their brand in one click.
- Long videos are made scene by scene: a story concept becomes 3 to 8 short scenes (about 5 s each), each scene gets a start frame, then the clips are put together in the Video Editor. Use propose_video with style "storytelling" for anything longer than one shot.
- Talk about quality, not model names: Draft (cheap preview), Standard, Cinema (1080p). Say the price when you propose.
- Be quick: when the request is clear, propose in your first reply instead of asking questions.
- You never spend credits and never publish. propose_video, propose_image and open_page give the user a button; they check the price in the studio and press Generate themselves. Say so if they ask you to "just do it".
- If the balance is lower than the price, say so and suggest a shorter or Draft version.

Style: short, warm, plain English. No emoji, no em dashes. Two to five sentences unless the user asks for a plan. When you propose something, say in one line what the button will do and what it costs.`;

function textOf(blocks: ContentBlock[] | undefined) {
  return (blocks ?? []).filter((b): b is TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}

export async function runAssistant(
  history: AgentMessage[],
  ctx: ToolContext & { pageHint?: string; brief?: string; editor?: EditorContext; canvas?: CanvasSummary },
  fetchImpl: typeof fetch = fetch,
): Promise<{ reply: string; actions: AssistantAction[]; usage: { input: number; output: number }; provider: "anthropic" | "kie" }> {
  const provider = assistantProvider();
  const started = Date.now();

  const editor = ctx.editor;
  const system = [
    SYSTEM_PROMPT,
    ctx.brief,
    ctx.pageHint ? `The user is on: ${ctx.pageHint}.` : "",
    editor ? `${EDITOR_GUIDE}\nTimeline (ids, seconds): ${JSON.stringify(editor.timeline)}` : "",
    ctx.canvas ? `${CANVAS_GUIDE}\nCanvas (pixels): ${JSON.stringify({ ...ctx.canvas, preview: undefined })}` : "",
  ].filter(Boolean).join("\n\n");
  const tools = [...ASSISTANT_TOOLS, ...(editor ? [EDIT_TIMELINE_TOOL] : []), ...(ctx.canvas ? [EDIT_CANVAS_TOOL] : [])];
  const toolCtx: ToolContext = { clientId: ctx.clientId, brandId: ctx.brandId, timeline: editor?.timeline, canvas: ctx.canvas };
  const messages: AgentMessage[] = [...history];
  // The canvas preview rides on the latest user message (once), like video frames.
  if (ctx.canvas?.preview) {
    const last = messages[messages.length - 1];
    const text = typeof last.content === "string" ? last.content : "";
    messages[messages.length - 1] = {
      role: "user",
      content: [
        { type: "text", text: `This is the canvas right now (scaled down from ${ctx.canvas.width}×${ctx.canvas.height}). Place things where they read well against the picture:` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: ctx.canvas.preview } },
        { type: "text", text },
      ],
    };
  }
  // Frames ride on the latest user message only, so they cost tokens once.
  if (editor?.frames.length) {
    const last = messages[messages.length - 1];
    const text = typeof last.content === "string" ? last.content : "";
    messages[messages.length - 1] = {
      role: "user",
      content: [
        ...editor.frames.flatMap((f): ContentBlock[] => [
          { type: "text", text: `Frame from clip ${f.clipId} at ${f.t.toFixed(1)} s:` },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data } },
        ]),
        { type: "text", text },
      ],
    };
  }
  const actions: AssistantAction[] = [];
  const usage = { input: 0, output: 0 };
  let reply = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (turn > 0 && Date.now() - started > TURN_BUDGET_MS) break;
    const res = await fetchImpl(provider.url, {
      method: "POST",
      headers: { ...provider.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ model: ASSISTANT_MODEL, max_tokens: ctx.canvas ? MAX_TOKENS_CANVAS : MAX_TOKENS, system, tools, messages, stream: false }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as MessagesResponse;
    if (!res.ok || !Array.isArray(data.content)) {
      const detail = typeof data.error === "string" ? data.error : data.error?.message;
      throw new Error(`Assistant model error (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    usage.input += data.usage?.input_tokens ?? 0;
    usage.output += data.usage?.output_tokens ?? 0;
    const text = textOf(data.content);
    if (text) reply = text;

    const calls = data.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (data.stop_reason !== "tool_use" || calls.length === 0) break;

    messages.push({ role: "assistant", content: data.content });
    const results: ToolResultBlock[] = [];
    for (const call of calls) {
      const out = await runAssistantTool(call.name, call.input ?? {}, toolCtx).catch(() => ({ content: "That lookup failed. Carry on without it.", action: undefined }));
      if (out.action && actions.length < 4) actions.push(out.action);
      results.push({ type: "tool_result", tool_use_id: call.id, content: out.content });
    }
    messages.push({ role: "user", content: results });
  }

  return { reply: reply || (actions.length ? "Here you go." : "Sorry, I could not finish that. Try asking again."), actions, usage, provider: provider.name };
}
