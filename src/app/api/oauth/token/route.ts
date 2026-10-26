import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { MAX_KEYS_PER_WORKSPACE, newKey } from "@/lib/mcp/keys";
import { SCOPE, pkceOk, readCode } from "@/lib/oauth";

/**
 * The token step of "Sign in with BlinkSpot" for AI apps (RFC 6749 4.1.3, form-urlencoded; lib/oauth.ts).
 * A valid code (signed, 5 minutes, once) with its PKCE verifier becomes an AI connection key for the
 * person's own workspace, with the brands, permissions and budget they chose. Signing in again from
 * the same app replaces that app's previous key.
 */
const fail = (error: string, description: string, status = 400) =>
  NextResponse.json({ error, error_description: description }, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });

export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text().catch(() => ""));
  if (form.get("grant_type") !== "authorization_code") return fail("unsupported_grant_type", "Only authorization_code is supported.");
  const claims = readCode(form.get("code") ?? "");
  if (!claims) return fail("invalid_grant", "The code is invalid or has expired.");
  if (form.get("client_id") !== claims.c || form.get("redirect_uri") !== claims.r) return fail("invalid_grant", "The code was issued to another app or callback.");
  if (!pkceOk(form.get("code_verifier") ?? "", claims.ch)) return fail("invalid_grant", "The PKCE verifier doesn't match.");
  const { data: own } = await supabaseAdmin.from("clients").select("id").eq("user_id", claims.u).maybeSingle();
  if (!own?.id) return fail("invalid_grant", "The account is gone.");
  const name = `${claims.n} (signed in)`.slice(0, 60);
  // This app's earlier key is replaced, so it doesn't count against the limit.
  const { count } = await supabaseAdmin.from("api_keys").select("id", { count: "exact", head: true }).eq("client_id", own.id).is("revoked_at", null).neq("name", name);
  if ((count ?? 0) >= MAX_KEYS_PER_WORKSPACE) return fail("invalid_grant", `Up to ${MAX_KEYS_PER_WORKSPACE} AI connections. Revoke one in BlinkSpot > Settings > AI connections.`);
  // The key takes the code's id, so a code works once: a second exchange hits the same id.
  const key = newKey();
  const { error } = await supabaseAdmin.from("api_keys").insert({ id: claims.j, client_id: own.id, created_by: claims.u, name, token_hash: key.hash, prefix: key.prefix, brand_ids: claims.b, permissions: claims.p, monthly_credit_budget: claims.bud });
  if (error) return error.code === "23505" ? fail("invalid_grant", "The code was already used.") : fail("server_error", "Couldn't create the connection.", 500);
  await supabaseAdmin.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("client_id", own.id).eq("created_by", claims.u).eq("name", name).neq("id", claims.j).is("revoked_at", null);
  return NextResponse.json({ access_token: key.token, token_type: "Bearer", scope: SCOPE }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}
