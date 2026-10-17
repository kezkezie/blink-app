import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Images that arrive (2026-10-17, lib/image-jobs.ts). LIVE on a throwaway account, about $0.15:
 *  1. a normal image job: started, watched, lands on its post;
 *  2. a stuck job (first try silent for 10 minutes): the next look at it rescues it with a second
 *     image service, charged once, saved in our storage;
 *  3. with E2E_DEAD_N8N=1 (local only, start the dev server with N8N_WEBHOOK_BASE pointing at a
 *     dead port): Generate in the studio, the first try fails, the server tries again by itself and
 *     the picture still arrives.
 * Everything deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test image-jobs-rescue --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

type Job = { id: string; state: string; text: string | null; url: string | null; attempt: number };
async function watch(page: Page, ids: string[], ms: number): Promise<Job[]> {
  const until = Date.now() + ms;
  let jobs: Job[] = [];
  while (Date.now() < until) {
    const r = await page.request.get(`${BASE}/api/images?ids=${ids.join(",")}`);
    if (r.ok()) jobs = (await r.json()).jobs;
    if (jobs.length && jobs.every((j) => j.state !== "making")) return jobs;
    await page.waitForTimeout(4000);
  }
  return jobs;
}

test("image jobs: a normal one, a rescued one, and Generate surviving a dead router", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(900_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-imagejobs-${stamp}@blinkspot-test.dev`;
  const password = `Ij-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Image Jobs Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Image Jobs Tester", contact_name: "Image Jobs Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 100 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Mavuno Juice", industry: "Cold-pressed juice", is_active: true, primary_color: "#F28C28", secondary_color: "#1F3A2E", primary_font: "Poppins" }).select("id").single();
    const balance = async () => ((await sb.from("credit_balances").select("balance").eq("client_id", clientId!).single()).data?.balance as number);
    await signIn(page, email, password);
    const request = {
      client_id: clientId, brand_id: b!.id, mode: "standard", prompt: "A bottle of orange juice on a sunny table",
      assembled_prompt: "Studio product photo: one glass bottle of fresh orange juice on a warm wooden table in morning sun, oranges beside it, shallow depth of field. No words.",
      reference_image_urls: [], kie_model: "nano-banana-2", imageEngine: "nb2", aspect_ratio: "1:1", style: "studio", strict_brand_alignment: false, numImages: 1, is_sync: true,
    };

    // 1. A normal job.
    const started = await page.request.post(`${BASE}/api/images`, { data: { request, count: 1, caption: "E2E normal job" } });
    expect(started.status(), await started.text()).toBe(202);
    const { ids } = await started.json();
    expect(ids).toHaveLength(1);
    const [done] = await watch(page, ids, 300_000);
    expect(done.state, JSON.stringify(done)).toBe("done");
    expect(done.url).toMatch(/^https:\/\//);
    const { data: row } = await sb.from("content").select("image_urls, generation_state, client_id").eq("id", ids[0]).single();
    expect(row!.image_urls).toContain(done.url);
    expect(await balance()).toBe(82);

    // Someone else can't read it.
    const other = await page.request.get(`${BASE}/api/images?ids=${(await sb.from("content").select("id").neq("client_id", clientId).limit(1).single()).data!.id}`);
    expect((await other.json()).jobs).toEqual([]);

    // 2. A stuck job: first try silent for 10 minutes. Looking at it rescues it.
    const ago = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: stuck } = await sb.from("content").insert({
      client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption: "E2E stuck job", ai_model: "nano-banana-2",
      generation_state: "generating", generation_status_text: "Making your image", generation_started_at: ago, generation_attempt: 1, retry_state: "none", updated_at: ago,
      creation_metadata: { operation: "generate", job: { prompt: request.assembled_prompt, references: [], aspect: "1:1", engine: "nb2" } },
    }).select("id").single();
    const [first] = await watch(page, [stuck!.id], 1_000);
    expect(first.state).toBe("making");
    const [rescued] = await watch(page, [stuck!.id], 330_000);
    expect(rescued.state, JSON.stringify(rescued)).toBe("done");
    expect(rescued.attempt).toBe(2);
    expect(rescued.url).toContain("/storage/v1/object/public/assets/images/");
    const { data: after } = await sb.from("content").select("ai_model, billing_state, creation_metadata").eq("id", stuck!.id).single();
    expect(after!.ai_model).toBe("nano-banana-2");
    expect(after!.billing_state).toBe("charged");
    expect((after!.creation_metadata as { rescued?: { credits: number } }).rescued?.credits).toBe(18);
    expect(await balance()).toBe(64);
    // A second look doesn't rescue it again.
    await watch(page, [stuck!.id], 1_000);
    expect(await balance()).toBe(64);

    // 3. Generate with the router down (local only): the server tries again by itself.
    if (process.env.E2E_DEAD_N8N === "1") {
      await sb.from("credit_balances").update({ balance: 100 }).eq("client_id", clientId);
      await page.goto(`${BASE}/studio/image?mode=generate`);
      await page.getByLabel("Your idea").fill("A bottle of Mavuno orange juice on a sunny kitchen table, morning light");
      await page.getByRole("button", { name: /Use my words/ }).click();
      await page.getByLabel("Quality draft").click();
      await page.getByRole("button", { name: /^Generate/ }).click();
      await expect(page.getByRole("button", { name: /trying a second image service/i })).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText(/made and saved to your Library/)).toBeVisible({ timeout: 330_000 });
      const { data: made } = await sb.from("content").select("image_urls, creation_metadata").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).single();
      expect((made!.creation_metadata as { rescued?: unknown }).rescued).toBeTruthy();
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
