import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { bearerKey, hashKey, type KeyScope } from "@/lib/mcp/keys";
import { handleRpc, type RpcReply } from "@/lib/mcp/protocol";
import { mcpTools } from "@/lib/mcp/tools";

/**
 * BlinkSpot's MCP server (Connect your AI, stage 1, 2026-10-20). Claude Code, Hermes, OpenClaw or
 * any MCP client connects with a key from Settings > AI connections:
 *   claude mcp add --transport http blinkspot https://www.blinkspot.io/api/mcp --header "Authorization: Bearer bsk_..."
 * Stateless Streamable HTTP with JSON replies (lib/mcp/protocol.ts). Every call checks the key,
 * the workspace and the brand; stage 1 tools only read and price.
 */
export const maxDuration = 60;
const LIMIT_PER_HOUR = 300;

const unauthorized = (message: string) => NextResponse.json(
  { jsonrpc: "2.0", id: null, error: { code: -32001, message } },
  { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="BlinkSpot", error="invalid_token"' } },
);

async function scopeFor(request: NextRequest): Promise<KeyScope | null> {
  const token = bearerKey(request.headers.get("authorization"));
  if (!token) return null;
  const { data } = await supabaseAdmin.from("api_keys").select("id, client_id, brand_ids, permissions, monthly_credit_budget, last_used_at, revoked_at").eq("token_hash", hashKey(token)).maybeSingle();
  if (!data || data.revoked_at) return null;
  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 5 * 60_000) {
    after(async () => { await supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id); });
  }
  return { keyId: data.id, clientId: data.client_id, brandIds: data.brand_ids ?? null, permissions: data.permissions ?? ["read"], budget: data.monthly_credit_budget ?? 200 };
}

export async function POST(request: NextRequest) {
  const scope = await scopeFor(request);
  if (!scope) return unauthorized("Missing or revoked BlinkSpot key. Create one in BlinkSpot > Settings > AI connections.");
  const { data: limit } = await supabaseAdmin.rpc("consume_assisted_creation_rate_limit", { p_user_id: scope.keyId, p_operation: "mcp_call", p_limit: LIMIT_PER_HOUR, p_window_seconds: 3600 });
  const row = Array.isArray(limit) ? limit[0] : limit;
  if (row && row.allowed === false) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32002, message: `That's ${LIMIT_PER_HOUR} calls this hour for this key. Try again later.` } }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
  const tools = mcpTools(scope);
  const calls: Array<{ tool: string; ok: boolean; brand: string | null }> = [];
  const onCall = (tool: string, ok: boolean, args: Record<string, unknown>) => calls.push({ tool, ok, brand: typeof args.brand_id === "string" ? args.brand_id : null });
  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((m) => handleRpc(m, tools, onCall)))).filter((r): r is RpcReply => !!r);
  if (calls.length) {
    after(async () => {
      await supabaseAdmin.from("mcp_activity").insert(calls.map((c) => ({ key_id: scope.keyId, client_id: scope.clientId, tool: c.tool, ok: c.ok, brand_id: c.brand && /^[0-9a-f-]{36}$/i.test(c.brand) ? c.brand : null })));
    });
  }
  if (!replies.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0], { headers: { "Cache-Control": "no-store" } });
}

/** No server-to-client stream: every reply comes back on the POST. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
