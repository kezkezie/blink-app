import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { DEFAULT_KEY_BUDGET, MAX_KEYS_PER_WORKSPACE, newKey } from "@/lib/mcp/keys";

/**
 * Settings > AI connections (2026-10-20): the keys an outside AI uses to reach this account's
 * brands through /api/mcp. Every plan; 200 credits a month per key by default (Kezie's call).
 * GET lists them (never the key itself), POST makes one and returns it once, DELETE ?id revokes.
 * Keys belong to the signed-in person's own workspace, not a brand shared with them.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownClient(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const { data } = await supabaseAdmin.from("clients").select("id").eq("user_id", auth.value).maybeSingle();
  if (!data?.id) return { error: NextResponse.json({ error: "Account not found" }, { status: 404 }) };
  return { userId: auth.value, clientId: data.id as string };
}

export async function GET(request: NextRequest) {
  const who = await ownClient(request);
  if ("error" in who) return who.error;
  const { data } = await supabaseAdmin.from("api_keys").select("id, name, prefix, brand_ids, permissions, monthly_credit_budget, created_at, last_used_at, revoked_at").eq("client_id", who.clientId).is("revoked_at", null).order("created_at", { ascending: false });
  const ids = (data ?? []).map((k) => k.id);
  const { data: acts } = ids.length ? await supabaseAdmin.from("mcp_activity").select("key_id, tool, ok, created_at").in("key_id", ids).order("created_at", { ascending: false }).limit(30) : { data: [] };
  return NextResponse.json({ keys: data ?? [], activity: acts ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const who = await ownClient(request);
  if ("error" in who) return who.error;
  let body: { name?: unknown; brandIds?: unknown; budget?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (!name) return NextResponse.json({ error: "Give the connection a name, e.g. Claude Code on my laptop." }, { status: 400 });
  const budget = body.budget === undefined ? DEFAULT_KEY_BUDGET : Math.round(Number(body.budget));
  if (!Number.isFinite(budget) || budget < 0 || budget > 100_000) return NextResponse.json({ error: "The monthly budget is 0 to 100,000 credits." }, { status: 400 });
  let brandIds: string[] | null = null;
  if (Array.isArray(body.brandIds)) {
    const asked = [...new Set(body.brandIds.filter((x): x is string => typeof x === "string" && UUID.test(x)))];
    if (!asked.length) return NextResponse.json({ error: "Pick at least one brand." }, { status: 400 });
    const { data: own } = await supabaseAdmin.from("brand_profiles").select("id").eq("client_id", who.clientId).eq("is_active", true).in("id", asked);
    if ((own ?? []).length !== asked.length) return NextResponse.json({ error: "One of those brands isn't in this account." }, { status: 400 });
    brandIds = asked;
  }
  const { count } = await supabaseAdmin.from("api_keys").select("id", { count: "exact", head: true }).eq("client_id", who.clientId).is("revoked_at", null);
  if ((count ?? 0) >= MAX_KEYS_PER_WORKSPACE) return NextResponse.json({ error: `Up to ${MAX_KEYS_PER_WORKSPACE} connections. Revoke one you no longer use.` }, { status: 400 });
  const key = newKey();
  const { data, error } = await supabaseAdmin.from("api_keys").insert({ client_id: who.clientId, created_by: who.userId, name, token_hash: key.hash, prefix: key.prefix, brand_ids: brandIds, permissions: ["read"], monthly_credit_budget: budget }).select("id, name, prefix, brand_ids, permissions, monthly_credit_budget, created_at").single();
  if (error || !data) return NextResponse.json({ error: "Couldn't create the connection." }, { status: 500 });
  return NextResponse.json({ key: data, token: key.token }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const who = await ownClient(request);
  if ("error" in who) return who.error;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { data } = await supabaseAdmin.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("client_id", who.clientId).is("revoked_at", null).select("id");
  if (!data?.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
