import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * LIVE (2026-10-11), about $0.05 of Claude, no credits:
 * 1. Website "like a site I love": build from a real site's layout, publish at a throwaway
 *    address, prove an edit does NOT reach the live page until Publish changes, take it offline.
 *    Skips if the brand's page is already live.
 * 2. Ask BlinkSpot plans posts on the calendar: the proposal appears with an Apply button.
 *    Apply is NOT pressed, so nothing is scheduled or sent.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test live-qa-site-inspo-ask-plan
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const INSPO = "https://www.javahouseafrica.com";
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
}

test("website from a site I like; edits stay private until Publish changes", async ({ page, context }) => {
  test.skip(!email || !password || !process.env.SUPABASE_SERVICE_ROLE_KEY, "needs E2E login and the service key");
  test.setTimeout(300_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`${BASE}/studio/sites`);
  const first = page.getByRole("button", { name: /Build my landing page/ });
  const rebuild = page.getByRole("button", { name: /^Rebuild/ });
  await first.or(rebuild).first().waitFor({ timeout: 60_000 });
  test.skip(await page.getByText("Live", { exact: true }).isVisible(), "This brand's page is live; not touching it");

  // Start from a site I like (on a fresh page; on an existing draft the start screen isn't shown,
  // so the API is called with the same body the button sends).
  let status: number;
  if (await first.isVisible()) {
    await page.getByRole("radio", { name: /Like a site I love/ }).click();
    await page.getByLabel("A website you like").fill(INSPO);
    const built = page.waitForResponse((r) => r.url().includes("/api/sites/build"), { timeout: 150_000 });
    await first.click();
    status = (await built).status();
  } else {
    const brand = await page.evaluate(() => JSON.parse(localStorage.getItem("blink-active-brand") || "{}")?.state?.activeBrand?.id);
    const res = await page.request.post(`${BASE}/api/sites/build`, { data: { brandId: brand, mode: "full", inspirationUrl: INSPO }, timeout: 150_000 });
    status = res.status();
    await page.reload();
  }
  expect(status).toBe(200);
  const frame = page.frameLocator("iframe[title='Preview']");
  await expect(frame.locator("h1").first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/site-inspo.png" });

  // Publish at a throwaway address and read the live headline.
  const slug = `qa-${Date.now().toString(36)}`;
  await page.getByRole("button", { name: /^Publish/ }).click();
  await page.locator("#site-slug").fill(slug);
  await page.getByRole("dialog", { name: "Publish your page" }).getByRole("button", { name: /^Publish$/ }).click();
  await expect(page.getByRole("link", { name: /Open live page/ })).toBeVisible({ timeout: 20_000 });
  const pub = await context.newPage();
  await pub.goto(`${BASE}/s/${slug}`);
  const liveBefore = (await pub.locator("h1").first().innerText()).trim();

  try {
    // Edit the hero headline (the hero is open after a build); it autosaves, but the live page must not change.
    await page.getByLabel("Headline", { exact: true }).fill("QA draft headline only");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("changes not live")).toBeVisible();
    // The live snapshot still has the old headline (checked in the database: the public page also caches for 60 s).
    const live = await db().from("sites").select("spec, published_spec").eq("slug", slug).single();
    expect(JSON.stringify(live.data?.spec)).toContain("QA draft headline only");
    expect(JSON.stringify(live.data?.published_spec)).not.toContain("QA draft headline only");
    expect(liveBefore.length).toBeGreaterThan(0);

    // Publish changes: now it's live.
    await page.getByRole("button", { name: /Publish changes/ }).click();
    await page.getByRole("dialog", { name: "Publish your page" }).getByRole("button", { name: /^Publish$/ }).click();
    await expect(page.getByText("changes not live")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("changes not live")).toHaveCount(0, { timeout: 15_000 });
    const after = await db().from("sites").select("published_spec").eq("slug", slug).single();
    expect(JSON.stringify(after.data?.published_spec)).toContain("QA draft headline only");
  } finally {
    // Take it offline through the UI, and make sure in the database (a failed step must never leave a QA page live).
    await page.getByRole("button", { name: /Publish changes|^Publish/ }).first().click().catch(() => {});
    await page.getByRole("dialog", { name: "Publish your page" }).getByRole("button", { name: "Take offline" }).click({ timeout: 10_000 }).catch(() => {});
    await db().from("sites").update({ published: false }).eq("slug", slug);
  }
  expect((await pub.goto(`${BASE}/s/${slug}?v=${Date.now() + 1}`))?.status()).toBe(404);
  expect(errors).toEqual([]);
});

test("Ask BlinkSpot proposes a posting plan (Apply not pressed)", async ({ page }) => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD not set");
  test.setTimeout(200_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  // Belt and braces: nothing may be scheduled or sent by this test.
  const hits: string[] = [];
  await page.route("**/api/social-posts/**", (r) => { hits.push(r.request().url()); return r.abort(); });
  await login(page);
  await page.goto(`${BASE}/studio/plan`);
  await page.getByRole("button", { name: /Ask BlinkSpot to plan them/ }).click();
  const box = page.getByLabel("Message");
  await expect(box).toHaveValue(/Plan my ready posts/);
  const answered = page.waitForResponse((r) => r.url().includes("/api/assistant"), { timeout: 180_000 });
  await box.press("Enter");
  const res = await answered;
  expect(res.status()).toBe(200);
  const body = await res.json();
  const plan = (body.actions ?? []).find((a: { kind: string }) => a.kind === "apply_schedule");
  expect(plan, `reply: ${body.reply}`).toBeTruthy();
  expect(plan.schedule.length).toBeGreaterThan(0);
  for (const s of plan.schedule) expect(new Date(s.at).getTime()).toBeGreaterThan(Date.now());
  await expect(page.getByRole("button", { name: /on the calendar$/ })).toBeVisible();
  await page.screenshot({ path: "test-results/ask-plan.png" });
  expect(hits).toEqual([]);
});
