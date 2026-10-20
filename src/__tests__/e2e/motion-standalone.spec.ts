import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Motion graphics from Create (2026-10-20). LIVE on a throwaway account, 4 credits: the Create card
 * opens the Motion page, a plan is written, made in the browser and saved to the Library, with
 * Download and "Open in the video editor". Deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test motion-standalone --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("motion graphics on their own page, saved to the Library", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(400_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-motionpage-${stamp}@blinkspot-test.dev`;
  const password = `Mp-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Motion Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Motion Tester", contact_name: "Motion Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 50 }, { onConflict: "client_id" });
    await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", is_active: true, primary_color: "#E4572E", secondary_color: "#14141A", primary_font: "Space Grotesk" });
    await signIn(page, email, password);

    await page.goto(`${BASE}/studio`);
    await page.getByRole("link", { name: /Motion graphics/ }).click();
    await page.waitForURL(/\/studio\/motion/);
    await page.getByRole("tab", { name: /1:1/ }).click();
    await page.getByLabel("What the motion is for").fill("A 6 second intro for our Drop 01 sneaker launch: the words Drop 01, then an end card saying Shop the drop");
    await page.getByRole("button", { name: /Write it/ }).click();
    const studio = page.getByRole("dialog", { name: "Motion" });
    await expect(studio.getByRole("button", { name: /^Make it/ })).toBeVisible({ timeout: 120_000 });
    await studio.getByRole("button", { name: /^Make it/ }).click();
    await expect(page.getByText(/saved to your Library/)).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
    const { data: row } = await sb.from("content").select("video_urls, ai_model").eq("client_id", clientId).eq("ai_model", "remotion").single();
    expect((row!.video_urls as string[])[0]).toMatch(/\/videos\/.+\/motion_\d+\.(mp4|webm)$/);
    await page.getByRole("button", { name: "Open in the video editor" }).click();
    await page.waitForURL(/\/studio\/video\?tab=editor/);
    await expect(page.locator(".ve-clip.video").first()).toBeVisible({ timeout: 30_000 });
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
