import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Split into layers (2026-10-13), LIVE (~20 credits: reading the design + the clean photo). An
 * example poster opens in the Editor; the photo becomes real text layers, a logo and a photo
 * without its words. The test post is deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test studio-split-layers
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const POSTER = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/kasi-poster.jpg";

test("a flat poster becomes text, logo and photo layers", async ({ page }) => {
  test.skip(!email || !password || !process.env.SUPABASE_SERVICE_ROLE_KEY, "needs E2E login and the service key");
  test.setTimeout(300_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: u } = await sb.auth.admin.listUsers({ perPage: 200 });
  const user = u.users.find((x) => x.email === email)!;
  const { data: client } = await sb.from("clients").select("id").eq("user_id", user.id).single();
  const { data: brand } = await sb.from("brand_profiles").select("id").eq("client_id", client!.id).eq("is_active", true).order("created_at").limit(1).single();
  const { data: row } = await sb.from("content").insert({ client_id: client!.id, brand_id: brand!.id, content_type: "post_image", status: "draft", caption: "E2E split layers", image_urls: [POSTER] }).select("id").single();
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email!);
    await page.fill('input[type="password"]', password!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/image?mode=design&content=${row!.id}`);
    await expect(page.getByLabel("Layer name").first()).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Layer name").first().click();
    await page.keyboard.press("Escape");
    const box = (await page.locator("canvas").last().boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const split = page.getByRole("button", { name: /^Split into layers/ });
    await expect(split).toBeVisible({ timeout: 10_000 });
    await split.click();
    await expect(page.getByText(/Split into \d+ text layers?/)).toBeVisible({ timeout: 240_000 });
    const names = await page.getByLabel("Layer name").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    console.log("LAYERS", JSON.stringify(names));
    expect(names.filter((n) => n.startsWith("Text:")).length).toBeGreaterThanOrEqual(2);
    expect(names.some((n) => /no text/.test(n))).toBe(true);
    await page.waitForTimeout(3000); // web fonts arrive
    await page.screenshot({ path: "test-results/split-layers.png" });
    expect(errors).toEqual([]);
  } finally {
    await sb.from("content").delete().eq("id", row!.id);
  }
});
