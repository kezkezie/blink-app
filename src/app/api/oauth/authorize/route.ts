import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { DEFAULT_KEY_BUDGET, cleanPermissions } from "@/lib/mcp/keys";
import { issueCode, redirectMatches, resolveClient } from "@/lib/oauth";

/**
 * The consent step of "Sign in with BlinkSpot" for AI apps (lib/oauth.ts; the page is /oauth/authorize).
 * GET ?client_id&redirect_uri: who is asking and where it goes back to, for the consent screen.
 * POST (signed in): the person's choices (brands, what it may do, a monthly budget) become a
 * short-lived signed code on the app's own callback.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function checked(clientId: unknown, redirectUri: unknown) {
  if (typeof clientId !== "string" || typeof redirectUri !== "string") return null;
  const client = await resolveClient(clientId);
  return client && redirectMatches(client, redirectUri) ? client : null;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const client = await checked(q.get("client_id"), q.get("redirect_uri"));
  if (!client) return NextResponse.json({ error: "This sign-in link isn't valid. Start connecting again from the app." }, { status: 400 });
  return NextResponse.json({ name: client.name, host: new URL(q.get("redirect_uri")!).host }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { client_id?: unknown; redirect_uri?: unknown; code_challenge?: unknown; code_challenge_method?: unknown; state?: unknown; permissions?: unknown; brandIds?: unknown; budget?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const client = await checked(body.client_id, body.redirect_uri);
  if (!client) return NextResponse.json({ error: "This sign-in link isn't valid. Start connecting again from the app." }, { status: 400 });
  if (body.code_challenge_method !== "S256" || typeof body.code_challenge !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(body.code_challenge)) {
    return NextResponse.json({ error: "The app didn't send a secure sign-in (PKCE S256)." }, { status: 400 });
  }
  const { data: own } = await supabaseAdmin.from("clients").select("id").eq("user_id", auth.value).maybeSingle();
  if (!own?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  let brandIds: string[] | null = null;
  if (Array.isArray(body.brandIds)) {
    const asked = [...new Set(body.brandIds.filter((x): x is string => typeof x === "string" && UUID.test(x)))];
    if (!asked.length) return NextResponse.json({ error: "Pick at least one brand." }, { status: 400 });
    const { data: mine } = await supabaseAdmin.from("brand_profiles").select("id").eq("client_id", own.id).eq("is_active", true).in("id", asked);
    if ((mine ?? []).length !== asked.length) return NextResponse.json({ error: "One of those brands isn't in this account." }, { status: 400 });
    brandIds = asked;
  }
  const budget = body.budget === undefined ? DEFAULT_KEY_BUDGET : Math.round(Number(body.budget));
  if (!Number.isFinite(budget) || budget < 0 || budget > 100_000) return NextResponse.json({ error: "The monthly budget is 0 to 100,000 credits." }, { status: 400 });
  const code = issueCode({ u: auth.value, c: client.id, r: body.redirect_uri as string, ch: body.code_challenge, p: cleanPermissions(body.permissions), b: brandIds, bud: budget, n: client.name });
  const back = new URL(body.redirect_uri as string);
  back.searchParams.set("code", code);
  if (typeof body.state === "string") back.searchParams.set("state", body.state);
  return NextResponse.json({ redirect: back.toString() }, { headers: { "Cache-Control": "no-store" } });
}
