import { test, expect } from "@playwright/test";

/** blinkspot.io homepage: renders, the hero demo cycles real examples, CTAs lead to sign-up, no sideways scroll on phones. */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("homepage", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("From one sentence");
  // The demo types a prompt, then shows a real example.
  await expect(page.getByTestId("hero-prompt")).toContainText("mango juice", { timeout: 15_000 });
  await expect(page.getByText("Nano Banana 2 · 4K · 18 cr").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("hero-prompt")).toContainText("kitenge", { timeout: 20_000 });
  for (const id of ["how", "features", "examples", "pricing"]) await expect(page.locator(`#${id}`)).toHaveCount(1);
  await expect(page.getByRole("slider", { name: /Compare the inspo/ })).toBeVisible();
  await page.getByRole("link", { name: /^Start free/ }).first().click();
  await page.waitForURL(/\/get-started/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
