import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Round 23 (Kezie, 2026-10-21). Throwaway account, no credits, nothing is ever sent to a social
 * account (the posts have no platforms):
 * - a post with only its working title isn't posted ("needs_caption"); the long/short pick is saved;
 * - the calendar removes a post that already went out;
 * - the Image Editor's Export opens a menu (it was clipped), and Add your logo is on the rail;
 * - the video editor's Motion opens as a window, and Esc closes only the top one.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test round-23 --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const IMAGE = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/mavuno-poster.jpg";
const BLOCKED = ["**/api/workflows**", "**/api/video**", "**/api/ai/**", "**/api/assistant**", "**/api/content/analyze**", "**/api/editor/motion**", "**api.kie.ai/**", "**api.replicate.com/**"];

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

/** Calls the schedule route as the signed-in user (no platforms, so it can never post). */
async function schedule(page: Page, contentId: string, clientId: string, captionChoice?: string) {
  return page.evaluate(async (b) => {
    const r = await fetch("/api/social-posts/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as { error?: string; code?: string } };
  }, { contentId, clientId, scheduledAt: null, ...(captionChoice ? { captionChoice } : {}) });
}

test("captions, removing a sent post, the editor's Export and logo, and Motion as a window", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(300_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log(`console: ${m.text().slice(0, 300)}`); });
  for (const p of BLOCKED) await page.route(p, (r) => r.abort());
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-r23-${stamp}@blinkspot-test.dev`;
  const password = `R23-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Round Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Round Tester", contact_name: "Round Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", is_active: true, logo_url: IMAGE }).select("id").single();
    const brandId = b!.id as string;
    const { data: draft } = await sb.from("content").insert({ client_id: clientId, brand_id: brandId, content_type: "post_image", status: "approved", caption: "Container", image_urls: [IMAGE] }).select("id").single();
    const yesterday = new Date(Date.now() - 86_400_000); yesterday.setHours(12, 0, 0, 0);
    const sentCaption = `Sent post ${stamp}`;
    const { data: sent } = await sb.from("content").insert({ client_id: clientId, brand_id: brandId, content_type: "post_image", status: "posted", caption: sentCaption, caption_written: true, image_urls: [IMAGE], scheduled_at: yesterday.toISOString(), target_platforms: { instagram: { enabled: true, format: "feed" } } }).select("id").single();
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email, password);

    // 1. Captions. A working title alone isn't posted.
    const first = await schedule(page, draft!.id, clientId);
    expect(first).toMatchObject({ status: 400, body: { code: "needs_caption" } });
    expect(first.body.error).toContain("Container");
    await page.goto(`${BASE}/studio/library/${draft!.id}`);
    await expect(page.getByRole("note").getByText(/working title, not a caption/)).toBeVisible({ timeout: 30_000 });
    // The pick is saved straight away (the calendar posts it too).
    await page.getByRole("tab", { name: "Short" }).click();
    await expect.poll(async () => (await sb.from("content").select("caption_choice").eq("id", draft!.id).single()).data?.caption_choice).toBe("short");
    await page.getByLabel("Short caption").fill("Fresh oyster mushrooms, picked this morning.");
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await expect(page.getByRole("note")).toHaveCount(0);
    const saved = (await sb.from("content").select("caption_written, caption_choice, caption_short").eq("id", draft!.id).single()).data!;
    expect(saved).toMatchObject({ caption_written: true, caption_choice: "short" });
    // Now it passes the caption check and stops at "no platforms" (so it never posts).
    const second = await schedule(page, draft!.id, clientId);
    expect(second.body.code).toBeUndefined();
    expect(second.body.error ?? "").toMatch(/platform/i);
    await page.screenshot({ path: "test-results/round23-caption.png" });

    // 2. The calendar takes off a post that already went out.
    await page.goto(`${BASE}/studio/plan`);
    if (yesterday.getMonth() !== new Date().getMonth()) await page.getByRole("button", { name: /Previous month/ }).click();
    await page.locator(".cal-day", { has: page.locator(`[title^="${sentCaption}"]`) }).click({ timeout: 30_000 });
    const card = page.locator(".cal-side div.rounded-xl", { hasText: sentCaption });
    await card.getByRole("button", { name: /Remove/ }).click();
    const confirm = page.getByRole("alertdialog", { name: "Remove from the calendar" });
    await expect(confirm).toContainText("already went out to Instagram");
    await confirm.getByRole("button", { name: "Remove from the calendar" }).click();
    await expect(page.getByText(/Taken off the calendar\. It's still in your Library/)).toBeVisible({ timeout: 20_000 });
    const off = (await sb.from("content").select("scheduled_at, status").eq("id", sent!.id).single()).data!;
    expect(off).toMatchObject({ scheduled_at: null, status: "posted" });

    // 3. Image Editor: Export opens a menu; Add your logo adds the brand's logo as a layer.
    await page.goto(`${BASE}/studio/image?mode=design`);
    await page.getByRole("button", { name: "Blank canvas, white" }).click();
    await expect(page.locator("canvas.upper-canvas")).toBeVisible();
    await page.locator('button[aria-haspopup="menu"]', { hasText: "Export" }).click();
    const menu = page.getByRole("menu", { name: "Export" });
    await expect(menu.getByRole("menuitem")).toHaveCount(3);
    await expect(menu.getByRole("menuitem", { name: /PNG/ })).toBeInViewport();
    await page.screenshot({ path: "test-results/round23-export.png" });
    await page.mouse.click(5, 450);
    await expect(menu).toHaveCount(0);
    const layers = () => page.evaluate(() => (window as unknown as { __blinkEditorCanvas?: { getObjects(): unknown[] } }).__blinkEditorCanvas?.getObjects().length ?? 0);
    const before = await layers();
    // Let the editor settle after the menu closes (a click in the same instant can be lost on a slow page).
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Add your logo" }).first().click();
    // A cold image proxy on production can take a while the first time.
    await expect.poll(layers, { timeout: 45_000 }).toBe(before + 1);
    // Small, in the bottom-right corner.
    const box = await page.evaluate(() => { const o = (window as unknown as { __blinkEditorCanvas: { getObjects(): Array<{ getBoundingRect(): { left: number; top: number; width: number } }>; width: number } }).__blinkEditorCanvas.getObjects().at(-1)!.getBoundingRect(); return o; });
    expect(box.left).toBeGreaterThan(600);
    expect(box.width).toBeLessThan(300);
    await page.screenshot({ path: "test-results/round23-logo.png" });

    // 4. Video editor: Motion is a window, not the narrow rail.
    await page.goto(`${BASE}/studio/video?tab=editor`);
    await page.getByRole("navigation", { name: "Editor tools" }).getByRole("button", { name: "Motion" }).click({ timeout: 60_000 });
    const motion = page.getByRole("dialog", { name: "Motion graphics" });
    await expect(motion.getByLabel("What the motion is for")).toBeVisible();
    const w = (await motion.boundingBox())!.width;
    expect(w).toBeGreaterThan(600);
    await page.screenshot({ path: "test-results/round23-motion.png" });
    await page.keyboard.press("Escape");
    await expect(motion).toHaveCount(0);

    // Ask's motion link opens the Motion graphics page with the brief.
    await page.goto(`${BASE}/studio/motion?shape=1:1&brief=${encodeURIComponent("A 6 second intro for Drop 01")}`);
    await expect(page.getByLabel("What the motion is for")).toHaveValue("A 6 second intro for Drop 01", { timeout: 30_000 });
    expect(errors.filter((e) => !/ResizeObserver/.test(e))).toEqual([]);
  } finally {
    if (clientId) {
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
