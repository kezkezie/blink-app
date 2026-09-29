import { LLM_TASKS, type LlmTask, type LlmTaskConfig } from "./models";

/**
 * Provider-neutral completion for every AI helper route.
 *
 * Calls providers over global `fetch` (not an SDK) so route tests can stub fetch
 * and assert that a rejected request makes NO provider call and an authorised one
 * makes exactly one. The API key is server-only and never leaves the server.
 *
 * Reliability: every call is time-bounded, and transient failures (network drop,
 * 429, 5xx) are retried. Permanent failures (4xx) are not retried.
 */

export type LlmImage = { url: string };

export type CompleteOptions = {
  task: LlmTask;
  system: string;
  user: string;
  images?: LlmImage[];
  json?: boolean;
  /** Per-call overrides; the task config is the default. */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

export class LlmError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

const TRANSIENT = (status: number) => status === 0 || status === 429 || status >= 500;
const MAX_ATTEMPTS = 3;

export function resolveTaskConfig(opts: CompleteOptions): LlmTaskConfig {
  const base: LlmTaskConfig = LLM_TASKS[opts.task];
  return {
    provider: base.provider,
    model: opts.model ?? base.model,
    maxTokens: opts.maxTokens ?? base.maxTokens,
    temperature: opts.temperature ?? base.temperature,
  };
}

/** Build the OpenAI chat body. Exported for tests: the request shape is the contract. */
export function buildOpenAiBody(opts: CompleteOptions, cfg: LlmTaskConfig) {
  const userContent = opts.images?.length
    ? [{ type: "text", text: opts.user }, ...opts.images.map((i) => ({ type: "image_url", image_url: { url: i.url } }))]
    : opts.user;
  return {
    model: cfg.model,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    ...(cfg.maxTokens ? { max_tokens: cfg.maxTokens } : {}),
    ...(cfg.temperature !== undefined ? { temperature: cfg.temperature } : {}),
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: userContent },
    ],
  };
}

async function callOpenAi(opts: CompleteOptions, cfg: LlmTaskConfig): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new LlmError("AI service unavailable");
  const body = JSON.stringify(buildOpenAiBody(opts, cfg));

  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      });
    } catch {
      lastStatus = 0; // network drop or timeout: transient
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * attempt));
      continue;
    }
    if (response.ok) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new LlmError("AI service returned no content", response.status);
      return content;
    }
    lastStatus = response.status;
    if (!TRANSIENT(response.status)) break;
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  throw new LlmError("AI service request failed", lastStatus);
}

export async function complete(opts: CompleteOptions): Promise<string> {
  const cfg = resolveTaskConfig(opts);
  switch (cfg.provider) {
    case "openai":
      return callOpenAi(opts, cfg);
    default:
      throw new LlmError(`Unsupported LLM provider: ${String(cfg.provider)}`);
  }
}

/** JSON convenience: parses, and fails loudly rather than returning a half-object. */
export async function completeJson<T = unknown>(opts: Omit<CompleteOptions, "json">): Promise<T> {
  const text = await complete({ ...opts, json: true });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new LlmError("AI service returned invalid JSON");
  }
}
