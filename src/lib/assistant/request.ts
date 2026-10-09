import type { AgentMessage } from "./agent";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGES = 20;
const MAX_TEXT = 4000;

/** Only plain user/assistant text is accepted from the browser; tool traffic is rebuilt server side. */
export function parseAssistantRequest(body: unknown): { messages: AgentMessage[]; brandId: string | null; page?: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > MAX_MESSAGES) return null;
  const messages: AgentMessage[] = [];
  for (const m of b.messages) {
    if (!m || typeof m !== "object") return null;
    const { role, text } = m as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") return null;
    const t = text.trim();
    if (!t || t.length > MAX_TEXT) return null;
    messages.push({ role, content: t });
  }
  if (messages[messages.length - 1].role !== "user") return null;
  // The Messages API needs the conversation to start with the user.
  while (messages.length && messages[0].role !== "user") messages.shift();
  const brandId = typeof b.brandId === "string" && UUID.test(b.brandId) ? b.brandId : null;
  const page = typeof b.page === "string" && /^\/studio[\w/-]{0,80}$/.test(b.page) ? b.page : undefined;
  return { messages, brandId, page };
}
