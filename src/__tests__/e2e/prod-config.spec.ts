import { test, expect } from "@playwright/test";

/**
 * Every server setting the features need is present (names only). Run first after a deploy:
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test prod-config
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("server settings are all present", async ({ page }) => {
  test.skip(!email || !password, "needs E2E login");
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
  const res = await page.request.get(`${BASE}/api/health/config`);
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body, JSON.stringify(body, null, 1)).toMatchObject({ ok: true, missing: [], warnings: [] });
});
