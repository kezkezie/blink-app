import { test, expect } from "@playwright/test";

/**
 * Authenticated VISUAL verification of the 2026-08-07 billing-integrity release.
 *
 * Confirms in the real rendered UI that:
 *   1. Kling 3.0 offers ONLY 5 / 10 / 15 seconds (the fictional "5 Min / 300s"
 *      option is gone — it billed 3600 credits for a 15s video).
 *   2. Sora 2 offers ONLY 5 / 10 seconds (its provider maximum is 12s, so the
 *      old 15s option was unreachable).
 *   3. Gemini Omni Video at 10 seconds displays ≈200 credits (20/sec canonical).
 *
 * READ-ONLY BY CONSTRUCTION: every generation entry point is aborted before the
 * test starts and asserted to have received zero requests, so this cannot create
 * a job, contact a provider, or spend a credit. Only local component state
 * (selected model / duration) is touched.
 */

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

/** Standardised on the canonical www host — the apex 307-redirects, which breaks
 *  `waitForURL`. Override with PLAYWRIGHT_BASE_URL for previews or localhost. */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://www.blinkspot.io";

const BLOCKED = [
  "**/api/workflows**",
  "**/api/video-jobs**",
  "**/api/video/nano-banana**",
  "**/api/generate**",
  "**n8n.srv1166077.hstgr.cloud/**",
  "**api.replicate.com/**",
  "**api.kie.ai/**",
];

test("Kling/Sora duration options and Gemini credit estimate are correct", async ({ page }, testInfo) => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD not set");
  test.setTimeout(240_000);

  const blockedHits: string[] = [];
  for (const pattern of BLOCKED) {
    await page.route(pattern, (route) => {
      blockedHits.push(route.request().url());
      return route.abort();
    });
  }

  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 120_000 });

  await page.goto(`${BASE}/dashboard/video`);
  await page.waitForLoadState("networkidle");

  // Verified production path: Step 1 mode card -> Storytelling B-Roll renders the
  // scene rows that carry the model + duration selects.
  await page.getByText("Storytelling B-Roll", { exact: false }).first().click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: testInfo.outputPath("broll-scenes.png"), fullPage: true });

  // Scene 1: select[0] = model, select[1] = aspect ratio, select[2] = duration.
  const modelSelect = page.locator("select").nth(0);
  const durationSelect = page.locator("select").nth(2);

  const modelOptions = await modelSelect.locator("option").evaluateAll((os) =>
    os.map((o) => (o as HTMLOptionElement).value)
  );
  console.log("MODEL options:", JSON.stringify(modelOptions));
  expect(modelOptions).toContain("kling-3.0/video");

  const readDurations = async () =>
    durationSelect.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));

  console.log("DEFAULT (auto) durations:", JSON.stringify(await readDurations()));

  // ── 1. Kling ──
  await modelSelect.selectOption("kling-3.0/video");
  await page.waitForTimeout(600);
  const klingDurations = await readDurations();
  console.log("KLING durations:", JSON.stringify(klingDurations));
  expect(klingDurations).toEqual(["5", "10", "15"]);
  expect(klingDurations).not.toContain("300");

  // ── 2. Sora — DISCRETE schema enum {4,8,12}. 5 and 10 were the 2026-08-06
  //         replacements for the invalid 15 and were themselves rejected with
  //         HTTP 422, charging then refunding on every attempt.
  await modelSelect.selectOption("replicate:openai/sora-2");
  await page.waitForTimeout(600);
  const soraDurations = await readDurations();
  console.log("SORA durations:", JSON.stringify(soraDurations));
  expect(soraDurations).toEqual(["4", "8", "12"]);
  for (const bad of ["5", "10", "15"]) expect(soraDurations).not.toContain(bad);
  const soraAspects = await page.locator("select").nth(1).locator("option")
    .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  console.log("SORA aspects:", JSON.stringify(soraAspects));
  expect(soraAspects).not.toContain("1:1");

  // ── 3. Gemini at 10s must read ~200 credits ──
  await modelSelect.selectOption("gemini-omni-video");
  await page.waitForTimeout(600);
  const geminiDurations = await readDurations();
  console.log("GEMINI durations:", JSON.stringify(geminiDurations));
  expect(geminiDurations).toEqual(["4", "6", "8", "10"]);
  await durationSelect.selectOption("10");
  await page.waitForTimeout(800);

  const estimate = page.getByText(/≈\s*\d+\s*cr/i).first();
  await expect(estimate).toBeVisible({ timeout: 15_000 });
  const estimateText = (await estimate.textContent())?.trim() ?? "";
  console.log("GEMINI 10s estimate:", estimateText);
  await page.screenshot({ path: testInfo.outputPath("gemini-estimate.png"), fullPage: true });
  expect(estimateText).toMatch(/200/);

  // Nothing may have been submitted.
  expect(blockedHits, `generation endpoints were contacted: ${blockedHits.join(", ")}`).toEqual([]);
});
