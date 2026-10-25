/**
 * Ask BlinkSpot agent loop: Claude (Sonnet 5.5 for chat, Opus 5.5 for canvas and timeline edits)
 * with BlinkSpot's own read and propose tools.
 *
 * Provider: Kie (Anthropic Messages format at https://api.kie.ai/anthropic/v1/messages, chosen by
 * Kezie 2026-10-08; 320 credits per 1M input tokens, 1,600 per 1M output). Measured 2026-10-09:
 * 72-82 s for a 10-token reply and 2 of 3 calls past 120 s, so when ANTHROPIC_API_KEY is set the
 * same request goes straight to the Anthropic API instead (same model, same format).
 */
import { ASSISTANT_TOOLS, CANVAS_GUIDE, EDITOR_GUIDE, EDIT_CANVAS_TOOL, EDIT_TIMELINE_TOOL, USE_SKILL_TOOL, runAssistantTool, type AssistantAction, type ToolContext } from "./tools";
import { CREATE_BRAND_TOOL, UPDATE_BRAND_TOOL, UPDATE_POSTS_TOOL } from "./actions";
import { BUILTIN_SKILLS, skillIndex, type Skill } from "./skills";
import type { CanvasSummary } from "@/lib/canvas-ops";
import type { EditorContext } from "./request";
import { EFFORT_INFO, type Effort } from "./effort";

export const ASSISTANT_MODEL = "claude-opus-5-5";
/**
 * Plain chat (ideas, how-to, proposing a generation) goes to Sonnet 5.5: half Opus's price
 * ($2/$10 per MTok vs $4/$20) and faster. Editing a canvas or a timeline, where the model has to
 * look at pictures and place things precisely, stays on Opus 5.5. Kie only serves Opus here.
 * Override with ASSISTANT_CHAT_MODEL (e.g. "claude-opus-5-5" to put everything back on Opus).
 */
export const ASSISTANT_CHAT_MODEL = "claude-sonnet-5-5";
export function assistantModelFor(kind: "chat" | "canvas" | "editor", provider: "anthropic" | "kie"): string {
  if (provider === "kie" || kind !== "chat") return ASSISTANT_MODEL;
  const env = process.env.ASSISTANT_CHAT_MODEL;
  return env && /^claude-[a-z0-9-]{3,40}$/.test(env) ? env : ASSISTANT_CHAT_MODEL;
}
/** List prices, USD per million tokens, for the cost line in the logs. */
const PRICE: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  // Cache reads are $0.20 on Sonnet 5.5 too (was logged at $0.10 until 2026-10-25).
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  // For simple steps if they move to Haiku (prompts up to 100K tokens; $0.50 / $2.50 beyond).
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
export function estimateUsd(model: string, u: { input: number; output: number; cacheRead?: number; cacheWrite?: number }) {
  const p = PRICE[model];
  if (!p) return null;
  return (u.input * p.in + u.output * p.out + (u.cacheRead ?? 0) * p.cacheRead + (u.cacheWrite ?? 0) * p.cacheWrite) / 1_000_000;
}
const KIE_MESSAGES_URL = "https://api.kie.ai/anthropic/v1/messages";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MAX_TURNS = 6;
// Reply budgets are per effort level (effort.ts). A posting plan for 20 posts is ~1,500 tokens on its own.
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

/**
 * Claude with a spare (Kezie, 2026-10-25): every Claude call goes to Anthropic first. If Anthropic is
 * down (5xx, 529 overloaded, no connection) or the account's monthly spend cap is reached (a 429
 * saying so), the same request goes once to the same model through OpenRouter's Anthropic-compatible
 * endpoint (same per-token price; OpenRouter takes 5.5% when its credit is bought). Ordinary rate
 * limits and bad requests are not sent there: they would fail the same way or be paid twice. Our
 * own time limit running out isn't either.
 */
export const OPENROUTER_MESSAGES_URL = "https://openrouter.ai/api/v1/messages";
/** claude-opus-5-5 → anthropic/claude-opus-5.5 (OpenRouter's names). */
export const openRouterModel = (model: string) => `anthropic/${model.replace(/^(claude-[a-z]+)-(\d+)-(\d+)$/, "$1-$2.$3")}`;

export async function claudeFetch(provider: { name: string; url: string; headers: Record<string, string> }, init: RequestInit, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const spare = process.env.OPENROUTER_API_KEY;
  const ownTimeUp = () => !!init.signal?.aborted;
  let first: Response | null = null, failure: unknown = null;
  try { first = await fetchImpl(provider.url, init); } catch (e) { failure = e; }
  if (provider.name !== "anthropic" || !spare || typeof init.body !== "string") {
    if (first) return first;
    throw failure;
  }
  let why = "";
  if (!first) why = ownTimeUp() ? "" : "no connection";
  else if (first.status >= 500) why = `anthropic ${first.status}`;
  else if (first.status === 429) {
    const text = await first.clone().text().catch(() => "");
    if (/enforced_spend_limit_reached|usage limits/i.test(text)) why = "anthropic spend cap";
  }
  if (!why) { if (first) return first; throw failure; }
  let body: Record<string, unknown>;
  try { body = JSON.parse(init.body) as Record<string, unknown>; } catch { if (first) return first; throw failure; }
  if (typeof body.model === "string") body.model = openRouterModel(body.model);
  const headers = { ...(init.headers as Record<string, string> | undefined) };
  delete headers["x-api-key"]; delete headers["anthropic-workspace-id"];
  console.warn("claude via openrouter", JSON.stringify({ why, model: body.model }));
  return fetchImpl(OPENROUTER_MESSAGES_URL, { ...init, headers: { ...headers, Authorization: `Bearer ${spare}`, "anthropic-version": "2023-06-01" }, body: JSON.stringify(body) });
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
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  error?: { message?: string } | string;
};

export class AssistantUnavailableError extends Error {}

export const SYSTEM_PROMPT = `You are Ask BlinkSpot, the creative director inside BlinkSpot, an AI studio where small brands make social images and videos.

How you help:
- Find out what the user wants to make, then get them there in as few steps as possible.
- The brand, balance and prices are given below. Write every prompt or brief in that brand's look and voice. Only call quote_* for something the price sheet does not cover.
- If the user has an inspiration picture (Pinterest, Instagram, a competitor's post) or says "make something like this", send them to Inspo Remix with open_page "inspo": it remakes that design for their brand in one click. For a video they love (a Reel, a TikTok, an ad), use open_page "video_inspo": it reads the video shot by shot and rebuilds it for their brand as Storyboard scenes.
- Long videos are made scene by scene: a story concept becomes 3 to 8 short scenes (about 5 s each), each scene gets a start frame, then the clips are put together in the Video Editor. Use propose_video with style "storytelling" for anything longer than one shot.
- Talk about quality, not model names: Draft (cheap preview), Standard, Cinema (1080p). Say the price when you propose.
- Be quick: when the request is clear, propose in your first reply instead of asking questions.
- Do the work for the user; don't send them to do it. When they tell you about their brand (a pasted description, products and prices, contacts, colours), save it with update_brand (or create_brand for a brand they don't have yet) instead of explaining where to type it. Captions and hashtags on posts: update_posts. These save at once and the user gets an Undo, so just do them and say what you saved.
- Spending credits: only when the user asked you to make something now ("make me", "create", "go ahead", "do it"). Then use propose_image with make_now, make_website with start_now, or propose_schedule with apply_now, and say what it costs. When they are exploring or unsure, give the button instead. Videos always go as a button (they are the expensive ones). You never publish to social media and never delete anything.
- If the balance is lower than the price, say so and suggest a shorter or Draft version.
- To plan or schedule posts, call get_schedule, then propose_schedule once with a date and time for each post. Spread them out (one a day, two at most), avoid times already taken, and use good local times for the audience unless the user says otherwise (weekdays 12:00-13:00 or 18:00-21:00, weekends 10:00-12:00). Say which posts have no platforms yet: they go on the calendar but only post once platforms are picked. If they asked you to schedule (not just to plan), use apply_now; otherwise they press Apply.

Skills: playbooks for kinds of work, loaded with use_skill only when the request needs one (they cost nothing until loaded). Load the matching skill before writing a prompt, script or plan for that kind of work. Built in:
${skillIndex(BUILTIN_SKILLS)}

Style: short, warm, plain English. No emoji, no em dashes, no markdown (the chat shows text as typed: no ** or #; use "- " for a list). Two to five sentences unless the user asks for a plan. When you propose something, say in one line what the button will do and what it costs.`;

function textOf(blocks: ContentBlock[] | undefined) {
  return (blocks ?? []).filter((b): b is TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}

/**
 * Mark the end of the conversation so far as cacheable: the next tool turn (and the user's next
 * message) re-sends it and pays 5% for it instead of full price. Only the newest message carries
 * the mark, so the request never exceeds the four-breakpoint limit.
 */
export function withCacheMark(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  const blocks: ContentBlock[] = typeof last.content === "string" ? [{ type: "text", text: last.content }] : [...last.content];
  if (blocks.length === 0) return messages;
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } };
  return [...messages.slice(0, -1), { role: last.role, content: blocks }];
}

export async function runAssistant(
  history: AgentMessage[],
  ctx: ToolContext & { pageHint?: string; brief?: string; editor?: EditorContext; canvas?: CanvasSummary; effort?: Effort; skills?: Array<Pick<Skill, "id" | "name" | "description">>; /** The person pressed Stop (2026-10-22): no more model calls or tool steps. */ signal?: AbortSignal },
  fetchImpl: typeof fetch = fetch,
): Promise<{ reply: string; actions: AssistantAction[]; usage: { input: number; output: number; cacheRead: number; cacheWrite: number }; provider: "anthropic" | "kie"; model: string; effort: Effort }> {
  const provider = assistantProvider();
  const started = Date.now();

  const editor = ctx.editor;
  // The effort dial: low/medium chat on Sonnet, high and above on Opus; canvas and timeline edits stay on Opus.
  const effort: Effort = ctx.effort ?? "medium";
  const info = EFFORT_INFO[effort];
  const model = assistantModelFor(ctx.canvas ? "canvas" : editor ? "editor" : info.model === "opus" ? "editor" : "chat", provider.name);
  const maxTokens = ctx.canvas ? Math.max(MAX_TOKENS_CANVAS, info.maxTokens) : info.maxTokens;
  // Deep levels think for longer; give each call more room (the route allows 300 s in all).
  const callTimeout = effort === "max" || effort === "xhigh" ? 240_000 : CALL_TIMEOUT_MS;
  // The same for every user on this screen: cached, so repeat turns read it at 5% of the price.
  const fixed = [SYSTEM_PROMPT, editor ? EDITOR_GUIDE : "", ctx.canvas ? CANVAS_GUIDE : ""].filter(Boolean).join("\n\n");
  const varying = [
    ctx.skills?.length ? `This account's own skills (load with use_skill like the built-in ones):\n${skillIndex(ctx.skills)}` : "",
    ctx.brief,
    ctx.pageHint ? `The user is on: ${ctx.pageHint}.` : "",
    editor ? `Timeline (ids, seconds): ${JSON.stringify(editor.timeline)}` : "",
    ctx.canvas ? `Canvas (pixels): ${JSON.stringify({ ...ctx.canvas, preview: undefined })}` : "",
  ].filter(Boolean).join("\n\n");
  const cache = provider.name === "anthropic";
  const system = cache
    ? [{ type: "text", text: fixed, cache_control: { type: "ephemeral" } }, ...(varying ? [{ type: "text", text: varying }] : [])]
    : [fixed, varying].filter(Boolean).join("\n\n");
  const tools = [...ASSISTANT_TOOLS, UPDATE_BRAND_TOOL, CREATE_BRAND_TOOL, UPDATE_POSTS_TOOL, USE_SKILL_TOOL, ...(editor ? [EDIT_TIMELINE_TOOL] : []), ...(ctx.canvas ? [EDIT_CANVAS_TOOL] : [])];
  const toolCtx: ToolContext = { clientId: ctx.clientId, brandId: ctx.brandId, timeline: editor?.timeline, canvas: ctx.canvas, tz: ctx.tz, tzOffset: ctx.tzOffset };
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
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let reply = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (turn > 0 && Date.now() - started > (effort === "max" || effort === "xhigh" ? 250_000 : TURN_BUDGET_MS)) break;
    if (ctx.signal?.aborted) throw new Error("stopped");
    const res = await claudeFetch(provider, {
      method: "POST",
      headers: { ...provider.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: maxTokens, system, tools, messages: cache ? withCacheMark(messages) : messages, stream: false,
        // Anthropic only (Kie's endpoint doesn't take it). Without it Sonnet 5.5 runs at "high".
        ...(provider.name === "anthropic" ? { output_config: { effort } } : {}),
      }),
      signal: ctx.signal ? AbortSignal.any([AbortSignal.timeout(callTimeout), ctx.signal]) : AbortSignal.timeout(callTimeout),
    }, fetchImpl);
    const data = (await res.json().catch(() => ({}))) as MessagesResponse;
    if (!res.ok || !Array.isArray(data.content)) {
      const detail = typeof data.error === "string" ? data.error : data.error?.message;
      throw new Error(`Assistant model error (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    usage.input += data.usage?.input_tokens ?? 0;
    usage.output += data.usage?.output_tokens ?? 0;
    usage.cacheRead += data.usage?.cache_read_input_tokens ?? 0;
    usage.cacheWrite += data.usage?.cache_creation_input_tokens ?? 0;
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

  // The chat shows text as typed: markdown bold and headings (which the model sometimes adds) are dropped.
  const plain = reply.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "");
  return { reply: plain || (actions.length ? "Here you go." : "Sorry, I could not finish that. Try asking again."), actions, usage, provider: provider.name, model, effort };
}
