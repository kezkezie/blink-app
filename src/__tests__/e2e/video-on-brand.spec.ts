import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Videos stay on brand (2026-10-20: LADI APP, auto parts, got a perfume ad). LIVE on a throwaway
 * auto-parts brand, one 5 s Draft clip (about 20 credits): a deliberately off-brand scene (a
 * perfume bottle) with "Keep it on brand" on goes through the Storyboard's own endpoint, and the
 * clip that comes back is checked frame by frame (saved to test-results for a look). Deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test video-on-brand --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("an off-brand scene comes back in the brand's world", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(900_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-onbrand-${stamp}@blinkspot-test.dev`;
  const password = `Ob-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "On Brand Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "On Brand Tester", contact_name: "On Brand Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 100 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Torque Spares", industry: "Automotive", description: "A marketplace that connects mechanics and car owners in Nairobi with trusted spare parts dealers: brake pads, filters, engines and more.", is_active: true, primary_color: "#14141A", secondary_color: "#9B5CFF" }).select("id").single();
    const { data: post } = await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "sequence_clip", status: "draft", caption: "E2E on-brand scene", ai_model: "replicate:prunaai/p-video", generation_state: "queued", billing_state: "not_charged", retry_state: "none", generation_attempt: 1 }).select("id").single();
    await signIn(page, email, password);

    const sent = await page.request.post(`${BASE}/api/video/nano-banana`, { timeout: 120_000, data: {
      mode: "scene_video_generator", post_id: post!.id, client_id: clientId, content_type: "sequence_clip",
      ai_model_override: "replicate:prunaai/p-video", aspect_ratio: "16:9", video_resolution: "720p", strict_brand_alignment: true,
      scene_data: { visual_prompt: "A hand presses a glass perfume bottle, a fine mist catches the light, slow motion, luxury studio.", ai_enhance: true, video_mode: "showcase", duration: "5", prunaDraft: false, frames: { start_frame: null, end_frame: null }, audio: { script: null, audio_url: null } },
    } });
    expect(sent.status(), await sent.text()).toBeLessThan(300);

    let job: { status: { generationState: string; message: string | null }; video_urls: string[] } | null = null;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(10_000);
      const r = await page.request.get(`${BASE}/api/video-jobs?id=${post!.id}`);
      if (r.ok()) job = await r.json();
      if (job && ["succeeded", "failed"].includes(job.status.generationState)) break;
    }
    expect(job?.status.generationState, JSON.stringify(job?.status)).toBe("succeeded");
    const url = job!.video_urls[0];
    fs.writeFileSync("test-results/video-on-brand.json", JSON.stringify({ url }));
    // Three frames, for a look at what it shows.
    await page.setContent(`<video id="v" src="${url}" muted playsinline crossorigin="anonymous" style="width:960px;height:540px;background:#000"></video>`);
    for (const t of [0.8, 2.5, 4.2]) {
      await page.evaluate((s) => new Promise<void>((res) => { const v = document.getElementById("v") as HTMLVideoElement; const go = () => { v.currentTime = s; v.onseeked = () => res(); }; if (v.readyState >= 1) go(); else v.onloadedmetadata = go; }), t);
      await page.waitForTimeout(400);
      await page.locator("#v").screenshot({ path: `test-results/video-on-brand-${t}.png` });
    }
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
