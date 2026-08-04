// Thin, mockable server-side OpenAI proxies used by the secured video routes.
//
// Both call OpenAI over `fetch` (not the SDK) so route tests can assert, via a
// stubbed global fetch, that no provider request is made on a rejected path and
// exactly one is made on the authorized path. The API key is read from the
// server-only `OPENAI_API_KEY` and never leaves the server.

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

export async function openAiChat(options: ChatOptions): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI service unavailable");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: options.model ?? "gpt-4o-mini",
      ...(options.jsonObject ? { response_format: { type: "json_object" } } : {}),
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
    }),
  });
  if (!response.ok) {
    const err = new Error("AI service request failed") as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI service returned no content");
  return content;
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
