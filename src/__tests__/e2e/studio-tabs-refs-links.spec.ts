import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Kezie, 2026-10-16: tabs answer at once with a shimmer; Video Inspo links (Pinterest gets the
 * steps, a direct video file is copied into storage and plays); Generate studies reference
 * pictures from the brand's category (about $0.20, once). LIVE on a throwaway account, deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test studio-tabs-refs-links --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const SAMPLE_VIDEO = "https://res.cloudinary.com/demo/video/upload/dog.mp4";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("tabs shimmer, inspo links, reference board", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(600_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-refs-${stamp}@blinkspot-test.dev`;
  const password = `Rf-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Refs Tester", onboarding_completed: true } });
  expect(error).toBeNull();
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Refs Tester", contact_name: "Refs Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 50 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", industry: "Streetwear sneakers", description: "Limited-run sneakers designed in Johannesburg townships, sold online in small drops.", is_active: true, primary_color: "#E4572E", secondary_color: "#14141A" }).select("id").single();
    await signIn(page, email, password);

    // 1. A tab answers at once: with the page's data held back, its skeleton shows.
    await page.goto(`${BASE}/studio`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.route(/\/studio\/plan(\?|$)/, async (route) => { await new Promise((r) => setTimeout(r, 2500)); await route.continue(); });
    await page.getByRole("link", { name: "Plan" }).first().click();
    await expect(page.locator('[aria-busy="true"][aria-label="Loading"]').first()).toBeVisible({ timeout: 2000 });
    await page.waitForURL(/\/studio\/plan/, { timeout: 30_000 });
    await page.unroute(/\/studio\/plan(\?|$)/);

    // 2. Video Inspo: a Pinterest link gets the steps; a direct video file is copied and plays.
    await page.goto(`${BASE}/studio/video/inspo`);
    const link = page.getByLabel("Video link");
    await link.fill("https://pin.it/3xAmPle");
    await page.getByRole("button", { name: "Use link" }).click();
    await expect(page.getByText(/In the Pinterest app, open the pin/)).toBeVisible({ timeout: 10_000 });
    await link.fill(SAMPLE_VIDEO);
    await page.getByRole("button", { name: "Use link" }).click();
    const video = page.locator("video").first();
    await expect(video).toHaveAttribute("src", /supabase\.co\/storage\/v1\/object\/public\/assets\/videos\/.+\/inspo_\d+\.mp4$/, { timeout: 60_000 });
    expect(await video.evaluate((v: HTMLVideoElement) => new Promise<number>((r) => { if (v.readyState >= 1) r(v.duration); else v.onloadedmetadata = () => r(v.duration); setTimeout(() => r(0), 15000); }))).toBeGreaterThan(1);

    // 3. The reference board: real pictures from the category and art direction per look.
    const res = await page.request.post(`${BASE}/api/brand/visual-refs`, { data: { brandId: b!.id }, timeout: 300_000 });
    const board = await res.json();
    expect(res.status(), JSON.stringify(board).slice(0, 300)).toBe(200);
    console.log(`board: ${board.refs.length} refs from ${[...new Set(board.refs.map((r: { source: string }) => r.source))].join(", ")} · looks ${Object.keys(board.direction).join(", ")}\nnotes: ${board.notes}`);
    expect(board.refs.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(board.direction).length).toBeGreaterThanOrEqual(2);
    for (const r of board.refs.slice(0, 3)) expect(r.image).toMatch(/^https:\/\//);
    const again = await (await page.request.post(`${BASE}/api/brand/visual-refs`, { data: { brandId: b!.id, cachedOnly: true } })).json();
    expect(again.cached).toBe(true);
    expect(await (await sb.from("credit_balances").select("balance").eq("client_id", clientId!).single()).data?.balance).toBe(50);
    await page.goto(`${BASE}/studio/image?mode=generate`);
    await page.getByPlaceholder(/What do you want to make for/).fill("A poster for our Drop 01 sneaker launch this Friday");
    await page.getByRole("button", { name: /Use my words/ }).click();
    await expect(page.getByText(new RegExp(`Learning from ${board.refs.length} reference pictures`))).toBeVisible({ timeout: 30_000 });
    await page.getByText(/see them/).click();
    // Real pictures on screen (not blank squares): at least one has loaded its pixels.
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll("a[target=_blank] img")].filter((i) => (i as HTMLImageElement).naturalWidth > 0).length), { timeout: 20_000 }).toBeGreaterThan(0);
    await page.screenshot({ path: "test-results/generate-references.png" });
  } finally {
    if (clientId) {
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
