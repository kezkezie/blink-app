import { test, expect } from "@playwright/test";

/**
 * Authentication recovery validation after the Supabase publishable-key migration.
 *
 * Context: legacy Supabase API keys were disabled 2026-08-04T13:22:00Z while
 * production still shipped a legacy anon key, so nobody could sign in. Vercel now
 * holds the `sb_publishable_` key for the client and `sb_secret_` server-side, and
 * production has been redeployed from commit 3c2a716.
 *
 * READ-ONLY: every generation endpoint is aborted up front and asserted to have
 * received zero requests, so this cannot spend a credit.
 *
 * No secret value is ever printed. The service-key check asserts ABSENCE by
 * substring, and only ever reports a boolean.
 */

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Production is the target: the apex `blinkspot.io` 307-redirects to `www`, which
 *  breaks `waitForURL` patterns, so standardise on the canonical www host.
 *  Override with PLAYWRIGHT_BASE_URL to point at a preview or localhost. */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://www.blinkspot.io";

const BLOCKED = [
  "**/api/workflows**",
  "**/api/video-jobs**",
  "**/api/video/nano-banana**",
  "**n8n.srv1166077.hstgr.cloud/**",
  "**api.replicate.com/**",
  "**api.kie.ai/**",
];

const PROTECTED = "/api/credits/balance";

test("authentication recovery: login, session, logout, protected endpoint, no client-side secrets", async ({ page, context }, testInfo) => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD not set");
  test.setTimeout(300_000);

  const blockedHits: string[] = [];
  for (const pattern of BLOCKED) {
    await page.route(pattern, (route) => {
      blockedHits.push(route.request().url());
      return route.abort();
    });
  }

  // Collect every script URL the browser actually loads, for the secret scan.
  const scriptUrls = new Set<string>();
  page.on("response", (res) => {
    const u = res.url();
    if (u.endsWith(".js") || u.includes("/_next/static/")) scriptUrls.add(u);
  });

  // ── 1. Unauthenticated: protected endpoint must refuse ──
  const anon = await context.request.get(`${BASE}${PROTECTED}`, { maxRedirects: 0 });
  const anonStatus = anon.status();
  console.log(`UNAUTH ${PROTECTED} -> ${anonStatus}`);
  expect([401, 403, 307, 302]).toContain(anonStatus);
  const anonRefused = anonStatus === 401 || anonStatus === 403;
  const anonRedirected = anonStatus === 307 || anonStatus === 302;
  console.log(`UNAUTH refused=${anonRefused} redirectedToLogin=${anonRedirected}`);

  // ── 2. Login ──
  await page.goto(`${BASE}/login`);
  await expect(page.getByText(/legacy api keys are disabled/i)).toHaveCount(0);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 120_000 });
  console.log("LOGIN ok -> " + page.url());
  await page.screenshot({ path: testInfo.outputPath("logged-in.png"), fullPage: false });

  // ── 3. Session persists across a full reload ──
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  expect(page.url()).toMatch(/\/dashboard/);
  console.log("SESSION persisted after reload -> " + page.url());

  // ── 4. Authenticated request to the protected endpoint ──
  const authed = await page.request.get(`${BASE}${PROTECTED}`);
  console.log(`AUTHED ${PROTECTED} -> ${authed.status()}`);
  expect(authed.status()).toBe(200);
  const body = await authed.text();
  // Proves a SERVER route that reads Supabase still works end to end.
  expect(body.length).toBeGreaterThan(1);
  console.log("AUTHED body keys: " + Object.keys(JSON.parse(body)).join(","));

  // ── 5. No service-role / sb_secret_ value anywhere the browser can see ──
  const pageHtml = await page.content();
  const htmlHasSecret = pageHtml.includes("sb_secret_") || (serviceKey.length > 20 && pageHtml.includes(serviceKey));
  expect(htmlHasSecret, "rendered HTML contains a server-only secret").toBe(false);

  let scanned = 0;
  const offenders: string[] = [];
  for (const url of scriptUrls) {
    const r = await context.request.get(url).catch(() => null);
    if (!r || !r.ok()) continue;
    const text = await r.text().catch(() => "");
    if (!text) continue;
    scanned += 1;
    const bad =
      text.includes("sb_secret_") ||
      text.includes("service_role") ||
      (serviceKey.length > 20 && text.includes(serviceKey));
    if (bad) offenders.push(url);
  }
  console.log(`BUNDLE SCAN: ${scanned} script(s) scanned, offenders=${offenders.length}`);
  expect(offenders, `server-only secret found in: ${offenders.join(", ")}`).toEqual([]);

  // ── 6. Logout ──
  const logout = page.getByRole("button", { name: /log ?out|sign ?out/i }).first();
  if (!(await logout.isVisible().catch(() => false))) {
    // Often behind a profile/settings menu.
    const menu = page.locator('[aria-haspopup], button:has(img[alt*="avatar" i]), header button').last();
    await menu.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  const logout2 = page.getByRole("button", { name: /log ?out|sign ?out/i }).first();
  const logoutText = page.getByText(/log ?out|sign ?out/i).first();
  if (await logout2.isVisible().catch(() => false)) await logout2.click();
  else if (await logoutText.isVisible().catch(() => false)) await logoutText.click();
  else console.log("LOGOUT control not found in UI — will verify by session invalidation instead");

  await page.waitForTimeout(4000);
  await page.goto(`${BASE}/dashboard/video`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const afterLogout = page.url();
  console.log("AFTER LOGOUT url -> " + afterLogout);
  const post = await page.request.get(`${BASE}${PROTECTED}`, { maxRedirects: 0 });
  console.log(`AFTER LOGOUT ${PROTECTED} -> ${post.status()}`);
  expect(/login|get-started|^https?:\/\/[^/]+\/?$/.test(afterLogout) || post.status() !== 200).toBe(true);

  // ── 7. Nothing generative was contacted ──
  expect(blockedHits, `generation endpoints were contacted: ${blockedHits.join(", ")}`).toEqual([]);
});
