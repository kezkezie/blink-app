import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Stop anything (Kezie, 2026-10-25: "a way to stop any kind of AI generation ... when we mistakenly
 * push the button"). LIVE on a throwaway account (deleted after); each provider may still bill a few
 * cents for work that was under way:
 * 1. A video n8n is making (Pruna, 4 s) is stopped from its Library card once n8n has charged: the
 *    post goes, the charge comes back once, and n8n's own ending saves nothing and refunds nothing.
 * 2. The motion planner stopped from the browser: its 4 credits come back.
 * 3. A video upscale stopped: cancelled at Replicate, its credits back.
 * 4. Edit with AI stopped while it renders: its post goes, credits back, the finished render isn't saved.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test stop-everything --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const PICTURE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/examples/kasi-poster.jpg`;
const VIDEO = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/examples/oud-noir-push.mp4`;

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("stop: a video n8n is making, a motion plan, a video upscale and an AI edit", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(900_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-stopall-${stamp}@blinkspot-test.dev`;
  const password = `Sa-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Stop All", onboarding_completed: true } });
  let clientId = "";
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Stop All", contact_name: "Stop All", contact_email: email, plan_tier: "agency", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 600 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Stop Test", is_active: true, primary_color: "#C6F432", secondary_color: "#0C0D0F" }).select("id").single();
    const brandId = b!.id as string;
    const balance = async () => ((await sb.from("credit_balances").select("balance").eq("client_id", clientId).single()).data?.balance as number);
    const ledgerFor = async (tag: string) => ((await sb.from("credit_transactions").select("amount, description").eq("client_id", clientId).like("description", `%${tag}%`)).data ?? []) as Array<{ amount: number; description: string }>;
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email, password);

    const parts = new Set((process.env.STOP_PARTS ?? "1,2,3,4").split(","));
    // ── 1. A video n8n is making, stopped from its Library card ──
    if (parts.has("1")) {
    const start1 = await balance();
    const { data: row } = await sb.from("content").insert({ client_id: clientId, brand_id: brandId, content_type: "reel", caption: "Stop test video", status: "draft", ai_model: "replicate:prunaai/p-video", generation_status_text: "Initializing AI Engine..." }).select("id").single();
    const vid = row!.id as string;
    const making = page.request.post(`${BASE}/api/workflows?path=blink-generate-video-v1`, {
      data: { client_id: clientId, brand_id: brandId, post_id: vid, video_mode: "showcase", primary_image_url: PICTURE, user_prompt: "Slow push-in, soft light across the poster", is_sequence: false, ai_model_override: "replicate:prunaai/p-video", strict_brand_alignment: true, aspect_ratio: "9:16", duration: "4", ai_enhance: false },
      timeout: 330_000,
    }).catch(() => null);
    await expect.poll(async () => (await sb.from("content").select("generation_state").eq("id", vid).single()).data?.generation_state, { timeout: 90_000, intervals: [2000] }).toBe("generating");
    const charged = -(await ledgerFor(`[vid:${vid}]`)).reduce((n, r) => n + r.amount, 0);
    console.log(`video charged ${charged} credits`);
    expect(charged).toBeGreaterThan(0);
    await page.goto(`${BASE}/studio/library`);
    const card = page.locator(".s-media").filter({ hasText: "Stop test video" });
    await card.getByRole("button", { name: "Stop", exact: true }).click({ timeout: 60_000 });
    await expect(page.getByText(`Stopped. ${charged} credits are back.`)).toBeVisible({ timeout: 30_000 });
    await expect(card).toHaveCount(0);
    expect(await balance()).toBe(start1);
    // n8n finishes its run on its own: nothing is saved, nothing is refunded twice.
    await making;
    await page.waitForTimeout(10_000);
    expect((await sb.from("content").select("id").eq("id", vid)).data ?? []).toEqual([]);
    const net = (await ledgerFor(`[vid:${vid}]`)).reduce((n, r) => n + r.amount, 0);
    console.log("video ledger", JSON.stringify(await ledgerFor(`[vid:${vid}]`)));
    expect(net).toBe(0);
    expect(await balance()).toBe(start1);
    }

    // ── 2. The motion planner, stopped from the browser ──
    if (parts.has("2")) {
    const start2 = await balance();
    const aborted = await page.evaluate(async (brand) => {
      const ac = new AbortController();
      const p = fetch("/api/editor/motion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: brand, prompt: "A 6 second intro for our launch", shape: "9:16" }), signal: ac.signal }).then(() => "answered", () => "aborted");
      await new Promise((r) => setTimeout(r, 2500));
      ac.abort();
      return p;
    }, brandId);
    expect(aborted).toBe("aborted");
    await expect.poll(balance, { timeout: 90_000, intervals: [3000] }).toBe(start2);
    console.log("motion plan stopped, balance back to", start2);
    }

    // ── 3. A video upscale, stopped ──
    if (parts.has("3")) {
    const { data: v } = await sb.from("content").insert({ client_id: clientId, brand_id: brandId, content_type: "video", status: "draft", caption: "Stop upscale source", video_urls: [VIDEO], image_urls: [] }).select("id").single();
    const start3 = await balance();
    const up = await page.request.post(`${BASE}/api/upscale`, { data: { contentId: v!.id, target: "1080p" }, timeout: 120_000 });
    const job = await up.json();
    expect(up.status(), JSON.stringify(job)).toBe(200);
    expect(job.state).toBe("running");
    expect(await balance()).toBe(start3 - job.credits);
    const stop3 = await page.request.delete(`${BASE}/api/upscale?job=${job.id}`);
    const stopped3 = await stop3.json();
    expect(stopped3.state).toBe("failed");
    expect(stopped3.error).toMatch(/^Stopped\./);
    expect(await balance()).toBe(start3);
    const { data: uj } = await sb.from("upscale_jobs").select("prediction_id").eq("id", job.id).single();
    if (uj?.prediction_id && process.env.REPLICATE_API_TOKEN) {
      const pr = await (await fetch(`https://api.replicate.com/v1/predictions/${uj.prediction_id}`, { headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` } })).json();
      console.log("replicate prediction after stop:", pr.status);
      expect(["canceled", "failed", "succeeded"]).toContain(pr.status);
    }
    }

    // ── 4. Edit with AI, stopped while it renders ──
    const { data: pic } = await sb.from("content").insert({ client_id: clientId, brand_id: brandId, content_type: "post_image", status: "draft", caption: "Stop edit source", image_urls: [PICTURE] }).select("id").single();
    const scan = await page.request.post(`${BASE}/api/ai-edit/scan`, { data: { contentId: pic!.id }, timeout: 180_000 });
    expect(scan.status(), await scan.text()).toBe(200);
    const start4 = await balance();
    const applying = page.request.post(`${BASE}/api/ai-edit/apply`, { data: { contentId: pic!.id, engine: "nano-banana-2", changes: { objects: [], instruction: "Make the background a deep blue" }, swaps: {} }, timeout: 300_000 })
      .then(async (r) => ({ status: r.status(), body: await r.json().catch(() => ({})) }));
    let placeholder = "";
    await expect.poll(async () => {
      const { data } = await sb.from("content").select("id").eq("client_id", clientId).eq("creation_metadata->>source_content_id", pic!.id).not("generation_status_text", "is", null);
      placeholder = (data?.[0]?.id as string) ?? "";
      return placeholder;
    }, { timeout: 30_000, intervals: [1000] }).not.toBe("");
    const stop4 = await (await page.request.delete(`${BASE}/api/jobs?ids=${placeholder}`)).json();
    console.log("edit stop", JSON.stringify(stop4));
    expect(stop4.stopped).toContain(placeholder);
    expect(await balance()).toBe(start4);
    const done4 = await applying;
    console.log("edit apply ended", done4.status, JSON.stringify(done4.body));
    expect(done4.status).toBe(499);
    expect((await sb.from("content").select("id").eq("id", placeholder)).data ?? []).toEqual([]);
    expect(await balance()).toBe(start4);
    expect(errors).toEqual([]);
  } finally {
    if (clientId) {
      const { data: rows } = await sb.from("content").select("image_urls, video_urls").eq("client_id", clientId);
      const paths = (rows ?? []).flatMap((r) => [...((r.image_urls as string[] | null) ?? []), ...((r.video_urls as string[] | null) ?? [])])
        .map((x) => String(x).split("/object/public/assets/")[1]).filter((x) => x && x.includes(clientId));
      if (paths.length) await sb.storage.from("assets").remove(paths);
      await sb.from("upscale_jobs").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
