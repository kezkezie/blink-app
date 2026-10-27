import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The calendar, a post and billing in the new look (2026-10-11). Uses one throwaway post with
 * NO platforms, so nothing is ever sent to PostForMe; paid and AI routes are blocked anyway.
 * The post is deleted at the end.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test studio-plan-post
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const IMAGE = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/mavuno-poster.jpg";
const BLOCKED = ["**/api/workflows**", "**/api/video**", "**/api/ai/**", "**/api/assistant**", "**/api/content/analyze**", "**/api/social-posts/schedule**", "**api.kie.ai/**", "**api.replicate.com/**"];
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
}

test("calendar: schedule and take off a post; the post page saves captions; billing shows the plans", async ({ page }) => {
  test.skip(!email || !password || !process.env.SUPABASE_SERVICE_ROLE_KEY, "needs E2E login and the service key");
  test.setTimeout(240_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const hits: string[] = [];
  for (const p of BLOCKED) await page.route(p, (r) => { hits.push(r.request().url()); return r.abort(); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`${BASE}/studio/plan`);
  await expect(page.getByText("Ready to schedule")).toBeVisible({ timeout: 30_000 });
  // The brand the studio has open (persisted brand store).
  const brand = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("blink-active-brand") || "{}")?.state?.activeBrand ?? null; } catch { return null; } });
  expect(brand?.id).toBeTruthy();

  const sb = admin();
  const { data: b } = await sb.from("brand_profiles").select("client_id").eq("id", brand.id).single();
  const caption = `E2E calendar test ${Date.now()}`;
  const { data: row, error } = await sb.from("content").insert({ client_id: b!.client_id, brand_id: brand.id, content_type: "post_image", status: "draft", caption, image_urls: [IMAGE] }).select("id").single();
  expect(error).toBeNull();
  const id = row!.id as string;
  try {
    await page.reload();
    await expect(page.getByText("Magic Auto-Schedule")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Ask BlinkSpot to plan them/ })).toBeVisible();
    const card = page.locator(".cal-ready", { hasText: caption });
    await expect(card).toBeVisible({ timeout: 20_000 });

    // Schedule it for tomorrow at 10:00 (no platforms: it goes on the calendar only).
    await card.getByRole("button", { name: /Schedule/ }).click();
    const t = new Date(Date.now() + 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    await page.getByRole("textbox", { name: "Date and time" }).fill(`${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T10:00`);
    await page.getByRole("dialog").getByRole("button", { name: "Schedule", exact: true }).click();
    await expect(page.getByText(/On the calendar for .*Pick where it posts/)).toBeVisible({ timeout: 20_000 });
    const { data: placed } = await sb.from("content").select("scheduled_at, postforme_tracking_id").eq("id", id).single();
    expect(new Date(placed!.scheduled_at!).getHours()).toBe(10);
    expect(placed!.postforme_tracking_id).toBeNull();

    // It shows on that day (Month: the calendar opens on Week since 2026-10-27); take it off again from the day panel.
    await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Month" }).click();
    await page.locator(".cal-day", { has: page.locator(`[title^="${caption}"]`) }).click();
    const inPanel = page.locator(".cal-side").getByText(caption);
    await expect(inPanel).toBeVisible();
    await expect(page.locator(".cal-side").getByText("Pick platforms").first()).toBeVisible();
    await page.locator(".cal-side div.rounded-xl", { hasText: caption }).getByRole("button", { name: /Remove/ }).click();
    await expect(page.getByText(/Taken off the calendar/)).toBeVisible({ timeout: 20_000 });
    const { data: off } = await sb.from("content").select("scheduled_at").eq("id", id).single();
    expect(off!.scheduled_at).toBeNull();
    await page.screenshot({ path: "test-results/studio-calendar.png" });

    // The post page in the new look: edit the caption and save.
    await page.goto(`${BASE}/studio/library/${id}`);
    await expect(page.getByLabel("Long caption")).toHaveValue(caption, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Post now/ })).toBeDisabled();
    // Short and Long are tabs (2026-10-27): only the one you're on shows.
    await expect(page.getByLabel("Short caption")).toHaveCount(0);
    await page.getByRole("tab", { name: "Short" }).click();
    await page.getByLabel("Short caption").fill("Fresh this weekend");
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 15_000 });
    const { data: saved } = await sb.from("content").select("caption_short").eq("id", id).single();
    expect(saved!.caption_short).toBe("Fresh this weekend");
    await page.screenshot({ path: "test-results/studio-post.png", fullPage: true });

    // Billing: the shared plan list and the new top-up price.
    await page.goto(`${BASE}/studio/account/billing`);
    await expect(page.getByText("Your plan").first()).toBeVisible({ timeout: 20_000 });
    // Four credit packs on every plan (2026-10-12); without the Paystack key they fall back to email.
    for (const [n, usd] of [["300", "$3"], ["800", "$8"], ["2,000", "$18"], ["5,000", "$40"]]) await expect(page.getByRole("button", { name: `Buy ${n.replace(",", "")} credits for ${usd}` })).toBeVisible();
    await expect(page.getByText("Starter").first()).toBeVisible();
    await expect(page.getByText("3 brands").first()).toBeVisible();
    for (const name of ["Free", "Starter", "Pro", "Agency"]) await expect(page.locator("b", { hasText: new RegExp(`^${name}$`) }).first()).toBeVisible();
    await expect(page.getByText("100 credits to start").first()).toBeVisible();
    await page.screenshot({ path: "test-results/studio-billing.png", fullPage: true });

    expect(hits).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await sb.from("content").delete().eq("id", id);
  }
});
