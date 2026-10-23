import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The owner's admin dashboard (Kezie, 2026-10-23: "how many people are logged into the website").
 * 1. Anyone else is refused (page and API). 2. The owner sees live presence: two studio tabs of one
 * person count as 1 person, 2 tabs. Test 2 needs the e2e account in ADMIN_EMAILS on the server:
 *   ADMIN_EMAILS="keziefred@gmail.com,$E2E_TEST_EMAIL" next dev
 *   ADMIN_E2E=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test admin-dashboard --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 4; i++) {
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    if (await page.waitForURL(/\/(studio|welcome|dashboard)/, { timeout: 20_000, waitUntil: "commit" }).then(() => true, () => false)) return;
  }
  throw new Error("couldn't sign in");
}

test("anyone who isn't the owner is refused", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(120_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now(), email = `e2e-notadmin-${stamp}@blinkspot-test.dev`, password = `Na-${stamp}-x9q`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { onboarding_completed: true } });
  try {
    await signIn(page, email, password);
    const api = await page.request.get(`${BASE}/api/admin/stats`);
    expect(api.status()).toBe(403);
    await page.goto(`${BASE}/studio/admin`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("This page is for the BlinkSpot owner.")).toBeVisible({ timeout: 30_000 });
    expect(await page.getByRole("link", { name: "Admin" }).count()).toBe(0);
  } finally { await sb.auth.admin.deleteUser(u.user!.id); }
});

test("the owner sees who is on now, and the numbers", async ({ page, context }) => {
  test.skip(!process.env.ADMIN_E2E || !process.env.E2E_TEST_EMAIL, "needs ADMIN_E2E=1 and the e2e account in ADMIN_EMAILS");
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, process.env.E2E_TEST_EMAIL!, process.env.E2E_TEST_PASSWORD!);
  await page.goto(`${BASE}/studio/admin`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Live now")).toBeVisible({ timeout: 30_000 });
  const tile = page.locator(".s-card.p-4", { hasText: "People on BlinkSpot" });
  await expect(tile.locator("b")).toHaveText("1", { timeout: 30_000 }); // this tab
  // A second tab of the same person: still 1 person, 2 tabs.
  const other = await context.newPage();
  await other.goto(`${BASE}/studio/library`, { waitUntil: "domcontentloaded" });
  await expect(tile).toContainText(/2 tabs/, { timeout: 30_000 });
  await expect(tile.locator("b")).toHaveText("1");
  await expect(page.locator(".s-card.p-4", { hasText: "Revenue this month" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/test and QA accounts not counted/)).toBeVisible();
  await page.screenshot({ path: "test-results/admin-dashboard.png", fullPage: true });
  await other.close();
  await expect(tile).toContainText(/1 tab\b/, { timeout: 30_000 });
});
