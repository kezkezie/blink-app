import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Work survives leaving the page (Kezie, 2026-10-20). Throwaway account, no credits: a pen shape in
 * the Image Editor, a Generate brief, and a clip on the video editor's timeline all come back after
 * going to another page and returning. Deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test work-is-kept --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EX = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples";
type Win = { __blinkEditorCanvas: { getObjects(): Array<{ type: string }> } };

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("the Image Editor, Generate and the video editor keep work across pages", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(300_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-kept-${stamp}@blinkspot-test.dev`;
  const password = `Kp-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Kept Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Kept Tester", contact_name: "Kept Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", is_active: true }).select("id").single();
    await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "video", status: "draft", caption: "E2E clip", video_urls: [`${EX}/kasi-reveal.mp4`] });
    await signIn(page, email, password);

    // 1. Image Editor: draw a triangle, leave, come back, continue.
    await page.goto(`${BASE}/studio/image?mode=design`);
    await page.getByRole("button", { name: "Blank canvas, white" }).click();
    const cv = page.locator("canvas.upper-canvas");
    await expect(cv).toBeVisible();
    await page.waitForTimeout(1000);
    const box = (await cv.boundingBox())!;
    await page.getByRole("button", { name: /^Pen \(P\)/ }).click();
    for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.5, 0.6], [0.3, 0.3]] as const) { await page.mouse.click(box.x + box.width * x, box.y + box.height * y); await page.waitForTimeout(150); }
    await page.waitForTimeout(1500); // saved a moment after the change
    await page.goto(`${BASE}/studio/library`);
    await page.goto(`${BASE}/studio/image?mode=design`);
    await expect(page.getByText("Pick up where you left off")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as Win).__blinkEditorCanvas?.getObjects().length ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);

    // 2. Generate: the brief comes back.
    await page.goto(`${BASE}/studio/image?mode=generate`);
    await page.getByLabel("Your idea").fill("A pair of fresh sneakers on a rooftop at sunset");
    await page.getByRole("button", { name: /Use my words/ }).click();
    await page.getByLabel("Your brief").fill("Sneakers on a Nairobi rooftop at golden hour, kept brief");
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/studio/plan`);
    await page.goto(`${BASE}/studio/image?mode=generate`);
    await expect(page.getByLabel("Your brief")).toHaveValue("Sneakers on a Nairobi rooftop at golden hour, kept brief", { timeout: 15_000 });

    // 3. Video editor: a Library clip on the timeline stays there.
    await page.goto(`${BASE}/studio/library`);
    await page.locator(".s-media").filter({ hasText: "E2E clip" }).first().click();
    await page.getByRole("button", { name: /Edit in the video editor/ }).click();
    await expect(page.locator(".ve-clip.video")).toHaveCount(1, { timeout: 30_000 });
    await page.waitForTimeout(1800);
    await page.goto(`${BASE}/studio/brand`);
    await page.goto(`${BASE}/studio/video?tab=editor`);
    await expect(page.locator(".ve-clip.video")).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByText(/Picked up your edit/)).toBeVisible();
  } finally {
    if (clientId) {
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
