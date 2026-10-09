import { test, expect, type Page } from "@playwright/test";

/**
 * BlinkSpot v2 ("studio") walkthrough: every page in the new shell renders, the classic design is
 * still reachable, and the look switch works both ways.
 *
 * READ-ONLY: every generation and assistant endpoint is aborted, and nothing is saved, so this
 * cannot spend a credit or write a row. Run against a local build or a preview:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test studio-v2
 */

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const BLOCKED = [
  "**/api/workflows**", "**/api/video-jobs**", "**/api/image-jobs**", "**/api/video/**", "**/api/ai/**",
  "**/api/assistant**", "**/api/tts**", "**/api/social-posts/**", "**/api/brand/**",
  "**n8n.srv1166077.hstgr.cloud/**", "**api.replicate.com/**", "**api.kie.ai/**",
];

const PAGES: Array<[string, RegExp]> = [
  ["/studio", /What are we making/],
  ["/studio/library", /Everything/],
  ["/studio/library/upload", /./],
  ["/studio/video", /What kind of video/],
  ["/studio/image", /Generate/],
  ["/studio/plan", /Calendar/],
  ["/studio/plan/approvals", /Approvals/],
  ["/studio/plan/analytics", /Analytics/],
  ["/studio/brand", /Brand DNA/],
  ["/studio/account/billing", /Billing/],
  ["/studio/account/settings", /Settings/],
];

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
}

test("studio v2: every page renders inside the new shell, classic stays reachable", async ({ page, context }, testInfo) => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD not set");
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const blockedHits: string[] = [];
  for (const pattern of BLOCKED) await page.route(pattern, (r) => { blockedHits.push(r.request().url()); return r.abort(); });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(`${page.url()} :: ${e.message}`));

  await login(page);

  // Opening /studio opts into the new look.
  await page.goto(`${BASE}/studio`);
  await expect(page.locator(".s-rail")).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === "ui")?.value).toBe("studio");

  for (const [path, marker] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);
    await expect(page.locator(".s-top"), path).toBeVisible();
    await expect(page.getByText(/Application error|Unhandled Runtime Error/i), path).toHaveCount(0);
    await expect(page.locator("main").getByText(marker).first(), path).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath(`desk${path.replace(/\//g, "_")}.png`) });
    console.log(`OK ${path}`);
  }

  // Classic links land on their new home while the new look is on.
  await page.goto(`${BASE}/dashboard/content`);
  await page.waitForURL(/\/studio\/library/);
  await page.goto(`${BASE}/dashboard/generate`);
  await page.waitForURL(/\/studio\/image/);
  console.log("REDIRECT classic -> studio ok");

  // Video Studio: Kezie's flow. Long video -> scene planner with the sequence bar; single shot -> inspector.
  await page.goto(`${BASE}/studio/video`);
  await page.getByRole("button", { name: /Story, scene by scene/ }).click();
  await expect(page.getByRole("button", { name: /Render all scenes/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("video-story.png") });
  await page.locator(".s-step", { hasText: "Style" }).click();
  await page.getByRole("button", { name: /Cinematic Showcase/i }).click();
  await expect(page.getByRole("button", { name: /Render video/ })).toBeVisible();
  await expect(page.getByText("Shot settings")).toBeVisible();
  await page.getByRole("button", { name: "Pro" }).click();
  await expect(page.getByLabel("Exact model")).toBeVisible();
  await page.waitForTimeout(800); // the setup fades in over 500 ms
  await page.screenshot({ path: testInfo.outputPath("video-shot-pro.png") });
  console.log("VIDEO flow ok");

  // Deep link from Create / Ask: the brief lands in the story concept.
  await page.goto(`${BASE}/studio/video?mode=storytelling&brief=${encodeURIComponent("farm at dawn, the harvest, the plate")}`);
  await expect(page.getByRole("button", { name: /Render all scenes/ })).toBeVisible();
  await expect(page.locator("textarea").filter({ hasText: "farm at dawn" }).first()).toBeVisible();
  console.log("VIDEO deep link ok");

  // Image Studio: the three modes.
  await page.goto(`${BASE}/studio/image`);
  await page.getByRole("tab", { name: /Edit with AI/ }).click();
  await expect(page.getByText("Which photo?")).toBeVisible();
  await page.getByRole("tab", { name: /Design/ }).click();
  await expect(page.getByText("Pick the photo")).toBeVisible();
  // Wait for the picker to finish loading: either library images or the empty note.
  await page.locator("main .s-media, main :text('No images in this brand')").first().waitFor({ timeout: 30_000 });
  const firstImage = page.locator("main .s-media").first();
  if (await firstImage.count()) {
    await firstImage.click();
    await expect(page.getByRole("button", { name: /Save to Library/ })).toBeVisible();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: testInfo.outputPath("image-design.png") });
    const download = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: /PNG/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.png$/);
    console.log("DESIGN export ok: " + file.suggestedFilename());
  } else console.log("DESIGN: no library images on this account, picker shown");

  // Ask BlinkSpot opens from anywhere (⌘K) and shows its starters; nothing is sent.
  await page.goto(`${BASE}/studio/library`);
  await page.keyboard.press("Meta+k");
  await expect(page.getByRole("dialog", { name: "Ask BlinkSpot" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ask-panel.png") });
  await page.keyboard.press("Escape");

  // Phone: bottom tab bar, no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/studio", "/studio/library", "/studio/video"]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(2500);
    await expect(page.locator(".s-tabbar")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`phone${path.replace(/\//g, "_")}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // Classic look: the old design is intact and stops redirecting.
  await page.goto(`${BASE}/studio/library`);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: /Classic look/ }).click();
  await page.waitForURL(/\/dashboard\/content/);
  await page.waitForTimeout(2500);
  await expect(page.getByText("Content Grid").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("classic-content.png") });
  await page.goto(`${BASE}/dashboard/video`);
  expect(page.url()).toMatch(/\/dashboard\/video/);
  console.log("CLASSIC look ok");

  // Back to the new look for the next person to open the app.
  await page.goto(`${BASE}/studio`);

  console.log(`blocked requests: ${blockedHits.length}`);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
