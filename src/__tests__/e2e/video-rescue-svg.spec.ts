import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Videos that arrive and SVG logos (2026-10-18). LIVE on a throwaway account, one Nano Banana 2
 * image and one 4 s Seedance 2.0 clip on Replicate:
 *  1. an image with an SVG logo as its reference (LADI APP's every logo image failed with "File type
 *     not supported"): the logo goes as a PNG copy and the image arrives;
 *  2. a Storyboard scene whose first try failed and was refunded: the next status check starts a
 *     second try on Replicate, the scene keeps "making", the video lands in our storage, and it's
 *     charged once, only then.
 * Everything deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test video-rescue-svg --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EX = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" rx="8" fill="#14141A"/><text x="60" y="27" font-family="Arial" font-size="20" font-weight="700" fill="#9B5CFF" text-anchor="middle">LADI</text></svg>`;

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("an SVG logo image arrives, and a failed scene video is re-made and charged once", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(1_200_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-vrescue-${stamp}@blinkspot-test.dev`;
  const password = `Vr-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Rescue Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  const files: string[] = [];
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Rescue Tester", contact_name: "Rescue Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 500 }, { onConflict: "client_id" });
    const logoPath = `images/${clientId}/logo_${stamp}.svg`;
    await sb.storage.from("assets").upload(logoPath, new Blob([SVG], { type: "image/svg+xml" }), { contentType: "image/svg+xml" });
    files.push(logoPath);
    const logo = sb.storage.from("assets").getPublicUrl(logoPath).data.publicUrl;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "LADI Test", industry: "Auto parts marketplace", is_active: true, primary_color: "#14141A", secondary_color: "#9B5CFF", logo_url: logo }).select("id").single();
    const balance = async () => ((await sb.from("credit_balances").select("balance").eq("client_id", clientId!).single()).data?.balance as number);
    await signIn(page, email, password);

    // 1. An image with the SVG logo.
    const started = await page.request.post(`${BASE}/api/images`, { data: { count: 1, caption: "E2E svg logo", request: {
      client_id: clientId, brand_id: b!.id, mode: "standard", prompt: "A mechanic holding a brake pad",
      assembled_prompt: "Poster: a mechanic in a workshop holding a new brake pad. Image 1 is our logo: place it small in the top-left corner exactly as given.",
      reference_image_urls: [logo], logo_url: logo, kie_model: "nano-banana-2", imageEngine: "nb2", aspect_ratio: "1:1", style: "poster", strict_brand_alignment: true, numImages: 1, is_sync: true,
    } } });
    expect(started.status(), await started.text()).toBe(202);
    const { ids } = await started.json();
    let job: { state: string; url: string | null; text: string | null } = { state: "making", url: null, text: null };
    for (let i = 0; i < 90 && job.state === "making"; i++) {
      await page.waitForTimeout(4000);
      const r = await page.request.get(`${BASE}/api/images?ids=${ids[0]}`);
      if (r.ok()) job = (await r.json()).jobs[0] ?? job;
    }
    expect(job.state, JSON.stringify(job)).toBe("done");
    const { data: refs } = await sb.storage.from("assets").list(`references/${clientId}`);
    expect((refs ?? []).some((f) => /^conv_[0-9a-f]+\.png$/.test(f.name))).toBe(true);
    (refs ?? []).forEach((f) => files.push(`references/${clientId}/${f.name}`));
    const afterImage = await balance();
    expect(afterImage).toBeLessThan(500);

    // 2. A scene whose first try failed (refunded). The next check re-makes it.
    const { data: scene } = await sb.from("content").insert({
      client_id: clientId, brand_id: b!.id, content_type: "sequence_clip", status: "failed", caption: "E2E rescued scene", ai_model: "bytedance/seedance-2",
      generation_state: "failed", generation_error_code: "provider_failure", billing_state: "refunded", retry_state: "retry_available", generation_attempt: 1, credit_cost: 164,
      generation_status_text: "Generation failed. Credits refunded.",
      creation_metadata: { video_job: { prompt: "Slow push-in on a glossy sneaker on a concrete step, morning light, gentle camera move.", start: `${EX}/kasi-poster.jpg`, end: null, seconds: 4, aspect: "9:16", resolution: "720p", model: "bytedance/seedance-2", audio: false } },
    }).select("id").single();
    const check = async () => (await (await page.request.get(`${BASE}/api/video-jobs?id=${scene!.id}`)).json()) as { status: { generationState: string; message: string | null; attempt: number }; video_urls: string[] };
    const first = await check();
    expect(first.status.generationState).toBe("generating");
    expect(first.status.attempt).toBe(2);
    expect(first.status.message).toMatch(/trying another video service/);
    let last = first;
    for (let i = 0; i < 80 && last.status.generationState !== "succeeded" && last.status.generationState !== "failed"; i++) {
      await page.waitForTimeout(10_000);
      last = await check();
    }
    expect(last.status.generationState, JSON.stringify(last.status)).toBe("succeeded");
    expect(last.video_urls[0]).toContain(`/storage/v1/object/public/assets/videos/${clientId}/rescue_`);
    files.push(last.video_urls[0].split("/assets/")[1]);
    expect(await balance()).toBe(afterImage - 164);
    const { data: tx } = await sb.from("credit_transactions").select("amount, description").eq("client_id", clientId).like("description", `%[vidr:${scene!.id}]%`);
    expect(tx).toHaveLength(1);
    // Another check doesn't charge again or start again.
    await check();
    expect(await balance()).toBe(afterImage - 164);
  } finally {
    if (files.length) await sb.storage.from("assets").remove(files);
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
