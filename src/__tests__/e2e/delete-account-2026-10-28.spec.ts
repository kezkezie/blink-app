import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Delete my account (Kezie, 2026-10-28: "one of the most important things we need to have").
 * Throwaway A has two brands (one shared with throwaway B), posts, a website page, files, a payment,
 * a social connection, and a seat in B's brand. A deletes the account from Settings. Then:
 *   A's sign-in, brands, posts, website, credits, files and both brand seats are gone;
 *   the account row is an empty shell that only keeps the payment (tax);
 *   B's account, brand, post and file are untouched.
 * The social connection and queued post use made-up ids, so PostForMe only answers "not found".
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test delete-account --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("delete my account: everything of A goes, the payment stays on an empty shell, B is untouched", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(240_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const stamp = Date.now();
  const mk = async (tag: string) => {
    const email = `e2e-delete-${tag}-${stamp}@blinkspot-test.dev`, password = `Dl-${Math.random().toString(36).slice(2)}-${stamp}`;
    const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Delete ${tag}`, onboarding_completed: true } });
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: `Delete ${tag} Ltd`, contact_name: `Person ${tag}`, contact_email: email, contact_phone: "+254700000000", plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    return { email, password, userId: u.user!.id, clientId: c!.id as string };
  };
  const A = await mk("a"), B = await mk("b");
  const ids = { brandA1: "", brandA2: "", brandB: "" };
  try {
    const brand = async (clientId: string, name: string) => (await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: name, is_active: true }).select("*").single()).data!;
    const a1 = await brand(A.clientId, "Nuf Farms Delete"), a2 = await brand(A.clientId, "Second Brand Delete"), bb = await brand(B.clientId, "B's Bakery");
    ids.brandA1 = a1.id; ids.brandA2 = a2.id; ids.brandB = bb.id;
    const up = async (path: string) => { const { error } = await sb.storage.from("assets").upload(path, PNG, { contentType: "image/png", upsert: true }); expect(error).toBeNull(); return sb.storage.from("assets").getPublicUrl(path).data.publicUrl; };
    const picA = await up(`images/${A.clientId}/delete-test/pic.png`);
    await up(`brands/${a1.id}/logo.png`);
    const picB = await up(`images/${B.clientId}/keep.png`);
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    await sb.from("content").insert([
      { client_id: A.clientId, brand_id: a1.id, content_type: "post_image", status: "approved", caption: "A's post", image_urls: [picA, "https://res.cloudinary.com/dap8jijxa/image/upload/v1/blinkspot-e2e/never-existed.png"], scheduled_at: soon, postforme_tracking_id: `sp_e2e_missing_${stamp}` },
      { client_id: A.clientId, brand_id: a2.id, content_type: "post_image", status: "draft", caption: "A's draft" },
      { client_id: B.clientId, brand_id: bb.id, content_type: "post_image", status: "draft", caption: "B's post", image_urls: [picB] },
    ]);
    await sb.from("site_pages").insert({ client_id: A.clientId, brand_id: a1.id, name: "A's site", html: "<p>A</p>" });
    await sb.from("social_accounts").insert({ client_id: A.clientId, brand_id: a1.id, platform: "instagram", account_name: "a", postforme_account_id: `spc_e2e_missing_${stamp}`, is_active: true });
    await sb.from("payments").insert({ client_id: A.clientId, provider: "paystack", kind: "credit_pack", item: "pack_300", credits: 300, amount_minor: 300, currency: "USD", reference: `e2e-delete-${stamp}`, status: "paid", customer_email: A.email });
    await sb.from("brand_members").insert([{ brand_id: a1.id, user_id: B.userId, role: "editor" }, { brand_id: bb.id, user_id: A.userId, role: "editor" }]);

    await page.addInitScript((brand) => { localStorage.setItem("blink-active-brand", JSON.stringify({ state: { activeBrand: brand }, version: 0 })); localStorage.setItem("blink.tourDone", "1"); }, a1);
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', A.email); await page.fill('input[type="password"]', A.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/account/settings`);

    // What it says will go.
    const section = page.getByRole("region", { name: "Delete my account" });
    await section.getByRole("button", { name: /Delete my account/ }).click({ timeout: 30_000 });
    const dialog = page.getByRole("dialog");
    const list = dialog.getByRole("list", { name: "What gets deleted" });
    await expect(list).toContainText("2 brands", { timeout: 20_000 });
    await expect(list).toContainText("2 posts");
    await expect(list).toContainText("1 website page");
    await expect(dialog.getByText(/You share Nuf Farms Delete with other people/)).toBeVisible();
    await expect(dialog.getByText(/You'll be removed from B's Bakery/)).toBeVisible();
    await page.screenshot({ path: "test-results/delete-account-dialog.png" });
    // Only the exact sign-in email unlocks it.
    const go = dialog.getByRole("button", { name: "Delete my account" });
    await dialog.getByLabel("Your sign-in email").fill("DELETE");
    await expect(go).toBeDisabled();
    await dialog.getByLabel("Your sign-in email").fill(A.email.toUpperCase());
    await expect(go).toBeEnabled();
    await go.click();
    await page.waitForURL(/\/login\?deleted=1/, { timeout: 120_000 });
    await expect(page.getByText(/Your account and everything in it were deleted/)).toBeVisible();

    // A: gone, except the empty shell holding the payment.
    expect((await sb.auth.admin.getUserById(A.userId)).data.user).toBeNull();
    const { data: shell } = await sb.from("clients").select("user_id, company_name, contact_name, contact_email, contact_phone").eq("id", A.clientId).single();
    expect(shell).toEqual({ user_id: null, company_name: "Deleted account", contact_name: null, contact_email: null, contact_phone: null });
    const count = async (t: string, col: string, v: string) => (await sb.from(t).select("*", { count: "exact", head: true }).eq(col, v)).count;
    expect(await count("payments", "client_id", A.clientId)).toBe(1);
    for (const t of ["brand_profiles", "content", "site_pages", "social_accounts", "credit_balances", "credit_transactions"]) expect(await count(t, "client_id", A.clientId), t).toBe(0);
    expect(await count("brand_members", "brand_id", ids.brandA1)).toBe(0);
    expect(await count("brand_members", "user_id", A.userId)).toBe(0);
    expect((await sb.storage.from("assets").list(`images/${A.clientId}/delete-test`)).data ?? []).toEqual([]);
    expect((await sb.storage.from("assets").list(`brands/${ids.brandA1}`)).data ?? []).toEqual([]);
    // The made-up Cloudinary picture is listed on the shell to remove once Cloudinary keys are set (or removed now if they are).
    const { data: notes } = await sb.from("clients").select("onboarding_notes").eq("id", A.clientId).single();
    expect(String(notes!.onboarding_notes)).toContain("deleted_at");

    // B: untouched.
    expect((await sb.auth.admin.getUserById(B.userId)).data.user?.email).toBe(B.email);
    expect(await count("brand_profiles", "client_id", B.clientId)).toBe(1);
    expect(await count("content", "client_id", B.clientId)).toBe(1);
    expect(((await sb.storage.from("assets").list(`images/${B.clientId}`)).data ?? []).map((f) => f.name)).toContain("keep.png");
  } finally {
    for (const x of [A, B]) {
      for (const t of ["site_pages", "social_accounts", "content", "payments", "credit_transactions", "credit_balances"]) await sb.from(t).delete().eq("client_id", x.clientId);
      await sb.from("brand_members").delete().in("brand_id", [ids.brandA1, ids.brandA2, ids.brandB].filter(Boolean));
      await sb.from("brand_profiles").delete().eq("client_id", x.clientId);
      await sb.from("clients").delete().eq("id", x.clientId);
      await sb.auth.admin.deleteUser(x.userId).catch(() => {});
    }
    await sb.storage.from("assets").remove([`images/${A.clientId}/delete-test/pic.png`, `brands/${ids.brandA1}/logo.png`, `images/${B.clientId}/keep.png`]);
  }
});
