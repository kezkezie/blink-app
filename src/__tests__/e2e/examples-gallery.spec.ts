import { test, expect } from "@playwright/test";

/**
 * Examples gallery: cards render (images, hover videos, voices, logos), a card opens its recipe
 * (prompt + settings), and "Use this prompt" lands in the right studio with the prompt filled in.
 * READ-ONLY: nothing is generated.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test examples-gallery
 */

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const BLOCKED = ["**/api/workflows**", "**/api/video-jobs**", "**/api/image-jobs**", "**/api/video/**", "**/api/ai/**", "**/api/assistant**", "**/api/tts**", "**/api/brand/**", "**/api/inspo/**"];

test("examples gallery: browse, open a recipe, start from it", async ({ page }, testInfo) => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD not set");
  test.setTimeout(240_000);
  for (const p of BLOCKED) await page.route(p, (r) => r.abort());
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
  await page.setViewportSize({ width: 1440, height: 900 });

  // The Create page shows a strip that links to the full gallery.
  await page.goto(`${BASE}/studio`);
  await expect(page.getByText("Made with BlinkSpot")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: /See how each was made/ }).click();
  await page.waitForURL(/\/studio\/examples$/);
  await expect(page.locator("main").getByRole("heading", { name: "Examples" })).toBeVisible();
  const cards = page.locator('button[aria-label$="see how it was made"]');
  expect(await cards.count()).toBeGreaterThan(20);

  // Filters
  await page.getByRole("button", { name: "Videos", exact: true }).click();
  const videos = page.locator('button[aria-label$="see how it was made"] video');
  expect(await videos.count()).toBeGreaterThanOrEqual(7);
  await videos.first().hover();
  await expect.poll(() => videos.first().evaluate((v: HTMLVideoElement) => !v.paused && v.readyState >= 2), { timeout: 20_000 }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("examples-videos.png") });

  // A video recipe shows both steps (first frame, then motion) and starts Video Studio with the brief.
  await page.getByRole("button", { name: /^Try-on for Kitenge Co\./ }).click();
  const dlg = page.getByRole("dialog", { name: /How "Try-on" was made/ });
  await expect(dlg.getByText(/Started from this photo/)).toBeVisible();
  await expect(dlg.locator("pre")).toContainText("turns to show the back");
  await page.screenshot({ path: testInfo.outputPath("examples-recipe-video.png") });
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);

  // An image recipe hands its prompt to Image Studio.
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: /^Juice launch poster for Mavuno/ }).click();
  const img = page.getByRole("dialog", { name: /How "Juice launch poster" was made/ });
  await expect(img.locator("pre")).toContainText('render "MAVUNO"');
  await expect(img.getByText("Nano Banana 2 (4K)")).toBeVisible();
  await img.getByRole("link", { name: /Use this prompt/ }).click();
  await page.waitForURL(/\/studio\/image/);
  await expect(page.locator("textarea").first()).toHaveValue(/MAVUNO/, { timeout: 20_000 });

  // Voices play in place.
  await page.goto(`${BASE}/studio/examples`);
  await page.getByRole("button", { name: "Voices", exact: true }).click();
  await page.getByRole("button", { name: /^Play Voiceover: juice ad/ }).first().click();
  await expect(page.getByRole("button", { name: /^Pause Voiceover: juice ad/ }).first()).toBeVisible({ timeout: 15_000 });

  // The Video Studio style cards preview a real example on hover.
  await page.goto(`${BASE}/studio/video`);
  const tryOn = page.getByRole("button", { name: /^Try-on:/ }).locator("video");
  await expect(tryOn).toHaveAttribute("src", /examples\/kitenge-tryon\.mp4/);
  expect(errors).toEqual([]);
});
