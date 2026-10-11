import { test, expect, type Page } from "@playwright/test";

/**
 * The storyboard in the studio look (2026-10-11): story box, scene board, one scene open in the
 * panel, story settings tab, one bar to render. No generation: paid and AI routes are blocked and no
 * render button is pressed. The classic (Vintage) storyboard still renders.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test studio-storyboard
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const BLOCKED = ["**/api/workflows**", "**/api/video**", "**/api/video-jobs**", "**/api/ai/**", "**/api/assistant**", "**api.kie.ai/**", "**n8n.srv1166077.hstgr.cloud/**"];

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
}

test("storyboard: board, open scene, engine reroute note, story settings; classic still renders", async ({ page, context }) => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD not set");
  test.setTimeout(180_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const hits: string[] = [];
  for (const p of BLOCKED) await page.route(p, (r) => { hits.push(r.request().url()); return r.abort(); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`${BASE}/studio/video?mode=storytelling`);
  await expect(page.getByText("Your story")).toBeVisible({ timeout: 30_000 });

  const cards = page.locator(".sb-card");
  const before = await cards.count();
  expect(before).toBeGreaterThan(0);
  // Start from a clean scene: add one and open it.
  await page.getByRole("button", { name: "Add a scene" }).click();
  await expect(cards).toHaveCount(before + 1);
  const n = before + 1;
  await expect(page.getByRole("tab", { name: `Scene ${n}` })).toBeVisible();
  await expect(page.getByRole("button", { name: /Render scenes|Render (all|\d+)/ })).toBeVisible();

  // Describe it: the board card shows the words and a price.
  const words = `E2E scene: slow push-in on a juice kiosk at sunrise ${Date.now()}`;
  await page.getByLabel(`What happens in scene ${n}`).fill(words);
  await expect(cards.nth(n - 1)).toContainText("E2E scene");
  await expect(cards.nth(n - 1)).toContainText(/≈\d+ cr/);
  await expect(page.getByRole("button", { name: /Render scene/ })).toBeEnabled();

  // Kling is paused: the panel says where it renders.
  await page.locator("select").filter({ has: page.locator('option[value="kling-3.0/video"]') }).first().selectOption("kling-3.0/video");
  await expect(page.getByText(/Kling is paused/)).toBeVisible();
  await expect(page.getByText(/Seedance 2 \(Cinematic\) · \d+ s/)).toBeVisible();
  await page.screenshot({ path: "test-results/sb-scene.png" });

  // Story settings tab.
  await page.getByRole("tab", { name: "Story settings" }).click();
  await expect(page.getByText("Same people in every scene")).toBeVisible();
  await expect(page.getByText("Opening frames only")).toBeVisible();

  // Remove the scene we added.
  await page.getByRole("tab", { name: `Scene ${n}` }).click();
  await page.getByRole("button", { name: "Delete scene" }).click();
  await expect(cards).toHaveCount(before);

  // Classic (Vintage) storyboard still renders with the shared dialogs.
  await context.addCookies([{ name: "ui", value: "classic", url: BASE }]);
  await page.goto(`${BASE}/dashboard/video`);
  await page.waitForTimeout(3000);
  expect(hits).toEqual([]);
  expect(errors).toEqual([]);
});
