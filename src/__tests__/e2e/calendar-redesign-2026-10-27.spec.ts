import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The calendar redesign (Kezie, 2026-10-27, from his two Dribbble picks): Week is a time grid with
 * picture blocks and a "now" line, a post opens as a card, an empty time then a ready post puts it
 * there (taps, for the iPad), List has day chips with the next post lit up, Month still works, and
 * the chosen view is kept. Throwaway account; nothing reaches PostForMe (the queue route is blocked
 * and the posts placed here have no platforms). Deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test calendar-redesign --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EX = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples";

test("calendar: week grid, post card, tap to place, list and month", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(240_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-calendar-${stamp}@blinkspot-test.dev`;
  const password = `Ca-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Calendar Test", onboarding_completed: true } });
  let clientId = "";
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const queued: string[] = [];
  // Thumbnails load lazily: wait for the ones on screen before a screenshot.
  const thumbs = (sel: string) => page.waitForFunction((q) => [...document.querySelectorAll<HTMLImageElement>(q)].filter((i) => i.getBoundingClientRect().top < innerHeight).every((i) => i.complete && i.naturalWidth > 0), sel, { timeout: 20_000 });
  await page.route("**/api/social-posts/schedule**", (r) => { queued.push(r.request().url()); return r.abort(); });
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Nuf Calendar", contact_name: "Calendar Test", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Nuf Farms", industry: "Farming", is_active: true }).select("*").single();
    const at = (days: number, h: number, m = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.toISOString(); };
    const yt = { youtube: { enabled: true, format: "standard" } };
    const rows = [
      { caption: "Sunrise over the maize rows", scheduled_at: at(1, 10), target_platforms: yt, postforme_tracking_id: `sp_test_${stamp}`, status: "approved", image_urls: [`${EX}/mavuno-poster.jpg`] },
      { caption: "Fresh milk, straight from the farm", scheduled_at: at(1, 10, 15), image_urls: [`${EX}/kasi-poster.jpg`], status: "draft" },
      { caption: "Harvest day behind the scenes", scheduled_at: at(2, 18, 30), image_urls: [`${EX}/mavuno-poster.jpg`], status: "draft" },
      { caption: "Last week's market stall", scheduled_at: at(-1, 12), target_platforms: yt, postforme_tracking_id: `sp_old_${stamp}`, status: "posted", image_urls: [`${EX}/kasi-poster.jpg`] },
      { caption: "Ready: our new egg trays", image_urls: [`${EX}/mavuno-poster.jpg`], status: "draft" },
    ];
    for (const r of rows) await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "post_image", ...r });

    await page.addInitScript((brand) => { localStorage.setItem("blink-active-brand", JSON.stringify({ state: { activeBrand: brand }, version: 0 })); localStorage.setItem("blink.tourDone", "1"); }, b);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/plan`);

    // Week by default: the clock, seven days, the posts as blocks, a line at "now".
    const views = page.getByRole("group", { name: "View" });
    await expect(views.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
    await expect(page.locator(".calx-clock")).toHaveText(/^\d\d:\d\d$/);
    await expect(page.locator(".wk-col")).toHaveCount(7);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDay() === 1) await page.getByRole("button", { name: "Next week" }).click(); // today is Sunday
    const sunrise = page.locator(".wk-block", { hasText: "Sunrise over the maize rows" });
    await expect(sunrise).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".wk-block", { hasText: "Fresh milk" })).toBeVisible();
    // 10:00 and 10:15 overlap: side by side, half width each.
    const [w1, w2] = [await sunrise.boundingBox(), await page.locator(".wk-block", { hasText: "Fresh milk" }).boundingBox()];
    expect(Math.abs(w1!.width - w2!.width)).toBeLessThan(3);
    expect(w2!.x).toBeGreaterThan(w1!.x + w1!.width - 2);
    await expect(page.getByText(/Auto-posting/).first()).toBeVisible();
    await thumbs(".wk-block img");
    await page.screenshot({ path: "test-results/calendar-week.png" });

    // A post opens as a card: picture, status, when, where, actions.
    await sunrise.click();
    const card = page.getByRole("dialog", { name: "Post on the calendar" });
    await expect(card.getByText(/^Tomorrow at 10:00$/)).toBeVisible();
    await expect(card.getByText("Queued")).toBeVisible();
    await expect(card.getByRole("link", { name: /Open/ })).toBeVisible();
    await thumbs(".pc-media img");
    await page.waitForTimeout(300); // the card's fade-in
    await page.screenshot({ path: "test-results/calendar-card.png" });
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);

    // Tap an empty time, then a ready post: it goes there (no platforms, so nothing is queued).
    await page.locator(".wk-scroll").evaluate((el) => { el.scrollTop = 13 * 56; });
    const col = page.getByRole("gridcell", { name: tomorrow.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) });
    const box = (await col.boundingBox())!; // already scrolled: a real tap at 15:00, not Playwright's own scrolling
    await page.mouse.click(box.x + 12, box.y + 15 * 56 + 8);
    await expect(page.getByText(/^Put a post at .*15:00$/)).toBeVisible();
    await expect(page.locator(".wk-slot.picked")).toContainText("15:00");
    await page.getByRole("button", { name: "Put it at 15:00" }).click();
    await expect(page.getByText(/On the calendar for .*15:00/)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".wk-block", { hasText: "Ready: our new egg trays" })).toBeVisible();
    const { data: placed } = await sb.from("content").select("scheduled_at").eq("client_id", clientId).eq("caption", "Ready: our new egg trays").single();
    expect(new Date(placed!.scheduled_at!).getHours()).toBe(15);

    // List: day chips, and the next post to go out lit up.
    await views.getByRole("button", { name: "List" }).click();
    await expect(page.locator(".ag-day")).toHaveCount(28);
    await expect(page.locator(".ag-card.next")).toContainText("Sunrise over the maize rows");
    await thumbs(".ag-card img");
    await page.screenshot({ path: "test-results/calendar-list.png" });

    // Month still works, and the view is kept on this device.
    await views.getByRole("button", { name: "Month" }).click();
    await expect(page.locator(".cal-day").first()).toBeVisible();
    await expect(page.locator(".cal-chip", { hasText: "10:00" }).first()).toBeVisible();
    await thumbs(".cal-chip img");
    await page.screenshot({ path: "test-results/calendar-month.png" });
    await page.reload();
    await expect(page.getByRole("group", { name: "View" }).getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });

    // An iPad in landscape.
    await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Week" }).click();
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.screenshot({ path: "test-results/calendar-week-ipad.png" });
    expect(errors).toEqual([]);
    expect(queued).toEqual([]);
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
