import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The video editor is easy to reach (Kezie, 2026-10-18: "the Editor on Create is for images; make
 * sure the video editor is there"): a Video editor card on Create, a Video editor button on every
 * Video Studio step, and "Edit in the video editor" on a Library video (it lands on the timeline).
 * Throwaway account, no credits spent.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test video-editor-access --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EX = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("the video editor from Create, from Video Studio and from a Library video", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(300_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-veaccess-${stamp}@blinkspot-test.dev`;
  const password = `Ve-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Editor Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Editor Tester", contact_name: "Editor Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", is_active: true }).select("id").single();
    await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "video", status: "draft", caption: "E2E reveal clip", video_urls: [`${EX}/kasi-reveal.mp4`] });
    await signIn(page, email, password);

    // 1. Create: a Video editor card next to the Image editor.
    await page.goto(`${BASE}/studio`);
    await expect(page.getByRole("link", { name: /Image editor/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: /Video editor/ }).click();
    await page.waitForURL(/\/studio\/video/);
    await expect(page.locator(".ve")).toBeVisible({ timeout: 30_000 });

    // 2. Video Studio: the button on the first step.
    await page.goto(`${BASE}/studio/video`);
    await page.getByRole("button", { name: "Video editor", exact: true }).click();
    await expect(page.locator(".ve")).toBeVisible({ timeout: 30_000 });

    // 3. Library: a video opens on the editor's timeline.
    await page.goto(`${BASE}/studio/library`);
    await page.locator(".s-media").filter({ hasText: "E2E reveal clip" }).first().click();
    await page.getByRole("button", { name: /Edit in the video editor/ }).click();
    await page.waitForURL(/\/studio\/video\?tab=editor/, { timeout: 30_000 });
    await expect(page.locator(".ve-clip.video").first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: "test-results/video-editor-access.png" });
  } finally {
    if (clientId) {
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
