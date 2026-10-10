import { test, expect } from "@playwright/test";

/**
 * LIVE: the brand builder end to end (real assistant calls, no image credits). Describes a business,
 * gets a proposal and three vector logos, creates the brand with a logo, then deletes it again from
 * Manage brands. Needs a free brand slot on the test account's plan; skips otherwise.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test live-qa-brand-builder
 */

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("brand builder: describe → proposal → logos → create → delete", async ({ page }) => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD not set");
  test.setTimeout(420_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/studio/brand-builder`);
  await page.getByRole("button", { name: "Use the example" }).click();
  await page.waitForTimeout(1500);
  test.skip(await page.getByText(/brand slots?|You're using \d+ of \d+ brand/).isVisible(), "No free brand slot on the test account's plan");

  await page.getByRole("button", { name: "Natural", exact: true }).click();
  await page.getByRole("button", { name: /Build my brand/ }).click();
  await expect(page.locator("#bb-pname")).toBeVisible({ timeout: 120_000 });
  const name = (await page.locator("#bb-pname").inputValue()).trim();
  expect(name.length).toBeGreaterThan(1);
  await expect(page.locator('button[aria-label^="Logo option"] svg').first()).toBeVisible({ timeout: 150_000 });
  await page.waitForFunction(() => document.querySelectorAll('button[aria-label^="Logo option"] .animate-spin').length === 0, null, { timeout: 150_000 });
  await page.locator('button[aria-label^="Logo option"]:has(svg)').first().click();
  await page.getByRole("button", { name: /^Create / }).click();
  await page.waitForURL(/\/studio\/brand$/, { timeout: 60_000 });
  await expect(page.locator('button[aria-label="Switch brand"] img')).toHaveAttribute("src", /\/logo_.*\.png$/, { timeout: 15_000 });

  // Clean up through the real delete flow.
  await page.getByRole("button", { name: "Switch brand" }).click();
  await page.getByRole("menuitem", { name: /Manage brands/ }).click();
  const dlg = page.getByRole("dialog", { name: "Manage brands" });
  await dlg.getByRole("button", { name: `Delete ${name} forever` }).click();
  await dlg.getByLabel("Type the brand name to confirm").fill(name);
  await dlg.getByRole("button", { name: /Delete forever/ }).click();
  await expect(dlg.getByRole("button", { name: `Delete ${name} forever` })).toHaveCount(0, { timeout: 60_000 });
  expect(errors).toEqual([]);
});
