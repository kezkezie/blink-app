import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * LIVE: the Website builder end to end (one assistant call, no image credits): build the page from
 * the active brand, check the preview, publish at a throwaway address, open it, take it offline.
 * Skips if the brand's page is already live, so a real published site is never disturbed.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test live-qa-site-builder
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("website: build → preview → publish → public page → offline", async ({ page, context }) => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD not set");
  test.setTimeout(300_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
  await page.goto(`${BASE}/studio/sites`);
  const start = page.getByRole("button", { name: /Build my landing page/ }).or(page.getByRole("button", { name: /^Rebuild/ }));
  await start.first().waitFor({ timeout: 60_000 });
  test.skip(await page.getByText("Live", { exact: true }).isVisible(), "This brand's page is live; not touching it");
  const built = page.waitForResponse((r) => r.url().includes("/api/sites/build"), { timeout: 150_000 });
  await start.first().click();
  expect((await built).status()).toBe(200);
  const frame = page.frameLocator("iframe[title='Preview']");
  await expect(frame.locator("h1").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Phone/ }).click();
  const slug = `qa-${Date.now().toString(36)}`;
  await page.getByRole("button", { name: /^Publish/ }).click();
  await page.locator("#site-slug").fill(slug);
  await page.getByRole("dialog", { name: "Publish your page" }).getByRole("button", { name: /^Publish$/ }).click();
  await expect(page.getByRole("link", { name: /Open live page/ })).toBeVisible({ timeout: 20_000 });
  const pub = await context.newPage();
  expect((await pub.goto(`${BASE}/s/${slug}`))?.status()).toBe(200);
  await expect(pub.locator("h1").first()).toBeVisible();
  await expect(pub.getByRole("link", { name: "Made with BlinkSpot" })).toBeVisible();
  await page.getByRole("button", { name: /Publish changes/ }).click();
  await page.getByRole("button", { name: /Take offline/ }).click();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible({ timeout: 10_000 });
  expect((await pub.goto(`${BASE}/s/${slug}?t=${Date.now()}`))?.status()).toBe(404);
  // Don't leave the throwaway address on the draft (it would be pre-filled when the owner publishes).
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY).from("sites").update({ slug: null }).eq("slug", slug).eq("published", false);
  expect(errors).toEqual([]);
});
