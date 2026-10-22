import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The balance turns red (Kezie, 2026-10-22: "people can get very carried away"). Throwaway
 * account: plain at 300, red with a warning under 100, solid red with a second warning under one
 * Best image, and shown on a phone once it's low. Deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test credit-low --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, email: string, password: string) {
  // Not "load": PostHog's scripts can hold it for a minute on a slow line (they load fine on the site).
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  // Filled before the form hydrates, a click does nothing: try again until it signs in.
  for (let i = 0; i < 4; i++) {
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    if (await page.waitForURL(/\/(studio|welcome)/, { timeout: 20_000, waitUntil: "commit" }).then(() => true, () => false)) return;
  }
  throw new Error("couldn't sign in");
}

test("the credit pill turns red as the balance runs low, with one warning per level", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(180_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-lowcredits-${stamp}@blinkspot-test.dev`;
  const password = `Lc-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Low Credits", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Low Credits", contact_name: "Low Credits", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", industry: "Fashion", is_active: true });
    const setBalance = (balance: number) => sb.from("credit_balances").upsert({ client_id: clientId!, balance }, { onConflict: "client_id" });
    await setBalance(300);
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 300)));
    await signIn(page, email, password);
    await page.goto(`${BASE}/studio/library`, { waitUntil: "domcontentloaded" });
    const pill = page.locator('[data-tour="credits"]');
    await expect(pill).toHaveText(/300\s*credits/, { timeout: 30_000 });
    await expect(pill).toHaveAttribute("data-level", "ok");

    // Spent down to 84: red, and one warning that says what's left.
    await setBalance(84);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(pill).toHaveAttribute("data-level", "low", { timeout: 15_000 });
    await expect(page.getByText("You have 84 credits left, about 4 Best images.", { exact: false })).toBeVisible();
    expect(await pill.evaluate((e) => getComputedStyle(e).color)).toBe("rgb(255, 93, 93)");
    await page.screenshot({ path: "test-results/credit-low.png" });

    // Down to 10: solid red, "Top up", a second warning with Get credits.
    await setBalance(10);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(pill).toHaveAttribute("data-level", "out", { timeout: 15_000 });
    await expect(pill).toContainText("Top up");
    await expect(page.getByText(/You have 10 credits left, not enough for a Best image/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Get credits" }).last()).toBeVisible();
    await page.screenshot({ path: "test-results/credit-out.png" });

    // On a phone the pill is hidden while there's room, and shown once it's low.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(pill).toBeVisible({ timeout: 30_000 });
    await expect(pill).toHaveAttribute("data-level", "out");
    await page.screenshot({ path: "test-results/credit-out-phone.png" });
    await setBalance(300);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(pill).toHaveAttribute("data-level", "ok", { timeout: 30_000 });
    await expect(pill).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    if (clientId) {
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
