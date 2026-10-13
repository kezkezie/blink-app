import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A real Paystack TEST-MODE payment, end to end (2026-10-13: Paystack in KES at 129 per $1).
 * A new Free account upgrades to Starter on Paystack's own checkout with Paystack's test card,
 * comes back to Billing, and gets the plan and its 1,500 credits exactly once; then, now on
 * Starter, buys a top-up. Then one app-side Kie call (remove background, 2 credits) proves the
 * app's Kie key works. Skips itself unless the site is on a Paystack test key. Everything deleted.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test payments-paystack-test
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * Paystack's test checkout offers Success / Bank Authentication / Declined; pick Success and pay.
 * Paystack sits behind Cloudflare, which sometimes stops a headless browser with a bot check:
 * then this returns "challenged" and the caller checks what it can without paying.
 */
async function payOnPaystack(page: Page, expectAmount: RegExp): Promise<"paid" | "challenged"> {
  await page.waitForURL(/checkout\.paystack\.com/, { timeout: 60_000 });
  const pay = page.getByRole("button", { name: expectAmount });
  const challenge = page.getByRole("heading", { name: "Performing security verification" });
  await expect(pay.or(challenge)).toBeVisible({ timeout: 60_000 });
  if (await challenge.isVisible()) {
    await expect(pay).toBeVisible({ timeout: 45_000 }).catch(() => {});
    if (!(await pay.isVisible())) return "challenged";
  }
  const success = page.getByText("Success", { exact: true });
  if (await success.isVisible({ timeout: 10_000 }).catch(() => false)) await success.click({ timeout: 10_000 });
  else {
    await page.screenshot({ path: "test-results/paystack-no-success.png", fullPage: true });
    console.log("PAYSTACK page:", (await page.locator("body").innerText({ timeout: 5_000 })).slice(0, 800));
  }
  await expect(pay).toBeEnabled({ timeout: 15_000 });
  await pay.click({ timeout: 15_000 });
  await page.waitForURL((u) => u.pathname === "/studio/account/billing" && u.searchParams.has("checkout"), { timeout: 120_000 });
  return "paid";
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("Paystack test payment: Free upgrades to Starter, then tops up; Kie key works", async ({ page, browser }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(600_000);
  const t0 = Date.now(); const step = (m: string) => console.log(`PAY ${Math.round((Date.now() - t0) / 1000)}s ${m}`);
  const status = await (await page.request.get(`${BASE}/api/billing/status`)).json();
  test.skip(!status.online || !status.test, "only runs against a Paystack test key");
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-paystack-${stamp}@blinkspot-test.dev`;
  const password = `Ps-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Pay Tester", onboarding_completed: true } });
  expect(error).toBeNull();
  const userId = data.user!.id;
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: userId, company_name: "Pay Tester", contact_name: "Pay Tester", contact_email: email, plan_tier: "free", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await signIn(page, email, password);
    await page.goto(`${BASE}/studio/account/billing`);
    const ledger = async () => (await sb.from("credit_transactions").select("amount, description").eq("client_id", clientId!)).data ?? [];
    const balance = async () => ((await sb.from("credit_balances").select("balance").eq("client_id", clientId!).maybeSingle()).data?.balance as number) ?? 0;
    const start = await balance();

    // 1. Free → Starter ($25 = KES 3,225 at 129).
    await page.getByRole("button", { name: "Upgrade to Starter" }).click({ timeout: 30_000 });
    expect(await payOnPaystack(page, /^Pay KES 3,225$/)).toBe("paid");
    await expect.poll(async () => (await sb.from("clients").select("plan_tier, billing_status").eq("id", clientId!).single()).data, { timeout: 60_000 })
      .toMatchObject({ plan_tier: "starter", billing_status: "active" });
    await expect.poll(balance, { timeout: 30_000 }).toBe(start + 1500);
    const plan = (await sb.from("payments").select("status, currency, amount_minor, kind").eq("client_id", clientId!).eq("kind", "plan")).data ?? [];
    expect(plan).toEqual([expect.objectContaining({ status: "paid", currency: "KES", amount_minor: 322500 })]);
    // The webhook and the return page both settle it; the credits land once.
    await page.waitForTimeout(8000);
    expect((await ledger()).filter((r) => r.amount === 1500)).toHaveLength(1);
    await expect(page.getByText("Starter").first()).toBeVisible();
    await page.screenshot({ path: "test-results/paystack-after-plan.png", fullPage: true });

    step("plan paid and granted once");
    // 2. Now on Starter, a top-up works ($3 = KES 387), in a fresh browser (Cloudflare is warier of
    // a second checkout from the same one).
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await signIn(p2, email, password);
    await p2.goto(`${BASE}/studio/account/billing`);
    await p2.getByRole("button", { name: "Buy 300 credits for $3" }).click({ timeout: 30_000 });
    step("top-up checkout opening");
    const topUp = await payOnPaystack(p2, /^Pay KES 387$/);
    step(`top-up: ${topUp}`);
    if (topUp === "paid") {
      await expect.poll(balance, { timeout: 60_000 }).toBe(start + 1800);
      await p2.waitForTimeout(8000);
      expect((await ledger()).filter((r) => r.amount === 300)).toHaveLength(1);
    } else {
      // Not paid (bot check), but Paystack accepted the top-up for a Starter account, in shillings.
      const pending = (await sb.from("payments").select("status, currency, amount_minor").eq("client_id", clientId!).eq("kind", "credit_pack")).data ?? [];
      expect(pending).toEqual([expect.objectContaining({ status: "pending", currency: "KES", amount_minor: 38700 })]);
      console.log("TOP-UP: Paystack's Cloudflare check stopped the headless browser; checkout opened in KES 387 (not paid).");
    }
    await ctx2.close();

    step("top-up checked");
    // 3. The app's own Kie key (remove background), on a picture in the account's folder.
    const png = Buffer.from(await (await fetch(`${BASE}/brand/mark-lime.png`)).arrayBuffer());
    const path = `images/${clientId}/kie_check_${stamp}.png`;
    expect((await sb.storage.from("assets").upload(path, png, { contentType: "image/png" })).error).toBeNull();
    const url = sb.storage.from("assets").getPublicUrl(path).data.publicUrl;
    step("remove-bg calling");
    const cut = await page.request.post(`${BASE}/api/editor/remove-bg`, { data: { url }, timeout: 180_000 });
    const cutBody = await cut.json();
    expect(cut.status(), JSON.stringify(cutBody)).toBe(200);
    console.log("KIE remove-bg OK:", JSON.stringify(cutBody).slice(0, 160));
    await sb.storage.from("assets").remove([path]);
  } finally {
    if (clientId) {
      await sb.from("payments").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(userId);
  }
});
