import { test, expect, type Browser } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Sharing for a while, and handing a brand over (Kezie, 2026-10-16). LIVE with throwaway accounts:
 * A shares a brand with B for 14 days through the Share panel; when B's access ends (moved into the
 * past) B can't read it any more, through the API or the database rules. Then A hands the brand to
 * C: posts and products move to C's workspace, A stays on as an editor, B's access ends, C's plan
 * slot is used. No credits spent. Everything deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test brand-share-duration-transfer --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function account(sb: SupabaseClient, tag: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `e2e-${tag}-${stamp}@blinkspot-test.dev`;
  const password = `Hx-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${tag} tester`, onboarding_completed: true } });
  const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: `${tag} co`, contact_name: `${tag} tester`, contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
  await sb.from("credit_balances").upsert({ client_id: c!.id, balance: 20 }, { onConflict: "client_id" });
  return { email, password, userId: u.user!.id, clientId: c!.id as string };
}

async function signedIn(browser: Browser, who: { email: string; password: string }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', who.email);
  await page.fill('input[type="password"]', who.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
  return { ctx, page };
}

test("share for 14 days, access ends; hand the brand over", async ({ browser }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(400_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const people: Array<Awaited<ReturnType<typeof account>>> = [];
  try {
    const A = await account(sb, "owner"); people.push(A);
    const B = await account(sb, "member"); people.push(B);
    const C = await account(sb, "heir"); people.push(C);
    const { data: brand } = await sb.from("brand_profiles").insert({ client_id: A.clientId, brand_name: "Handover Test", is_active: true }).select("id").single();
    await sb.from("content").insert([{ client_id: A.clientId, brand_id: brand!.id, content_type: "post_image", status: "draft", caption: "E2E one" }, { client_id: A.clientId, brand_id: brand!.id, content_type: "post_image", status: "draft", caption: "E2E two" }]);
    await sb.from("products").insert({ client_id: A.clientId, brand_id: brand!.id, name: "E2E product" });

    // 1. A shares with B for 14 days, from the Share panel.
    const a = await signedIn(browser, A);
    await a.page.goto(`${BASE}/studio/brand`);
    await a.page.getByRole("button", { name: /^Share/ }).first().click({ timeout: 30_000 });
    const panel = a.page.getByRole("dialog", { name: /Share Handover Test/ });
    await panel.getByRole("button", { name: "14 days", exact: true }).click();
    await panel.getByLabel("Their email").fill(B.email);
    await panel.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(panel.getByText(/Their access lasts/)).toBeVisible({ timeout: 20_000 });
    const { data: invite } = await sb.from("brand_invites").select("token, access_until").eq("brand_id", brand!.id).single();
    const days = (Date.parse(invite!.access_until as string) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9); expect(days).toBeLessThan(14.1);

    const b = await signedIn(browser, B);
    const join = await b.page.request.post(`${BASE}/api/brand-sharing`, { data: { action: "accept", token: invite!.token } });
    expect(join.status()).toBe(200);
    const read = () => b.page.request.get(`${BASE}/api/brand-sharing?brandId=${brand!.id}`);
    expect((await read()).status()).toBe(200);
    expect((await (await read()).json()).accessUntil).toBeTruthy();
    // The database rules let B read the brand while access lasts…
    const bDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await bDb.auth.signInWithPassword({ email: B.email, password: B.password });
    expect((await bDb.from("brand_profiles").select("id").eq("id", brand!.id)).data).toHaveLength(1);
    // …and not once it has ended.
    await sb.from("brand_members").update({ access_until: new Date(Date.now() - 60_000).toISOString() }).eq("brand_id", brand!.id).eq("user_id", B.userId);
    expect((await read()).status()).toBe(404);
    expect((await bDb.from("brand_profiles").select("id").eq("id", brand!.id)).data).toHaveLength(0);
    expect((await bDb.from("content").select("id").eq("brand_id", brand!.id)).data).toHaveLength(0);
    // Renew it from the panel: 30 days from today.
    await a.page.reload();
    await a.page.getByRole("button", { name: /^Share/ }).first().click({ timeout: 30_000 });
    await expect(panel.getByText("Access ended")).toBeVisible({ timeout: 20_000 });
    await panel.getByLabel(/Access for /).selectOption("30d");
    await expect.poll(async () => ((await read()).status()), { timeout: 15_000 }).toBe(200);

    // 2. A hands the brand to C, staying on as an editor.
    await panel.getByRole("button", { name: "Hand it over…" }).click();
    await panel.getByLabel("New owner's email").fill(C.email);
    await panel.getByLabel("Type the brand name to confirm").fill("Handover Test");
    await panel.getByRole("button", { name: /Prepare the handover/ }).click();
    await expect(panel.getByText(/Waiting for/)).toBeVisible({ timeout: 20_000 });
    const { data: offer } = await sb.from("brand_transfers").select("token").eq("brand_id", brand!.id).single();
    // Only C can accept: B (with the link) is refused.
    expect((await b.page.request.post(`${BASE}/api/brand-transfer`, { data: { action: "accept", token: offer!.token } })).status()).toBe(403);
    const c = await signedIn(browser, C);
    await c.page.goto(`${BASE}/transfer/${offer!.token}`);
    await expect(c.page.getByText(/2 posts · 1 product/)).toBeVisible({ timeout: 30_000 });
    await c.page.getByRole("button", { name: /Accept Handover Test/ }).click();
    await c.page.waitForURL(/\/studio\/brand/, { timeout: 60_000 });

    const { data: moved } = await sb.from("brand_profiles").select("client_id").eq("id", brand!.id).single();
    expect(moved!.client_id).toBe(C.clientId);
    const { data: posts } = await sb.from("content").select("client_id").eq("brand_id", brand!.id);
    expect(posts!.every((p) => p.client_id === C.clientId)).toBe(true);
    const { data: products } = await sb.from("products").select("client_id").eq("brand_id", brand!.id);
    expect(products![0].client_id).toBe(C.clientId);
    const { data: members } = await sb.from("brand_members").select("user_id, role").eq("brand_id", brand!.id);
    expect(members).toEqual([{ user_id: A.userId, role: "editor" }]);
    // A works in it as an editor now (C's workspace), B is out.
    const aRole = await (await a.page.request.get(`${BASE}/api/brand-sharing?brandId=${brand!.id}`)).json();
    expect(aRole.role).toBe("editor");
    expect((await read()).status()).toBe(404);
    // The link can't be used twice.
    expect((await c.page.request.post(`${BASE}/api/brand-transfer`, { data: { action: "accept", token: offer!.token } })).status()).toBe(410);
    await Promise.all([a.ctx.close(), b.ctx.close(), c.ctx.close()]);
  } finally {
    for (const p of people) {
      await sb.from("brand_transfers").delete().eq("from_client", p.clientId);
      const { data: brands } = await sb.from("brand_profiles").select("id").eq("client_id", p.clientId);
      for (const br of brands ?? []) {
        await sb.from("brand_members").delete().eq("brand_id", br.id);
        await sb.from("brand_invites").delete().eq("brand_id", br.id);
      }
      await sb.from("content").delete().eq("client_id", p.clientId);
      await sb.from("products").delete().eq("client_id", p.clientId);
      await sb.from("brand_profiles").delete().eq("client_id", p.clientId);
      await sb.from("credit_transactions").delete().eq("client_id", p.clientId);
      await sb.from("credit_balances").delete().eq("client_id", p.clientId);
    }
    for (const p of people) { await sb.from("clients").delete().eq("id", p.clientId); await sb.auth.admin.deleteUser(p.userId); }
  }
});
