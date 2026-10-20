import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Connect your AI, stage 1 (2026-10-20). LIVE on a throwaway account, no credits: a key made in
 * Settings > AI connections, used by the official MCP client (what Claude Code, Hermes and OpenClaw
 * speak) to list brands, read one, search the Library, read credits and price an image. A key for one
 * brand can't read the other; a revoked key is refused. Deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test ai-connections --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

async function mcp(token: string) {
  const client = new Client({ name: "blinkspot-e2e", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}
const text = (r: unknown) => ((r as { content: Array<{ text: string }> }).content[0]?.text ?? "");

test("a key from Settings lets an MCP client read this account's brands, and only those", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(240_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-mcp-${stamp}@blinkspot-test.dev`;
  const password = `Mc-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "MCP Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "MCP Tester", contact_name: "MCP Tester", contact_email: email, plan_tier: "free", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 42 }, { onConflict: "client_id" });
    const { data: b1 } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", industry: "Fashion", is_active: true, primary_color: "#E4572E" }).select("id").single();
    const { data: b2 } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Secret Brand", is_active: true }).select("id").single();
    await sb.from("content").insert({ client_id: clientId, brand_id: b1!.id, content_type: "post_image", status: "draft", caption: "Drop 01 sneakers on a Nairobi rooftop", image_urls: ["https://www.blinkspot.io/brand/mark-lime.png"] });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email, password);

    // Settings > AI connections: a key for Kasi Kicks only, shown once with the setup lines.
    await page.goto(`${BASE}/studio/account/settings`);
    const section = page.getByRole("region", { name: "AI connections" });
    await section.getByRole("button", { name: "New connection" }).click();
    await section.getByLabel("Connection name").fill("Claude Code on my laptop");
    await section.getByRole("button", { name: "Kasi Kicks" }).click();
    await expect(section.getByLabel("Monthly credit budget")).toHaveValue("200");
    await section.getByRole("button", { name: "Create key" }).click();
    const shown = section.getByRole("region", { name: "New key" });
    await expect(shown).toBeVisible({ timeout: 15_000 });
    const token = (await shown.getByLabel("Key").textContent())!.trim();
    expect(token).toMatch(/^bsk_/);
    await expect(shown.getByText(`claude mcp add --transport http blinkspot ${"https://www.blinkspot.io/api/mcp"}`, { exact: false })).toBeVisible();
    const { data: stored } = await sb.from("api_keys").select("token_hash, monthly_credit_budget, brand_ids").eq("client_id", clientId).single();
    expect(stored!.token_hash).not.toContain(token.slice(4, 20)); // only a fingerprint is kept
    expect(stored!.monthly_credit_budget).toBe(200);
    expect(stored!.brand_ids).toEqual([b1!.id]);

    // The official MCP client, as Claude Code, Hermes and OpenClaw use it.
    const client = await mcp(token);
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["list_brands", "get_brand", "search_library", "get_schedule", "get_credits", "get_quote"]));
    const brands = JSON.parse(text(await client.callTool({ name: "list_brands", arguments: {} })));
    expect(brands).toEqual([expect.objectContaining({ id: b1!.id, name: "Kasi Kicks" })]);
    expect(text(await client.callTool({ name: "get_brand", arguments: {} }))).toContain("Kasi Kicks"); // the key's only brand
    const lib = JSON.parse(text(await client.callTool({ name: "search_library", arguments: { query: "rooftop" } })));
    expect(lib[0]).toMatchObject({ caption: expect.stringContaining("rooftop"), open: expect.stringContaining("/studio/library/") });
    expect(JSON.parse(text(await client.callTool({ name: "get_credits", arguments: {} })))).toMatchObject({ balance: 42, connection_monthly_budget: 200 });
    expect(JSON.parse(text(await client.callTool({ name: "get_quote", arguments: { kind: "image", engine: "nb2", count: 2 } })))).toMatchObject({ credits: 36 });
    const denied = await client.callTool({ name: "get_brand", arguments: { brand_id: b2!.id } });
    expect((denied as { isError?: boolean }).isError).toBe(true);
    expect(text(denied)).not.toContain("Secret Brand");
    await client.close();
    await expect.poll(async () => (await sb.from("mcp_activity").select("tool").eq("client_id", clientId)).data?.length ?? 0, { timeout: 15_000 }).toBeGreaterThanOrEqual(6);

    // Revoked: refused.
    await page.reload();
    await section.getByRole("button", { name: "Revoke Claude Code on my laptop" }).click();
    await expect(section.getByText("No connections yet.")).toBeVisible({ timeout: 15_000 });
    const res = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(res.status).toBe(401);
  } finally {
    if (clientId) {
      await sb.from("mcp_activity").delete().eq("client_id", clientId);
      await sb.from("api_keys").delete().eq("client_id", clientId);
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
