import { test, expect, type BrowserContext } from "@playwright/test";

/**
 * Cookie consent (Kezie, 2026-10-26: "when Europeans log in they need to have all this consent";
 * lib/consent.ts). A visitor from Germany is asked, and nothing for analytics is stored before they
 * choose; rejecting sticks; Cookie settings opens the choice again. A visitor from Kenya isn't asked.
 * The country comes from Vercel's header, sent here by the test.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test cookie-consent
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const analyticsStored = async (ctx: BrowserContext, page: import("@playwright/test").Page) => {
  const cookies = (await ctx.cookies()).filter((c) => c.name.startsWith("ph_")).map((c) => c.name);
  const local = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ph_")));
  return [...cookies, ...local];
};

test("visitors from Europe are asked before analytics; others aren't", async ({ browser }) => {
  test.setTimeout(120_000);
  const eu = await browser.newContext({ extraHTTPHeaders: { "x-vercel-ip-country": "DE" } });
  const page = await eu.newPage();
  // Before a yes, nothing goes to PostHog (/ingest) or to Google (fonts come through our domain).
  const leaks: string[] = [];
  page.on("request", (r) => { const u = r.url(); if (/\/ingest\/|posthog\.com|fonts\.(googleapis|gstatic)\.com/.test(u)) leaks.push(u); });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const banner = page.getByRole("dialog", { name: "Cookie choices" });
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner.getByRole("button", { name: "Accept all" })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Reject non-essential" })).toBeVisible();
  await page.waitForTimeout(2000);
  expect(await analyticsStored(eu, page)).toEqual([]);
  // Reject: gone, remembered, still nothing stored.
  await banner.getByRole("button", { name: "Reject non-essential" }).click();
  await expect(banner).toBeHidden();
  const choice = (await eu.cookies()).find((c) => c.name === "blink_consent");
  expect(JSON.parse(decodeURIComponent(choice!.value))).toMatchObject({ analytics: false, v: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await expect(banner).toBeHidden();
  expect(await analyticsStored(eu, page)).toEqual([]);
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  expect(leaks).toEqual([]);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  // Cookie settings (footer) opens it again, with the toggles.
  await page.getByRole("button", { name: "Cookie settings" }).first().click();
  await expect(banner.getByLabel("Analytics cookies")).not.toBeChecked();
  await banner.getByLabel("Analytics cookies").check();
  await banner.getByRole("button", { name: "Save my choices" }).click();
  const saved = (await eu.cookies()).find((c) => c.name === "blink_consent");
  expect(JSON.parse(decodeURIComponent(saved!.value))).toMatchObject({ analytics: true });
  await eu.close();

  const ke = await browser.newContext({ extraHTTPHeaders: { "x-vercel-ip-country": "KE" } });
  const other = await ke.newPage();
  await other.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await other.waitForTimeout(2500);
  await expect(other.getByRole("dialog", { name: "Cookie choices" })).toHaveCount(0);
  await ke.close();
});
