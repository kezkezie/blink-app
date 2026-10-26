import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

/**
 * "Connect your Claude" (Kezie, 2026-10-26): what Claude does when someone adds BlinkSpot as a
 * custom connector, step by step. An unauthenticated MCP call gets a 401 pointing at the metadata;
 * the metadata names the sign-in endpoints; Claude registers (DCR); the person signs in and allows
 * it on the consent screen; the code comes back to Claude's callback and is exchanged with the PKCE
 * verifier for a key that lists and calls BlinkSpot's tools. A code works once; a wrong verifier
 * fails. Throwaway account, deleted after. No AI calls.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test connect-claude-oauth
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

test("Claude connects with Sign in with BlinkSpot, then uses the tools", async ({ page, request }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(180_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-oauth-${stamp}@blinkspot-test.dev`;
  const password = `Oa-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "OAuth Tester", onboarding_completed: true } });
  let clientId = "";
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "OAuth Tester", contact_name: "OAuth Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Claude Test Brand", is_active: true });

    // 1. No key: a 401 that says where the metadata is.
    const first = await request.post(`${BASE}/api/mcp`, { data: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } } });
    expect(first.status()).toBe(401);
    const www = first.headers()["www-authenticate"] ?? "";
    const metaUrl = /resource_metadata="([^"]+)"/.exec(www)?.[1];
    expect(metaUrl, www).toBeTruthy();
    // 2. Protected resource metadata, then the authorization server's.
    const resource = await (await request.get(metaUrl!)).json();
    expect(resource.resource).toBe(`${new URL(metaUrl!).origin}/api/mcp`);
    const as = await (await request.get(`${resource.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json();
    expect(as.code_challenge_methods_supported).toContain("S256");
    // 3. Dynamic client registration, as Claude does.
    const reg = await request.post(as.registration_endpoint, { data: { client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none", grant_types: ["authorization_code"] } });
    expect(reg.status()).toBe(201);
    const client = await reg.json();
    // 4. The person signs in and allows it.
    const verifier = randomBytes(40).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorize = `${as.authorization_endpoint}?response_type=code&client_id=${encodeURIComponent(client.client_id)}&redirect_uri=${encodeURIComponent(CALLBACK)}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz&scope=blinkspot`;
    let landed = "";
    await page.route("https://claude.ai/**", (route) => { landed = route.request().url(); return route.fulfill({ status: 200, body: "ok" }); });
    await page.goto(authorize);
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page.getByRole("heading", { name: "Connect Claude to BlinkSpot" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("claude.ai", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Claude Test Brand")).toBeChecked();
    await page.getByRole("button", { name: "Allow", exact: true }).click();
    await expect.poll(() => landed, { timeout: 30_000 }).toContain("code=");
    const back = new URL(landed);
    expect(back.origin + back.pathname).toBe(CALLBACK);
    expect(back.searchParams.get("state")).toBe("xyz");
    const code = back.searchParams.get("code")!;
    // 5. A wrong verifier fails; the right one gets a token; the same code again fails.
    const form = (v: string) => new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: CALLBACK, client_id: client.client_id, code_verifier: v }).toString();
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    const wrong = await request.post(as.token_endpoint, { data: form(randomBytes(40).toString("base64url")), headers });
    expect(wrong.status()).toBe(400);
    expect((await wrong.json()).error).toBe("invalid_grant");
    const ok = await request.post(as.token_endpoint, { data: form(verifier), headers });
    expect(ok.status(), await ok.text()).toBe(200);
    const token = (await ok.json()).access_token as string;
    expect(token).toMatch(/^bsk_/);
    const again = await request.post(as.token_endpoint, { data: form(verifier), headers });
    expect((await again.json()).error).toBe("invalid_grant");
    // 6. The token reaches BlinkSpot's tools, scoped to this account.
    const auth = { Authorization: `Bearer ${token}` };
    const tools = await (await request.post(`${BASE}/api/mcp`, { headers: auth, data: { jsonrpc: "2.0", id: 2, method: "tools/list" } })).json();
    expect((tools.result.tools as Array<{ name: string }>).map((t) => t.name)).toContain("list_brands");
    const brands = await (await request.post(`${BASE}/api/mcp`, { headers: auth, data: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_brands", arguments: {} } } })).json();
    expect(JSON.stringify(brands)).toContain("Claude Test Brand");
    // It shows up as a connection the person can revoke.
    const { data: keys } = await sb.from("api_keys").select("name, permissions").eq("client_id", clientId).is("revoked_at", null);
    expect(keys).toEqual([{ name: "Claude (signed in)", permissions: ["read", "spend"] }]);
  } finally {
    if (clientId) {
      await sb.from("mcp_activity").delete().eq("client_id", clientId);
      await sb.from("api_keys").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
