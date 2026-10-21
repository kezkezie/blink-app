import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";

/**
 * Video Inspo, shot by shot (Kezie, 2026-10-22). Throwaway account with a copy of a real brand kit:
 * a reference video is read, each scene's frame is remade for the brand (no words), and the frames
 * go to the Storyboard as each scene's start frame. No videos are rendered (the costly step).
 *   MOTION_INSPO_VIDEO=/path/to/reference.mp4 PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test video-inspo-frames --workers=1
 * Writes test-results/inspo-frames.json (the plan and the frames).
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const VIDEO = process.env.MOTION_INSPO_VIDEO;
test.use({ channel: "chrome" });

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("a reference's shots are remade for the brand with no words and start the Storyboard's scenes", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY || !VIDEO || !fs.existsSync(VIDEO), "needs the service key and MOTION_INSPO_VIDEO");
  test.setTimeout(600_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-vframes-${stamp}@blinkspot-test.dev`;
  const password = `Vf-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Frames Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Frames Tester", contact_name: "Frames Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 300 }, { onConflict: "client_id" });
    await sb.from("brand_profiles").insert({
      client_id: clientId, brand_name: "NUF FARMS", is_active: true, industry: "Agriculture", primary_color: "#1F1D1B", secondary_color: "#9C9A96", primary_font: "Archivo",
      website_url: "https://nuffarms.com", description: "Container mushroom farm in Kiambu growing fresh button mushrooms.",
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, email, password);

    await page.goto(`${BASE}/studio/video/inspo`);
    await page.locator('input[type="file"][accept="video/*"]').first().setInputFiles(VIDEO!);
    await page.getByRole("button", { name: /Remake it for NUF FARMS/ }).click({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /Make the first frames/ })).toBeVisible({ timeout: 240_000 });
    const scenes = await page.locator('[aria-label^="Your frame, scene"]').count();
    console.log(`scenes: ${scenes}`);
    await page.getByRole("button", { name: /Make the first frames/ }).click();
    await expect(page.locator('img[alt^="Your frame, scene"]')).toHaveCount(scenes, { timeout: 360_000 });
    const frames = await page.locator('img[alt^="Your frame, scene"]').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
    fs.writeFileSync("test-results/inspo-frames.json", JSON.stringify({ frames }, null, 2));
    console.log(frames.join("\n"));
    await page.screenshot({ path: "test-results/inspo-frames.png", fullPage: true });

    // To the Storyboard: every scene starts from its frame.
    await page.getByRole("button", { name: /Animate them in the Storyboard/ }).click();
    await page.waitForURL(/mode=storytelling/, { timeout: 60_000 });
    await expect(page.locator(`img[src="${frames[0]}"]`).first()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: "test-results/inspo-frames-storyboard.png", fullPage: true });
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
