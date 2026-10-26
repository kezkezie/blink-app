import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Cookie consent (Kezie, 2026-10-26: "when Europeans log in they need to have all this consent";
 * lib/consent.ts). A visitor from Germany is asked, and nothing goes to PostHog or Google before
 * they choose; rejecting sticks; Cookie settings opens the choice again. A visitor from Kenya isn't
 * asked, and can still choose from Cookie settings.
 * The country comes from Vercel's header. Locally the test sends it; on Vercel the real country
 * wins (it can't be faked), so the Europe test runs only where the region follows the header.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test cookie-consent
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const analyticsStored = async (ctx: BrowserContext, page: Page) => {
  const cookies = (await ctx.cookies()).filter((c) => c.name.startsWith("ph_")).map((c) => c.name);
  const local = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ph_")));
  return [...cookies, ...local];
};
const region = async (ctx: BrowserContext) => (await ctx.cookies()).find((c) => c.name === "blink_region")?.value;
const choice = async (ctx: BrowserContext) => {
  const c = (await ctx.cookies()).find((k) => k.name === "blink_consent");
  return c ? JSON.parse(decodeURIComponent(c.value)) : null;
};
// Before a yes, nothing goes to PostHog (/ingest) or to Google (fonts come through our domain).
const watchLeaks = (page: Page) => {
  const leaks: string[] = [];
  page.on("request", (r) => { const u = r.url(); if (/\/ingest\/|posthog\.com|fonts\.(googleapis|gstatic)\.com/.test(u)) leaks.push(u); });
  return leaks;
};

test("visitors from Europe are asked before analytics, and a no sticks", async ({ browser }) => {
  test.setTimeout(120_000);
  const eu = await browser.newContext({ extraHTTPHeaders: { "x-vercel-ip-country": "DE" } });
  try {
    const page = await eu.newPage();
    const leaks = watchLeaks(page);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    test.skip((await region(eu)) !== "eu", "the region comes from the real country here (Vercel), so Europe can't be faked");
    const banner = page.getByRole("dialog", { name: "Cookie choices" });
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner.getByRole("button", { name: "Accept all" })).toBeVisible();
    await expect(banner.getByRole("button", { name: "Reject non-essential" })).toBeVisible();
    await page.waitForTimeout(2000);
    expect(await analyticsStored(eu, page)).toEqual([]);
    // Reject: gone, remembered, still nothing stored or sent.
    await banner.getByRole("button", { name: "Reject non-essential" }).click();
    await expect(banner).toBeHidden();
    expect(await choice(eu)).toMatchObject({ analytics: false, v: 1 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await expect(banner).toBeHidden();
    expect(await analyticsStored(eu, page)).toEqual([]);
    await page.goto(`${BASE}/login`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    expect(leaks).toEqual([]);
  } finally {
    await eu.close();
  }
});

test("visitors elsewhere aren't asked, can still choose, and fonts never come from Google", async ({ browser }) => {
  test.setTimeout(120_000);
  const ke = await browser.newContext({ extraHTTPHeaders: { "x-vercel-ip-country": "KE" } });
  try {
    const page = await ke.newPage();
    const google: string[] = [];
    page.on("request", (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) google.push(r.url()); });
    const fonts: number[] = [];
    page.on("response", (r) => { if (r.url().includes("/api/gfonts/")) fonts.push(r.status()); });
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const banner = page.getByRole("dialog", { name: "Cookie choices" });
    if ((await region(ke)) === "other") await expect(banner).toHaveCount(0);
    expect(google).toEqual([]);
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((s) => s === 200)).toBe(true);
    // Cookie settings (footer) opens the choice for anyone, with the toggles.
    await page.getByRole("button", { name: "Cookie settings" }).first().click();
    // Not asked means analytics runs, and Settings says so.
    if ((await region(ke)) === "other") await expect(banner.getByLabel("Analytics cookies")).toBeChecked();
    await banner.getByLabel("Analytics cookies").uncheck();
    await banner.getByRole("button", { name: "Save my choices" }).click();
    await expect(banner).toBeHidden();
    expect(await choice(ke)).toMatchObject({ analytics: false });
    await page.getByRole("button", { name: "Cookie settings" }).first().click();
    await expect(banner.getByLabel("Analytics cookies")).not.toBeChecked();
    await banner.getByLabel("Analytics cookies").check();
    await banner.getByRole("button", { name: "Save my choices" }).click();
    expect(await choice(ke)).toMatchObject({ analytics: true });
  } finally {
    await ke.close();
  }
});
