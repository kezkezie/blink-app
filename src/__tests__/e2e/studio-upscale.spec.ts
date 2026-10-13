import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Upscaler (Kezie, 2026-10-13). LIVE on a throwaway account: a picture 2x (10 credits, about
 * $0.05) from the post page, and a 5 s video to 1080p (60 credits, about $0.24) through the API,
 * each becoming a new Library post, charged once. Then the Editor's side panel: nothing may stick
 * out past its edge (the font list used to widen every field). Everything deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test studio-upscale
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const PICTURE = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/kasi-poster.jpg";
const VIDEO = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/oud-noir-push.mp4";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("upscale a picture and a video into new posts; the editor panel fits", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(600_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-upscale-${stamp}@blinkspot-test.dev`;
  const password = `Up-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Upscale Tester", onboarding_completed: true } });
  expect(error).toBeNull();
  let clientId: string | undefined;
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Upscale Tester", contact_name: "Upscale Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 200 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Upscale Test", is_active: true }).select("id").single();
    const { data: posts } = await sb.from("content").insert([
      { client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption: "E2E picture", image_urls: [PICTURE] },
      { client_id: clientId, brand_id: b!.id, content_type: "video", status: "draft", caption: "E2E video", video_urls: [VIDEO], image_urls: [] },
    ]).select("id, caption");
    const picture = posts!.find((p) => p.caption === "E2E picture")!;
    const video = posts!.find((p) => p.caption === "E2E video")!;
    const balance = async () => ((await sb.from("credit_balances").select("balance").eq("client_id", clientId!).single()).data?.balance as number);

    await signIn(page, email, password);
    // 1. A picture, from the post page.
    await page.goto(`${BASE}/studio/library/${picture.id}`);
    await page.getByRole("button", { name: "Upscale", exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByRole("dialog", { name: "Upscale" });
    await expect(dialog.getByRole("button", { name: "Upscale 2×" })).toContainText("10 cr", { timeout: 20_000 });
    await dialog.getByRole("button", { name: "Upscale 2×" }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/studio/library/") && !url.pathname.endsWith(picture.id), { timeout: 180_000 });
    const newPicture = page.url().split("/").pop()!;
    const { data: up } = await sb.from("content").select("image_urls, caption, ai_model").eq("id", newPicture).single();
    expect(up!.caption).toMatch(/^Upscaled 2×/);
    const file = await fetch((up!.image_urls as string[])[0]);
    expect(file.ok).toBe(true);
    expect(Number(file.headers.get("content-length"))).toBeGreaterThan(300_000); // the 193 KB original, bigger
    expect(await balance()).toBe(190);
    await page.screenshot({ path: "test-results/upscale-picture.png" });

    // 2. A video, through the API (the same call the button makes), then its progress.
    const start = await page.request.post(`${BASE}/api/upscale`, { data: { contentId: video.id, target: "1080p" }, timeout: 120_000 });
    const job = await start.json();
    expect(start.status(), JSON.stringify(job)).toBe(200);
    expect(job.credits).toBe(60);
    await expect.poll(async () => (await (await page.request.get(`${BASE}/api/upscale?job=${job.id}`)).json()).state, { timeout: 360_000, intervals: [5000] }).toBe("done");
    const done = await (await page.request.get(`${BASE}/api/upscale?job=${job.id}`)).json();
    const { data: vrow } = await sb.from("content").select("video_urls, caption").eq("id", done.contentId).single();
    expect(vrow!.caption).toMatch(/^Upscaled to 1080p/);
    expect((await fetch((vrow!.video_urls as string[])[0], { method: "HEAD" })).ok).toBe(true);
    expect(await balance()).toBe(130);
    const { data: ledger } = await sb.from("credit_transactions").select("amount").eq("client_id", clientId!).lt("amount", 0);
    expect((ledger ?? []).map((r) => r.amount as number).sort((a, b) => a - b)).toEqual([-60, -10]);

    // 3. The Editor's side panel fits inside itself with a text layer selected.
    await page.goto(`${BASE}/studio/image?mode=design&content=${picture.id}`);
    await expect(page.getByLabel("Layer name").first()).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("t");
    const canvasBox = (await page.locator("canvas").last().boundingBox())!;
    await page.mouse.click(canvasBox.x + 80, canvasBox.y + 80);
    await expect(page.getByRole("combobox", { name: "Font", exact: true })).toBeVisible({ timeout: 10_000 });
    const sticking = await page.evaluate(() => {
      const aside = [...document.querySelectorAll("aside")].find((a) => a.querySelector('[aria-label="Font"]'))!;
      const edge = aside.getBoundingClientRect().right + 1;
      return [...aside.querySelectorAll("input, select, button, label")].filter((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.right > edge;
      }).map((el) => (el as HTMLElement).getAttribute("aria-label") || (el as HTMLElement).innerText?.slice(0, 20) || el.tagName);
    });
    await page.screenshot({ path: "test-results/editor-panel.png" });
    expect(sticking).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if (clientId) {
      await sb.from("upscale_jobs").delete().eq("client_id", clientId);
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
