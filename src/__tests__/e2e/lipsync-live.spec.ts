import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Lip-sync works end to end (Kezie, 2026-10-22: "all the features for the AI videos ... make sure
 * they all work"). It was dead: the scene route 400'd video_mode "audio_to_video". LIVE on a
 * throwaway account: the example face + voice, Pruna (cheapest), one 5 s clip. Deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test lipsync-live --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const FACE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/examples/sauti-creator-frame.jpg`;
const VOICE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/examples/sauti-creator-voice.mp3`;

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 4; i++) {
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    if (await page.waitForURL(/\/(studio|welcome)/, { timeout: 20_000, waitUntil: "commit" }).then(() => true, () => false)) return;
  }
  throw new Error("couldn't sign in");
}

test("lip-sync renders through the scene route (audio_to_video)", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(600_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-lipsync-${stamp}@blinkspot-test.dev`;
  const password = `Ls-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Lip Sync", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Lip Sync", contact_name: "Lip Sync", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 200 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Sauti", industry: "Music", is_active: true }).select("id").single();
    const { data: post } = await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "sequence_clip", status: "draft", caption: "E2E lip-sync", image_urls: [], reference_image_url: FACE, ai_model: "replicate:prunaai/p-video", generation_state: "queued", billing_state: "not_charged", retry_state: "none", generation_attempt: 1 }).select("id").single();
    await signIn(page, email, password);

    const sent = await page.request.post(`${BASE}/api/video/nano-banana`, { timeout: 120_000, data: {
      mode: "scene_video_generator", post_id: post!.id, client_id: clientId, brand_id: b!.id,
      primary_image_url: FACE, user_prompt: "She speaks warmly to the camera", duration: "5",
      video_mode: "audio_to_video", ai_model_override: "replicate:prunaai/p-video",
      scene_data: { ai_enhance: false, audio: { audio_url: VOICE } },
    } });
    // Before the fix this was 400 "Invalid request". Now it must be accepted.
    expect(sent.status(), await sent.text()).toBeLessThan(300);

    let job: { status: { generationState: string; message: string | null }; video_urls: string[] } | null = null;
    for (let i = 0; i < 70; i++) {
      await page.waitForTimeout(8000);
      const r = await page.request.get(`${BASE}/api/video-jobs?id=${post!.id}`);
      if (r.ok()) job = await r.json();
      if (job && ["succeeded", "failed"].includes(job.status.generationState)) break;
    }
    console.log(`lip-sync job: ${JSON.stringify(job?.status)} url=${job?.video_urls?.[0] ?? "none"}`);
    expect(job?.status.generationState, JSON.stringify(job?.status)).toBe("succeeded");
    expect(job!.video_urls[0]).toMatch(/^https?:\/\//);
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
