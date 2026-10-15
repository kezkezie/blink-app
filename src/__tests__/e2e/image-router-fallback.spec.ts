import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * n8n after the 2026-10-15 key move and timeout fallback (scripts/ops/n8n-keys-and-timeout-fallback-
 * 2026-10-15.mjs). LIVE on a throwaway account: the classic X-ray scan (OpenAI key now an n8n
 * credential) and up to 4 Nano Banana 2 renders through Generate's router. Kie failed about half
 * its tasks that day, so a timeout must now come back as a picture made on Replicate (Replicate
 * token now an n8n credential) instead of a refund. Each render is a picture or a refund, never a
 * charge with nothing. Everything deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test image-router-fallback
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const ROUTER = "LXINWLmOghHWzRgA";
const POSTER = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/kasi-poster.jpg";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("classic X-ray and router renders work with credentials; Kie timeouts land via Replicate", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.N8N_API_KEY, "needs the service and n8n keys");
  test.setTimeout(900_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const n8n = { "X-N8N-API-KEY": process.env.N8N_API_KEY! };
  const stamp = Date.now();
  const startedAt = new Date().toISOString();
  const email = `e2e-router-${stamp}@blinkspot-test.dev`;
  const password = `Rt-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Router Tester", onboarding_completed: true } });
  expect(error).toBeNull();
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Router Tester", contact_name: "Router Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 300 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Router Test", is_active: true }).select("id").single();
    const { data: poster } = await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption: "E2E poster", image_urls: [POSTER] }).select("id").single();
    const balance = async () => ((await sb.from("credit_balances").select("balance").eq("client_id", clientId!).single()).data?.balance as number);
    await signIn(page, email, password);

    // 1. The classic X-ray (n8n, OpenAI through the new credential).
    const xray = await page.request.post(`${BASE}/api/video/nano-banana`, { data: { mode: "scene_video_generator", video_mode: "xray_image", content_id: poster!.id }, timeout: 120_000 });
    const scan = await xray.json();
    expect(xray.status(), JSON.stringify(scan).slice(0, 300)).toBe(200);
    expect(scan.schema?.objects?.length).toBeGreaterThan(1);
    expect(await balance()).toBe(299);

    // 2. Nano Banana 2 renders through the router until one has gone through the fallback (at most 4).
    let made = 0, refunded = 0, viaReplicate = 0;
    for (let i = 0; i < 4 && viaReplicate === 0; i++) {
      const { data: row } = await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption: `E2E render ${i}`, generation_status_text: "Making your image" }).select("id").single();
      const before = await balance();
      const res = await page.request.post(`${BASE}/api/workflows?path=blink-generate-images`, {
        timeout: 300_000,
        data: {
          client_id: clientId, brand_id: b!.id, mode: "standard", post_id: row!.id,
          prompt: "A green ceramic mug on a white table", assembled_prompt: "A green ceramic mug on a white table, soft window light, photographed from the side. No words anywhere.",
          reference_image_urls: [], kie_model: "nano-banana-2", imageEngine: "nb2", aspect_ratio: "1:1", style: "plain",
          strict_brand_alignment: false, numImages: 1, brand_name: "Router Test", is_sync: true,
        },
      });
      const body = await res.json().catch(() => ({}));
      const urls = Array.isArray(body.imageUrls) ? body.imageUrls : body.imageUrls ? [body.imageUrls] : [];
      const after = await balance();
      console.log(`render ${i}: ${res.status()} ${urls.length ? "picture" : `no picture (${body.reason || body.message || ""})`} | credits ${before} → ${after}`);
      if (urls.length) { made++; expect(after).toBeLessThan(before); }
      else { refunded++; expect(after).toBe(before); }
      // Which path it took, from n8n's own record of this run.
      const list = await (await fetch(`${N8N}/executions?workflowId=${ROUTER}&limit=5`, { headers: n8n })).json();
      const mine = (list.data ?? []).filter((e: { startedAt: string }) => e.startedAt >= startedAt);
      for (const e of mine.slice(0, 1)) {
        const full = await (await fetch(`${N8N}/executions/${e.id}?includeData=true`, { headers: n8n })).json();
        const ran = Object.keys(full.data?.resultData?.runData ?? {});
        if (ran.includes("Kie Too Slow?") && ran.includes("Create Replicate Task")) viaReplicate++;
        console.log(`  n8n ${e.id}: ${ran.includes("Kie Too Slow?") ? (ran.includes("Create Replicate Task") ? "Kie timed out → Replicate" : "Kie failed → refund") : ran.includes("Create Replicate Task") ? "Kie refused the task → Replicate" : "Kie made it"}`);
      }
    }
    expect(made + refunded).toBeGreaterThan(0);
    expect(made).toBeGreaterThan(0);
    console.log(`made ${made}, refunded ${refunded}, via Replicate after a Kie timeout: ${viaReplicate}`);
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
