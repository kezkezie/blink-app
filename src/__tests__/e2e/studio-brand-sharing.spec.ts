import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared brands (Kezie, 2026-10-13: "two people working on one brand"). Three throwaway accounts:
 * the owner shares one of two brands by link (editor) and by email (viewer). The editor joins from
 * the link, sees only that brand, and makes one image (LIVE: z-image, 1 credit, about $0.004) that
 * is charged to the owner. The viewer accepts from the welcome page and can look but not make. The
 * database is checked from the member's own session too (RLS). Removing the editor ends their
 * access. Everything is deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test studio-brand-sharing
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Person = { name: string; email: string; password: string; userId?: string; clientId?: string };

async function login(page: Page, p: Person, waitFor: RegExp = /\/(studio|welcome)/) {
  await page.fill('input[type="email"]', p.email);
  await page.fill('input[type="password"]', p.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(waitFor, { timeout: 120_000 });
}
async function post(req: APIRequestContext, path: string, data: unknown, headers: Record<string, string> = {}) {
  const res = await req.post(`${BASE}${path}`, { data, headers, timeout: 300_000 });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

test("brand sharing: link and email invites, editor spends the owner's credits, viewer only looks, removal ends access", async ({ browser }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(600_000);
  const sb: SupabaseClient = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const pw = () => `Sh-${Math.random().toString(36).slice(2)}-${stamp}`;
  const owner: Person = { name: "Kezie Owner", email: `e2e-share-owner-${stamp}@blinkspot-test.dev`, password: pw() };
  const editor: Person = { name: "Brian Editor", email: `e2e-share-editor-${stamp}@blinkspot-test.dev`, password: pw() };
  const viewer: Person = { name: "Vera Viewer", email: `e2e-share-viewer-${stamp}@blinkspot-test.dev`, password: pw() };
  const late: Person = { name: "Lena Late", email: `e2e-share-late-${stamp}@blinkspot-test.dev`, password: pw() };
  const shared = { id: "", name: `Nuf Farms E2E ${stamp % 10000}` };
  const priv = { id: "", name: `Owner Private E2E ${stamp % 10000}` };
  const errors: string[] = [];

  try {
    // ── Accounts: the owner has two brands, 60 credits and an Instagram account on the shared brand.
    for (const p of [owner, editor, viewer]) {
      const { data, error } = await sb.auth.admin.createUser({ email: p.email, password: p.password, email_confirm: true, user_metadata: { full_name: p.name } });
      expect(error).toBeNull();
      p.userId = data.user!.id;
      const { data: c, error: ce } = await sb.from("clients").insert({ user_id: p.userId, company_name: `${p.name}'s Workspace`, contact_name: p.name, contact_email: p.email, plan_tier: "free", onboarding_status: "active" }).select("id").single();
      expect(ce).toBeNull();
      p.clientId = c!.id;
      await sb.from("credit_balances").upsert({ client_id: p.clientId, balance: p === owner ? 60 : 7 }, { onConflict: "client_id" });
    }
    await sb.auth.admin.updateUserById(owner.userId!, { user_metadata: { full_name: owner.name, onboarding_completed: true } });
    const { data: brands } = await sb.from("brand_profiles").insert([
      { client_id: owner.clientId, brand_name: shared.name, company_name: shared.name, industry: "Agriculture", description: "Fresh farm produce from Kiambu.", is_active: true },
      { client_id: owner.clientId, brand_name: priv.name, company_name: priv.name, is_active: true },
    ]).select("id, brand_name");
    shared.id = brands!.find((b) => b.brand_name === shared.name)!.id;
    priv.id = brands!.find((b) => b.brand_name === priv.name)!.id;
    await sb.from("social_accounts").insert({ client_id: owner.clientId, brand_id: shared.id, platform: "instagram", account_name: "nuf_e2e", meta_page_token: "E2E-SECRET-TOKEN", is_active: true, connected_at: new Date().toISOString() });
    await sb.from("content").insert([
      { client_id: owner.clientId, brand_id: shared.id, content_type: "post_image", status: "draft", caption: `Shared post ${stamp}`, image_urls: [] },
      { client_id: owner.clientId, brand_id: priv.id, content_type: "post_image", status: "draft", caption: `Private post ${stamp}`, image_urls: [] },
    ]);

    // ── Owner: Share panel → an editor link, then a viewer invite by email.
    const ownerCtx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const op = await ownerCtx.newPage();
    op.on("pageerror", (e) => errors.push(`owner: ${e.message}`));
    await op.goto(`${BASE}/login`);
    await login(op, owner, /\/studio/);
    await op.getByRole("button", { name: "Switch brand" }).click({ timeout: 30_000 });
    await op.getByRole("menuitem", { name: shared.name, exact: true }).click();
    await op.getByRole("button", { name: "Switch brand" }).click();
    await op.getByRole("menuitem", { name: `Share ${shared.name}` }).click();
    const panel = op.getByRole("dialog", { name: `Share ${shared.name}` });
    await expect(panel.getByText("Only you, so far.")).toBeVisible({ timeout: 20_000 });
    await panel.getByRole("button", { name: "Create an invite link" }).click();
    const linkBox = panel.getByRole("textbox", { name: "Invite link" });
    await expect(linkBox).toHaveValue(/\/join\/[A-Za-z0-9_-]{40,}$/, { timeout: 20_000 });
    const link = await linkBox.inputValue();
    await panel.getByRole("button", { name: "Viewer" }).click();
    await panel.getByLabel("Their email").fill(viewer.email);
    await panel.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(panel.getByText(`Invite ready for ${viewer.email}`)).toBeVisible({ timeout: 20_000 });
    await op.screenshot({ path: "test-results/sharing-panel.png" });
    await op.keyboard.press("Escape");
    const joinPath = new URL(link).pathname;

    // ── Editor: opens the link signed out, signs in, joins, lands in the shared brand.
    const edCtx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const ep = await edCtx.newPage();
    ep.on("pageerror", (e) => errors.push(`editor: ${e.message}`));
    await ep.goto(`${BASE}${joinPath}`);
    await expect(ep.getByRole("heading", { name: `Join ${shared.name}` })).toBeVisible({ timeout: 30_000 });
    await expect(ep.getByText(`${owner.name} invited you`)).toBeVisible();
    await ep.getByRole("link", { name: "Sign in" }).click();
    await login(ep, editor, /\/join\//);
    await ep.getByRole("button", { name: `Join ${shared.name}` }).click({ timeout: 30_000 });
    await ep.waitForURL(/\/studio(\?|$)/, { timeout: 60_000 });
    const bar = ep.getByTestId("shared-brand-bar");
    await expect(bar).toContainText(`is shared with you by ${owner.name}`, { timeout: 30_000 });
    await expect(bar).toContainText("uses their credits");
    // The header shows the owner's balance, the one this work spends (the studio sends the brand).
    await expect(ep.getByTitle("Credit balance")).toContainText("60", { timeout: 30_000 });
    await ep.getByRole("button", { name: "Switch brand" }).click();
    await expect(ep.getByText("Shared with you", { exact: true })).toBeVisible();
    await expect(ep.getByText("No brand of your own yet.")).toBeVisible();
    await expect(ep.getByRole("menuitem", { name: new RegExp(priv.name) })).toHaveCount(0);
    await ep.keyboard.press("Escape");
    await ep.screenshot({ path: "test-results/sharing-editor.png" });

    // The link let one person in; it can't be used again.
    const reuse = await (await ep.request.get(`${BASE}/api/brand-sharing?token=${joinPath.split("/").pop()}`)).json();
    expect(reuse.status).toBe("used");

    // ── Editor makes one image in the shared brand: charged to the owner, saved in the owner's brand.
    const t0 = new Date(Date.now() - 2000).toISOString();
    const gen = await post(ep.request, "/api/workflows?path=blink-generate-images", {
      client_id: owner.clientId, brand_id: shared.id, mode: "standard", prompt: "Fresh sukuma wiki on a wooden crate",
      assembled_prompt: `A bright photo of fresh sukuma wiki on a wooden crate at a farm stall, morning light, for the brand "${shared.name}". No text.`,
      reference_image_urls: [], kie_model: "z-image", imageEngine: "z-image", aspect_ratio: "1:1", style: "realistic",
      strict_brand_alignment: true, numImages: 1, brand_name: shared.name, is_sync: true,
    });
    expect(gen.status, JSON.stringify(gen.body)).toBe(200);
    await expect.poll(async () => {
      const { data } = await sb.from("credit_transactions").select("amount").eq("client_id", owner.clientId!).gte("created_at", t0);
      return -(data ?? []).reduce((n, r) => n + (r.amount as number), 0);
    }, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
    const { data: edLedger } = await sb.from("credit_transactions").select("amount").eq("client_id", editor.clientId!).gte("created_at", t0);
    expect(edLedger ?? []).toHaveLength(0);
    // The balance route: with the brand header it's the owner's, without it the editor's own 7.
    expect((await (await ep.request.get(`${BASE}/api/credits/balance`, { headers: { "x-blink-brand": shared.id } })).json()).balance).toBeLessThan(60);
    expect((await (await ep.request.get(`${BASE}/api/credits/balance`)).json()).balance).toBe(7);

    // ── What the editor can't do.
    const otherBrand = await post(ep.request, "/api/workflows?path=blink-generate-images", {
      client_id: owner.clientId, brand_id: priv.id, mode: "standard", prompt: "x", assembled_prompt: "x", kie_model: "z-image", imageEngine: "z-image", aspect_ratio: "1:1", numImages: 1, is_sync: true,
    });
    expect(otherBrand.status).toBe(404);
    expect((await post(ep.request, "/api/brand-sharing", { action: "invite", brandId: shared.id })).status).toBe(403);
    expect((await ep.request.get(`${BASE}/api/brand-sharing?brandId=${priv.id}`)).status()).toBe(404);
    const forged = await post(ep.request, "/api/workflows?path=blink-generate-images", {
      client_id: owner.clientId, mode: "standard", prompt: "x", assembled_prompt: "x", kie_model: "z-image", imageEngine: "z-image", aspect_ratio: "1:1", numImages: 1, is_sync: true,
    }, { "x-blink-brand": priv.id });
    // A header naming a brand you can't use, with the owner's workspace id, is refused like any stranger.
    expect(forged.status).toBe(404);

    // ── The database from the editor's own session (RLS): this brand and its posts, nothing else.
    const asEditor = createClient(URL_, ANON, { auth: { persistSession: false } });
    expect((await asEditor.auth.signInWithPassword({ email: editor.email, password: editor.password })).error).toBeNull();
    const seenBrands = (await asEditor.from("brand_profiles").select("id")).data?.map((b) => b.id) ?? [];
    expect(seenBrands).toEqual([shared.id]);
    const seenPosts = (await asEditor.from("content").select("caption, brand_id").eq("client_id", owner.clientId!)).data ?? [];
    expect(seenPosts.length).toBeGreaterThan(0);
    expect(seenPosts.every((p) => p.brand_id === shared.id)).toBe(true);
    expect((await asEditor.from("clients").select("id").eq("id", owner.clientId!)).data).toEqual([]);
    expect((await asEditor.from("social_accounts").select("meta_page_token")).data).toEqual([]);
    expect((await asEditor.rpc("brand_platforms", { p_brand: shared.id })).data).toEqual([{ platform: "instagram", account_name: "nuf_e2e" }]);
    expect((await asEditor.rpc("brand_platforms", { p_brand: priv.id })).data).toEqual([]);
    expect((await asEditor.from("credit_transactions").select("id").eq("client_id", owner.clientId!)).data).toEqual([]);
    const planted = await asEditor.from("content").insert({ client_id: owner.clientId, brand_id: priv.id, content_type: "post_image", caption: "should fail" });
    expect(planted.error).not.toBeNull();

    // ── Viewer: signs in, the invite is on the welcome page; joins; can look, not make.
    const vCtx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const vp = await vCtx.newPage();
    vp.on("pageerror", (e) => errors.push(`viewer: ${e.message}`));
    // The used editor link refuses a second person.
    await vp.goto(`${BASE}/login`);
    await login(vp, viewer, /\/welcome/);
    expect((await post(vp.request, "/api/brand-sharing", { action: "accept", token: joinPath.split("/").pop() })).status).toBe(410);
    await expect(vp.getByText(`${owner.name} shared ${shared.name} with you as viewer`)).toBeVisible({ timeout: 30_000 });
    await vp.getByRole("button", { name: `Join ${shared.name}` }).click();
    await vp.waitForURL(/\/studio(\?|$)/, { timeout: 60_000 });
    await expect(vp.getByTestId("shared-brand-bar")).toContainText("You can look, not change anything", { timeout: 30_000 });
    // A viewer spends nothing of the owner's, so the header shows their own balance.
    await expect(vp.getByTitle("Credit balance")).toContainText("7", { timeout: 30_000 });
    await vp.goto(`${BASE}/studio/image`);
    await expect(vp.getByText(`You can view ${shared.name}, not make things for it`)).toBeVisible({ timeout: 30_000 });
    const viewerGen = await post(vp.request, "/api/workflows?path=blink-generate-images", {
      client_id: owner.clientId, brand_id: shared.id, mode: "standard", prompt: "x", assembled_prompt: "x", kie_model: "z-image", imageEngine: "z-image", aspect_ratio: "1:1", numImages: 1, is_sync: true,
    });
    expect(viewerGen.status).toBe(404);
    await vp.screenshot({ path: "test-results/sharing-viewer.png" });

    // ── Sign-up doesn't confirm emails, so an account made after its email invite sees nothing in
    // the app (it could be anyone typing that address); the link the owner sends still works.
    const lateInvite = await post(op.request, "/api/brand-sharing", { action: "invite", brandId: shared.id, role: "viewer", email: late.email });
    expect(lateInvite.status, JSON.stringify(lateInvite.body)).toBe(200);
    {
      const { data, error } = await sb.auth.admin.createUser({ email: late.email, password: late.password, email_confirm: true, user_metadata: { full_name: late.name } });
      expect(error).toBeNull();
      late.userId = data.user!.id;
      const { data: c } = await sb.from("clients").insert({ user_id: late.userId, company_name: "Late", contact_name: late.name, contact_email: late.email, plan_tier: "free", onboarding_status: "active" }).select("id").single();
      late.clientId = c!.id;
    }
    const lCtx = await browser.newContext();
    const lp = await lCtx.newPage();
    await lp.goto(`${BASE}/login`);
    await login(lp, late, /\/welcome/);
    expect((await (await lp.request.get(`${BASE}/api/brand-sharing?view=invites`)).json()).invites).toEqual([]);
    const lateJoin = await post(lp.request, "/api/brand-sharing", { action: "accept", token: String(lateInvite.body.invite.link).split("/").pop() });
    expect(lateJoin.status, JSON.stringify(lateJoin.body)).toBe(200);
    expect(lateJoin.body.brand.role).toBe("viewer");

    // ── Free shares a brand with 3 people (Kezie, 2026-10-13): a fourth is refused with the way up.
    const fourth = await post(op.request, "/api/brand-sharing", { action: "invite", brandId: shared.id, role: "viewer" });
    expect(fourth.status).toBe(409);
    expect(fourth.body.code).toBe("seats_full");
    expect(fourth.body.error).toMatch(/Free plan shares a brand with up to 3 people/);

    // ── Owner sees the people, removes the editor; the editor loses the brand at once.
    await op.getByRole("button", { name: "Switch brand" }).click();
    await op.getByRole("menuitem", { name: `Share ${shared.name}` }).click();
    await expect(panel.getByText("3 of 3 people on your Free plan")).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByRole("button", { name: "Create an invite link" })).toBeDisabled();
    await expect(panel.getByText(editor.email)).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText(viewer.email)).toBeVisible();
    await panel.getByRole("button", { name: `Remove ${editor.email}` }).click();
    await expect(panel.getByText(editor.email)).toHaveCount(0, { timeout: 20_000 });
    const after = await post(ep.request, "/api/workflows?path=blink-generate-images", {
      client_id: owner.clientId, brand_id: shared.id, mode: "standard", prompt: "x", assembled_prompt: "x", kie_model: "z-image", imageEngine: "z-image", aspect_ratio: "1:1", numImages: 1, is_sync: true,
    });
    expect(after.status).toBe(404);
    expect(((await asEditor.from("brand_profiles").select("id")).data ?? [])).toEqual([]);
    await ep.reload();
    await expect(ep.getByTestId("shared-brand-bar")).toHaveCount(0, { timeout: 30_000 });
    expect(errors).toEqual([]);
  } finally {
    const clientIds = [owner, editor, viewer, late].map((p) => p.clientId).filter(Boolean) as string[];
    if (clientIds.length) {
      await sb.from("content").delete().in("client_id", clientIds);
      await sb.from("social_accounts").delete().in("client_id", clientIds);
      await sb.from("brand_profiles").delete().in("client_id", clientIds);
      await sb.from("credit_transactions").delete().in("client_id", clientIds);
      await sb.from("credit_balances").delete().in("client_id", clientIds);
      await sb.from("clients").delete().in("id", clientIds);
    }
    for (const p of [owner, editor, viewer, late]) if (p.userId) await sb.auth.admin.deleteUser(p.userId);
  }
});
