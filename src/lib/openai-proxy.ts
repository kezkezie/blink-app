// Thin, mockable server-side OpenAI proxies used by the secured video routes.
//
// Both call OpenAI over `fetch` (not the SDK) so route tests can assert, via a
// stubbed global fetch, that no provider request is made on a rejected path and
// exactly one is made on the authorized path. The API key is read from the
// server-only `OPENAI_API_KEY` and never leaves the server.

import { complete } from "@/lib/llm";

type ChatOptions = {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  jsonObject?: boolean;
};

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Delegates to the provider-neutral adapter (`src/lib/llm`). Same defaults as
 * before (gpt-4o-mini via the `videoHelper` task), same error messages and
 * `status`, plus a timeout and retries on transient failures.
 */
export async function openAiChat(options: ChatOptions): Promise<string> {
  return complete({
    task: "videoHelper",
    system: options.system,
    user: options.user,
    json: options.jsonObject,
    ...(options.model ? { model: options.model } : {}),
    ...(options.maxTokens ? { maxTokens: options.maxTokens } : {}),
  });
}

export async function openAiSpeech(text: string, voice: string): Promise<ArrayBuffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI service unavailable");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "tts-1", input: text, voice }),
  });
  if (!response.ok) throw new Error("AI service request failed");
  return response.arrayBuffer();
}
