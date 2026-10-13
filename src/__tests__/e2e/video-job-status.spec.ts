import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The Storyboard learns a scene is done from GET /api/video-jobs (Realtime publishes no tables).
 * It asked for two columns the table doesn't have, so every read was a 500 and finished scenes
 * looked failed (Chelsea, 2026-10-13). A finished scene must read back with its video. No credits.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test video-job-status
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("a finished Storyboard scene reads back with its video", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(120_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-videojob-${stamp}@blinkspot-test.dev`;
  const password = `Vj-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Video Tester", onboarding_completed: true } });
  expect(error).toBeNull();
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Video Tester", contact_name: "Video Tester", contact_email: email, plan_tier: "free", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Video Test", is_active: true }).select("id").single();
    const video = "https://res.cloudinary.com/dap8jijxa/video/upload/v1791913627/blinkspot/story-sequences/of0mafjpam5y9ybubi3v.mp4";
    const { data: row } = await sb.from("content").insert({
      client_id: clientId, brand_id: b!.id, content_type: "sequence_clip", status: "draft", caption: "E2E scene",
      video_urls: [video], generation_state: "succeeded", billing_state: "charged", generation_status_text: "Ready", generation_attempt: 1,
    }).select("id").single();

    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    const res = await page.request.get(`${BASE}/api/video-jobs?id=${row!.id}`);
    const body = await res.json();
    expect(res.status(), JSON.stringify(body)).toBe(200);
    expect(body.video_urls).toEqual([video]);
    expect(body.status?.generationState ?? body.status).toBeTruthy();
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
