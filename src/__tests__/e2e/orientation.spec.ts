import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TOUR_STEPS } from "@/lib/guide";

/**
 * Orientation (2026-10-20). LIVE on a throwaway account: the tour walks every stop and lights up
 * the right place, finishing it is remembered on the account, the Guide searches, Getting started
 * ticks off from real activity, and Ask BlinkSpot reads a file it's given (one included message).
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test orientation --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("tour, guide, getting started, and Ask reading a file", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(300_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-orient-${stamp}@blinkspot-test.dev`;
  const password = `Or-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Orient Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Orient Tester", contact_name: "Orient Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 50 }, { onConflict: "client_id" });
    await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Mama Ngina Bakes", is_active: true, primary_color: "#C2410C", logo_url: "https://www.blinkspot.io/brand/mark-lime.png" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email, password);

    // ---- The tour, every stop.
    await page.goto(`${BASE}/studio?tour=1`);
    for (const [i, s] of TOUR_STEPS.entries()) {
      const card = page.getByRole("dialog", { name: `Tour: ${s.title}` });
      await expect(card).toBeVisible({ timeout: i ? 5000 : 20_000 });
      await expect(card.getByText(`${i + 1} / ${TOUR_STEPS.length}`)).toBeVisible();
      if (s.target) {
        // The lit place is the right one: the ring sits over the element the step names (once it has slid there).
        await page.waitForTimeout(450);
        const want = (await page.locator(`[data-tour="${s.target}"]:visible`).first().boundingBox())!;
        const ring = await page.evaluate(() => { const el = [...document.querySelectorAll<HTMLElement>("div[aria-hidden]")].find((d) => d.style.boxShadow.includes("9999px")); const r = el?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; });
        expect(ring, s.target).not.toBeNull();
        expect(Math.abs(ring!.x + ring!.w / 2 - (want.x + want.width / 2))).toBeLessThan(4);
        expect(Math.abs(ring!.y + ring!.h / 2 - (want.y + want.height / 2))).toBeLessThan(4);
      }
      if (i < TOUR_STEPS.length - 1) await card.getByRole("button", { name: i === 0 ? "Show me" : "Next" }).click();
    }
    await page.getByRole("dialog", { name: /^Tour: / }).getByRole("button", { name: "Open the Guide" }).click();
    await page.waitForURL(/\/studio\/guide/);
    await expect.poll(async () => (await sb.auth.admin.getUserById(u.user!.id)).data.user?.user_metadata?.tour_done, { timeout: 15_000 }).toBe(true);

    // ---- The Guide searches in plain words.
    await page.getByLabel("Search the guide").fill("remove object");
    await expect(page.getByText("AI eraser (A)")).toBeVisible();
    await expect(page.getByText("Inspo Remix")).toHaveCount(0);
    await page.getByLabel("Search the guide").fill("instagram");
    await expect(page.getByText("Where do I connect Instagram or TikTok?")).toBeVisible();

    // ---- Getting started: the brand kit is done (logo and colour); asking ticks another.
    await page.goto(`${BASE}/studio`);
    const start = page.getByRole("region", { name: "Getting started" });
    await expect(start).toBeVisible({ timeout: 20_000 });
    await expect(start.getByText("1 of 5")).toBeVisible();
    await expect(start.getByRole("link", { name: "Set up your brand (done)" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: /^Tour: / })).toHaveCount(0); // not again

    // ---- Ask reads a file: the answer is only in the file.
    const code = `KESTREL-${stamp % 10000}`;
    await page.getByRole("button", { name: "Ask BlinkSpot" }).first().click();
    const ask = page.getByRole("dialog", { name: "Ask BlinkSpot" });
    await expect(ask).toBeVisible();
    await ask.locator('input[type="file"]').setInputFiles({ name: "launch-notes.txt", mimeType: "text/plain", buffer: Buffer.from(`Launch notes for Mama Ngina Bakes.\nThe discount code for the launch weekend is ${code}.\nIt gives 15% off all cakes.`) });
    await expect(ask.getByText("launch-notes.txt")).toBeVisible({ timeout: 30_000 });
    await ask.getByLabel("Message").fill("What is the discount code in the file I attached, and how much off does it give?");
    await ask.getByRole("button", { name: "Send" }).click();
    await expect(ask.getByText(new RegExp(code))).toBeVisible({ timeout: 120_000 });
    await expect(ask.getByText(/15\s?%/).first()).toBeVisible();

    await page.goto(`${BASE}/studio`);
    await expect(page.getByRole("region", { name: "Getting started" }).getByText("2 of 5")).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  } finally {
    if (clientId) {
      const { data: files } = await sb.storage.from("assets").list(`references/${clientId}`, { limit: 100 });
      if (files?.length) await sb.storage.from("assets").remove(files.map((f) => `references/${clientId}/${f.name}`));
      await sb.from("conversations").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
