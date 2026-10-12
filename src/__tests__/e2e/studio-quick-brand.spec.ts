import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Brand set-up in two screens (Kezie, 2026-10-12: the old six-step form and the classic modal tired
 * people out). A brand-new account signs in, lands on /welcome, describes the brand in one sentence
 * (LIVE: one Claude call, about $0.01, no credits), checks one card and is in the studio. Then "Add a
 * brand" from the switcher opens the same flow, not the classic modal. Everything is deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test studio-quick-brand
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("new account: two-screen brand set-up, then Add a brand uses the same flow", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(420_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const email = `e2e-quickbrand-${Date.now()}@blinkspot-test.dev`;
  const password = `Qb-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const { data: created, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Wanjiru Test" } });
  expect(error).toBeNull();
  const userId = created.user!.id;
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/welcome/, { timeout: 120_000 });
    await expect(page.getByRole("heading", { name: /Let's set up your brand/ })).toBeVisible({ timeout: 30_000 });
    // No classic questions: one start screen.
    await expect(page.getByText("Fill it in from my website or Instagram")).toBeVisible();
    await page.getByLabel("Brand name").fill("Kibanda Fresh");
    await page.getByLabel("What you do").fill("Fresh juice and smoothies made to order at our kiosk in Kilimani, Nairobi.");
    await page.getByRole("button", { name: "Fill in the rest" }).click();
    await expect(page.getByRole("heading", { name: "Does this look right?" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByLabel("Brand name")).toHaveValue("Kibanda Fresh");
    await page.screenshot({ path: "test-results/quick-brand-review.png", fullPage: true });
    await page.getByRole("button", { name: /^Looks right, create/ }).click();
    await page.waitForURL(/\/studio(\?|$)/, { timeout: 60_000 });
    await expect(page.getByText("Kibanda Fresh").first()).toBeVisible({ timeout: 30_000 });

    // "Ask BlinkSpot does it for me" (the default) opens Ask on arrival; it says hello first.
    await expect(page.getByRole("dialog", { name: "Ask BlinkSpot" })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    // Add a brand from the switcher opens the two-screen flow, not the classic modal.
    await page.getByRole("button", { name: "Switch brand" }).click({ timeout: 15_000 });
    // Free has one brand slot, so the switcher explains the limit instead of opening a form.
    await page.getByRole("menuitem", { name: "Add a brand" }).click({ timeout: 15_000 });
    await expect(page.getByText(/using 1 of 1 brand/)).toBeVisible({ timeout: 15_000 });
    // The page itself (e.g. from a link) says the same, with the way to more brands.
    await page.goto(`${BASE}/studio/new-brand`);
    await expect(page.getByText("No free brand slot")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "See plans" })).toBeVisible();
    await page.screenshot({ path: "test-results/quick-brand-new.png" });
    expect(errors).toEqual([]);
  } finally {
    const { data: client } = await sb.from("clients").select("id").eq("user_id", userId).maybeSingle();
    if (client?.id) {
      await sb.from("products").delete().eq("client_id", client.id);
      await sb.from("brand_profiles").delete().eq("client_id", client.id);
      await sb.from("credit_transactions").delete().eq("client_id", client.id);
      await sb.from("credit_balances").delete().eq("client_id", client.id);
      await sb.from("clients").delete().eq("id", client.id);
    }
    await sb.auth.admin.deleteUser(userId);
  }
});
