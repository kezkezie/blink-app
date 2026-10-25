import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import { stampBox } from "@/lib/stamp";

/**
 * The BlinkSpot stamp on a free account's work (Kezie, 2026-10-25). No AI calls: real test files go
 * through the real stamp paths on a throwaway free account.
 * - A picture whose first try finished but wasn't stamped (the function died) is held back as
 *   "Adding the BlinkSpot stamp" and stamped on the next status check.
 * - A finished video clip is stamped by /api/stamp (ffmpeg) before it is shown.
 * - A published website carries the "Made with BlinkSpot" badge; on a paid plan it doesn't (the
 *   plan is cached a minute per server, so that check comes last).
 * - The motion studio draws the stamp in the preview.
 * With STAMP_E2E_LIVE=1 it also makes one real picture (Z-Image on Kie, 1 credit) and checks it came back stamped.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test stamp-free --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const ffmpeg = ffmpegPath as unknown as string;

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 4; i++) {
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    if (await page.waitForURL(/\/(studio|welcome)/, { timeout: 20_000, waitUntil: "commit" }).then(() => true, () => false)) return;
  }
  throw new Error("couldn't sign in");
}

/** How far the stamp's spot is from plain grey (the test media are grey). */
async function stampSpot(file: Buffer) {
  const img = sharp(file);
  const { width = 0, height = 0 } = await img.metadata();
  // Inside the stamp's pill, where lib/stamp.ts puts it.
  const box = stampBox(width, height);
  const x = box.left + Math.round(box.width * 0.6), y = box.top + Math.round(box.height / 2);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return Math.max(Math.abs(data[i] - 128), Math.abs(data[i + 1] - 128), Math.abs(data[i + 2] - 128));
}

test("a free account's pictures, videos and websites carry the BlinkSpot stamp", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(process.env.STAMP_E2E_LIVE === "1" ? 420_000 : 240_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-stamp-${stamp}@blinkspot-test.dev`;
  const password = `St-${Math.random().toString(36).slice(2)}-${stamp}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-e2e-"));
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Stamp Test", onboarding_completed: true } });
  let clientId: string | undefined;
  const slug = `stamp-test-${stamp}`;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Stamp Test", contact_name: "Stamp Test", contact_email: email, plan_tier: "free", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 100 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Stamp Test", is_active: true, primary_color: "#2F5D3A", secondary_color: "#F4EBD9" }).select("id").single();
    const brandId = b!.id as string;
    const pub = (p: string) => sb.storage.from("assets").getPublicUrl(p).data.publicUrl;

    // Test media: a grey picture and a 3 s grey clip with sound.
    const picPath = `images/${clientId}/gen_test_${stamp}.png`;
    await sb.storage.from("assets").upload(picPath, await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#808080" } }).png().toBuffer(), { contentType: "image/png" });
    const clip = path.join(tmp, "clip.mp4");
    execFileSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=c=0x808080:s=720x1280:d=3:r=24", "-f", "lavfi", "-i", "sine=frequency=330:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip]);
    const clipPath = `videos/${clientId}/clip_test_${stamp}.mp4`;
    await sb.storage.from("assets").upload(clipPath, fs.readFileSync(clip), { contentType: "video/mp4" });

    // A finished first try that wasn't stamped, and a finished video scene.
    const old = new Date(Date.now() - 60_000).toISOString();
    const { data: rows } = await sb.from("content").insert([
      { client_id: clientId, brand_id: brandId, content_type: "post_image", status: "draft", image_urls: [pub(picPath)], generation_state: "generating", generation_attempt: 1, generation_started_at: old, updated_at: old, creation_metadata: { operation: "generate", stamp: true } },
      { client_id: clientId, brand_id: brandId, content_type: "video", status: "draft", video_urls: [pub(clipPath)], generation_state: "succeeded", creation_metadata: { operation: "video" } },
    ]).select("id");
    const [picId, vidId] = rows!.map((r) => r.id as string);

    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email, password);

    // The picture: held back while it's stamped, then shown stamped.
    const first = await (await page.request.get(`${BASE}/api/images?ids=${picId}`)).json();
    expect(first.jobs[0]).toMatchObject({ state: "making", text: "Adding the BlinkSpot stamp", url: null });
    let picUrl = "";
    await expect.poll(async () => { const j = await (await page.request.get(`${BASE}/api/images?ids=${picId}`)).json(); picUrl = j.jobs[0]?.url ?? ""; return j.jobs[0]?.state; }, { timeout: 60_000, intervals: [2000] }).toBe("done");
    console.log("step: picture done", picUrl);
    expect(picUrl).toMatch(/\/stamped_[^/]+\.png$/);
    const pic = Buffer.from(await (await page.request.get(picUrl, { timeout: 30_000 })).body());
    console.log("step: picture fetched", pic.length);
    expect((await sharp(pic).metadata()).width).toBe(1080);
    expect(await stampSpot(pic)).toBeGreaterThan(20);
    console.log("step: picture checked");

    // The video: "Adding the BlinkSpot stamp" until ffmpeg's copy is saved, then the stamped clip.
    const v1 = await (await page.request.get(`${BASE}/api/video-jobs?id=${vidId}`)).json();
    expect(v1.status).toMatchObject({ generationState: "generating", message: "Adding the BlinkSpot stamp" });
    expect(v1.video_urls).toEqual([]);
    let vidUrl = "";
    await expect.poll(async () => { const j = await (await page.request.get(`${BASE}/api/video-jobs?id=${vidId}`)).json(); vidUrl = j.video_urls?.[0] ?? ""; return j.status?.generationState; }, { timeout: 150_000, intervals: [3000] }).toBe("succeeded");
    expect(vidUrl).toMatch(/\/stamped_[^/]+\.mp4$/);
    const got = path.join(tmp, "stamped.mp4");
    fs.writeFileSync(got, await (await page.request.get(vidUrl, { timeout: 60_000 })).body());
    const info = (() => { try { execFileSync(ffmpeg, ["-hide_banner", "-i", got]); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? ""); } })();
    expect(info).toMatch(/720x1280/);
    expect(info).toMatch(/Audio: aac/);
    const frame = path.join(tmp, "frame.png");
    execFileSync(ffmpeg, ["-v", "error", "-ss", "2.5", "-i", got, "-frames:v", "1", frame]);
    expect(await stampSpot(fs.readFileSync(frame))).toBeGreaterThan(20);

    if (process.env.STAMP_E2E_LIVE === "1") {
      // One real picture through n8n: it comes back stamped.
      const made = await page.request.post(`${BASE}/api/images`, { data: { count: 1, caption: "Stamp test", request: { client_id: clientId, brand_id: brandId, prompt: "A glass of fresh mango juice on a wooden table, morning light", kie_model: "z-image", imageEngine: "z-image", aspect_ratio: "1:1" } } });
      const body = await made.json();
      console.log("live image start", made.status(), JSON.stringify(body).slice(0, 200));
      const id = body.ids?.[0];
      if (id) {
        let url = "";
        await expect.poll(async () => { const j = await (await page.request.get(`${BASE}/api/images?ids=${id}`)).json(); url = j.jobs[0]?.url ?? ""; return j.jobs[0]?.state; }, { timeout: 300_000, intervals: [5000] }).toBe("done");
        console.log("live image", url);
        expect(url).toMatch(/\/stamped_/);
      }
    }
    // The website: the badge on the free plan, none on a paid one.
    await sb.from("site_pages").insert({ client_id: clientId, brand_id: brandId, name: "Stamp test", html: "<!doctype html><html><head><title>t</title></head><body><h1>Hi</h1></body></html>", slug, published_at: new Date().toISOString() });
    const site = await (await page.request.get(`${BASE}/w/${slug}`)).text();
    expect(site).toContain("data-blink-badge");
    expect(site).toContain("Made with BlinkSpot");
    await sb.from("clients").update({ plan_tier: "starter" }).eq("id", clientId);
    await expect.poll(async () => (await (await page.request.get(`${BASE}/w/${slug}`)).text()).includes("data-blink-badge"), { timeout: 90_000, intervals: [5000] }).toBe(false);
    await sb.from("clients").update({ plan_tier: "free" }).eq("id", clientId);

    // Motion: the stamp is in the preview.
    const spec = { kind: "full", shape: "1:1", palette: { background: "#0B0B0C", text: "#FFFFFF", accent: "#2F5D3A" }, scenes: [{ template: "kinetic-headline", seconds: 3, words: "Fresh every morning", enter: "word" }] };
    await page.evaluate(([key, value]) => localStorage.setItem(key as string, JSON.stringify({ at: Date.now(), value })), [`kept:motion:${brandId}:spec`, spec]);
    await page.goto(`${BASE}/studio/motion`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Back to your motion" }).click({ timeout: 60_000 });
    await expect(page.getByRole("dialog", { name: "Motion", exact: true }).locator('.ms-frame img[src="/brand/stamp.png"]')).toBeVisible({ timeout: 30_000 });

    expect(errors).toEqual([]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (clientId) {
      for (const folder of [`images/${clientId}`, `videos/${clientId}`]) {
        const { data: files } = await sb.storage.from("assets").list(folder, { limit: 1000 });
        if (files?.length) await sb.storage.from("assets").remove(files.filter((f) => f.id).map((f) => `${folder}/${f.name}`));
      }
      await sb.from("site_pages").delete().eq("client_id", clientId);
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
