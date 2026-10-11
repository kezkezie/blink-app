import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The last classic screens in the new look (2026-10-11): Settings & social accounts, Upload,
 * Edit with AI; the Brand page's single fill button; the Ask thinking dial. No paid calls: AI and
 * generation routes are blocked, and the one uploaded file is deleted.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test studio-screens-round10
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const BLOCKED = ["**/api/workflows**", "**/api/video**", "**/api/ai/**", "**/api/assistant**", "**/api/content/analyze**", "**/api/brand/fill**", "**/api/social-accounts/**", "**api.kie.ai/**"];
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// A tiny valid PNG (1x1).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
}

test("settings, upload, edit with AI, brand fill and the thinking dial", async ({ page }) => {
  test.skip(!email || !password || !process.env.SUPABASE_SERVICE_ROLE_KEY, "needs E2E login and the service key");
  test.setTimeout(240_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const hits: string[] = [];
  for (const p of BLOCKED) await page.route(p, (r) => { hits.push(r.request().url()); return r.abort(); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  // Settings: one card per platform, connect buttons, no third-party QR service.
  await page.goto(`${BASE}/studio/account/settings`);
  await expect(page.getByRole("heading", { name: "Social accounts" })).toBeVisible({ timeout: 30_000 });
  for (const p of ["Instagram", "TikTok", "YouTube", "Facebook", "LinkedIn"]) await expect(page.locator("b", { hasText: new RegExp(`^${p}$`) }).first()).toBeVisible();
  await expect(page.getByLabel("Sign-in email")).toHaveValue(email!);
  expect(await page.content()).not.toContain("api.qrserver.com");
  await page.screenshot({ path: "test-results/r10-settings.png", fullPage: true });

  // Upload one image without AI captions (free), check the Library row, clean up.
  await page.goto(`${BASE}/studio/library/upload`);
  await expect(page.getByText("Drop photos or videos here")).toBeVisible({ timeout: 20_000 });
  await page.locator('input[type="file"]').setInputFiles({ name: "e2e-upload.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel("Context").fill("E2E upload test");
  await page.getByText("Write captions with AI").click(); // off: free
  await expect(page.getByRole("button", { name: /Add 1 to Library/ })).toContainText("free");
  await page.getByRole("button", { name: /Add 1 to Library/ }).click();
  await expect(page.getByText(/1 added to your Library/)).toBeVisible({ timeout: 30_000 });
  const sb = admin();
  const { data: row } = await sb.from("content").select("id, image_urls, caption, status").eq("caption", "E2E upload test").order("created_at", { ascending: false }).limit(1).single();
  try {
    expect(row!.status).toBe("draft");
    const url = (row!.image_urls as string[])[0];
    expect(url).toMatch(/\/assets\/uploads\/[0-9a-f-]{36}\//);

    // Edit with AI on that image: step 1 shows, scanning is blocked here (it costs a credit).
    await page.goto(`${BASE}/studio/library/${row!.id}/edit`);
    await expect(page.getByText("Step 1 · Scan the picture")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Scan it/ })).toContainText("1 cr");
    await page.screenshot({ path: "test-results/r10-xray.png" });

    // Brand: no "Teach the AI", one fill button, website field in Contact.
    await page.goto(`${BASE}/studio/brand`);
    await expect(page.getByRole("heading", { name: "Basics" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Teach the AI/ })).toHaveCount(0);
    await expect(page.getByText("Fill this in from your website")).toHaveCount(0);
    await expect(page.getByLabel("Website", { exact: true })).toBeVisible();

    // The thinking dial in Ask.
    await page.getByRole("button", { name: "Ask BlinkSpot" }).first().click();
    await page.getByRole("button", { name: /How hard Ask thinks|Balanced|Fast|Thorough|Extra high|Max/ }).first().click();
    const menu = page.getByRole("menu");
    for (const l of ["Fast", "Balanced", "Thorough", "Extra high", "Max"]) await expect(menu.getByText(l, { exact: true })).toBeVisible();
    await menu.getByText("Thorough", { exact: true }).click();
    await expect(page.getByRole("button", { name: /Thorough/ }).first()).toContainText("Opus 5.5");
    await page.screenshot({ path: "test-results/r10-dial.png" });
    await page.getByRole("button", { name: /Thorough/ }).first().click();
    await page.getByRole("menu").getByText("Balanced", { exact: true }).click();

    // The old analytics page goes to the calendar.
    await page.goto(`${BASE}/studio/plan/analytics`);
    await page.waitForURL(/\/studio\/plan$/);
    expect(hits).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if (row) {
      const path = String((row.image_urls as string[])[0]).split("/object/public/assets/")[1];
      if (path) await sb.storage.from("assets").remove([decodeURIComponent(path)]);
      await sb.from("content").delete().eq("id", row.id);
    }
  }
});
