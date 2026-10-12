import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * LIVE sweep of every paid feature (Kezie, 2026-10-12: "test the features ... so by the time I've
 * given people to test it, they would see literally all our features working").
 * Real models, real credits on the E2E account (about 90 credits in all). Each step logs what it
 * charged. Only what it made is deleted at the end (tracked by id, so nothing else on the account
 * is touched; Cloudinary copies stay).
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test live-sweep
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EX = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples";

let sb: SupabaseClient;
let clientId = "";
let brandId = "";
let brandName = "";
const started = new Date().toISOString();
const made: { remix?: string; remixId?: string; nb2?: string; owned: string[]; rows: string[] } = { owned: [], rows: [] };
const report: string[] = [];

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
}
/** Credits taken (positive) since `since`, from the ledger. */
async function spentSince(since: string) {
  const { data } = await sb.from("credit_transactions").select("amount").eq("client_id", clientId).gte("created_at", since);
  return -(data ?? []).reduce((n, r) => n + (r.amount as number), 0);
}
/** Copy an example image into the account's own folder (the editor routes only take your own files). */
async function ownCopy(name: string) {
  const bytes = Buffer.from(await (await fetch(`${EX}/${name}`)).arrayBuffer());
  const path = `images/${clientId}/sweep_${Date.now()}_${name}`;
  const { error } = await sb.storage.from("assets").upload(path, bytes, { contentType: "image/jpeg" });
  if (error) throw error;
  made.owned.push(path);
  return sb.storage.from("assets").getPublicUrl(path).data.publicUrl;
}
async function post(req: APIRequestContext, path: string, data: unknown, timeout = 300_000) {
  const res = await req.post(`${BASE}${path}`, { data, timeout });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}
const log = (line: string) => { report.push(line); console.log(`SWEEP ${line}`); };

test.describe.serial("live sweep", () => {
  test.skip(!email || !password || !process.env.SUPABASE_SERVICE_ROLE_KEY, "needs E2E login and the service key");
  test.setTimeout(600_000);

  test.beforeAll(async () => {
    sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: u } = await sb.auth.admin.listUsers({ perPage: 200 });
    const user = u.users.find((x) => x.email === email)!;
    const { data: c } = await sb.from("clients").select("id, plan_tier").eq("user_id", user.id).single();
    clientId = c!.id;
    const { data: b } = await sb.from("brand_profiles").select("id, brand_name").eq("client_id", clientId).eq("is_active", true).order("created_at").limit(1).single();
    brandId = b!.id; brandName = b!.brand_name;
    const { data: bal } = await sb.from("credit_balances").select("balance").eq("client_id", clientId).single();
    log(`account plan ${c!.plan_tier}, brand "${brandName}", balance ${bal!.balance}`);
  });

  test("1. Inspo Remix (Fast) from the page", async ({ page }) => {
    const t0 = new Date().toISOString();
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.evaluate((id) => { try { const raw = localStorage.getItem("brand-storage"); if (raw) { const s = JSON.parse(raw); if (s?.state) { s.state.activeBrandId = id; localStorage.setItem("brand-storage", JSON.stringify(s)); } } } catch { /* the store picks a brand itself */ } }, brandId);
    await page.goto(`${BASE}/studio/image?mode=remix`);
    await expect(page.getByText("Seen a post you love? Make it yours.")).toBeVisible({ timeout: 30_000 });
    const bytes = Buffer.from(await (await fetch(`${EX}/inspo-source.jpg`)).arrayBuffer());
    await page.locator('input[type="file"][accept^="image/jpeg"]').setInputFiles({ name: "inspo.jpg", mimeType: "image/jpeg", buffer: bytes });
    await page.getByLabel(/What is it fo/).fill("Weekend offer: 20% off");
    await page.getByRole("button", { name: /^Fast/ }).click();
    const go = page.getByRole("button", { name: /^Remix for/ });
    await expect(go).toBeEnabled({ timeout: 20_000 });
    const t = Date.now();
    await go.click();
    await expect(page.getByRole("heading", { name: "Your remixes" })).toBeVisible({ timeout: 300_000 }).catch(async (e) => {
      const toast = await page.locator("[data-sonner-toast]").allInnerTexts();
      throw new Error(`no remix came back; toasts: ${toast.join(" | ")} (${e})`);
    });
    // The post is created before the render (n8n fills it), and carries the caption we typed.
    const { data: rows } = await sb.from("content").select("id, image_urls, ai_model").eq("client_id", clientId).eq("caption", "Weekend offer: 20% off").gte("created_at", t0).order("created_at", { ascending: false }).limit(1);
    made.remixId = rows?.[0]?.id; made.remix = (rows?.[0]?.image_urls as string[] | undefined)?.[0];
    if (made.remixId) made.rows.push(made.remixId);
    expect(made.remix).toMatch(/^https:\/\//);
    await page.screenshot({ path: "test-results/sweep-remix.png" });
    log(`1 Inspo Remix OK in ${Math.round((Date.now() - t) / 1000)} s, ${await spentSince(t0)} cr, model ${rows?.[0]?.ai_model}`);
  });

  test("2. Generate an image (Best, Nano Banana 2 at 4K)", async ({ page }) => {
    const t0 = new Date().toISOString();
    await login(page);
    const t = Date.now();
    const r = await post(page.request, "/api/workflows?path=blink-generate-images", {
      client_id: clientId, brand_id: brandId, mode: "standard", prompt: "A bright flat-lay of fresh breakfast on a wooden table",
      assembled_prompt: `A bright, appetising flat-lay of a fresh breakfast on a wooden table, natural morning light, for the brand "${brandName}". No text.`,
      reference_image_urls: [], kie_model: "nano-banana-2", imageEngine: "nb2", aspect_ratio: "1:1", style: "poster",
      strict_brand_alignment: true, numImages: 1, brand_name: brandName, is_sync: true,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const urls = Array.isArray(r.body.imageUrls) ? r.body.imageUrls : [r.body.imageUrls].filter(Boolean);
    expect(urls[0], JSON.stringify(r.body)).toMatch(/^https:\/\//);
    made.nb2 = urls[0];
    log(`2 Generate (NB2 4K) OK in ${Math.round((Date.now() - t) / 1000)} s, ${await spentSince(t0)} cr`);
  });

  test("3. X-ray: scan the remix, then change one thing", async ({ page }) => {
    test.skip(!made.remixId, "needs the remix");
    const t0 = new Date().toISOString();
    await login(page);
    const scan = await post(page.request, "/api/video/nano-banana", { mode: "scene_video_generator", video_mode: "xray_image", content_id: made.remixId });
    expect(scan.status, JSON.stringify(scan.body)).toBe(200);
    const schema = scan.body.schema as { objects: Array<Record<string, unknown>> };
    expect(schema?.objects?.length).toBeGreaterThan(0);
    const first = schema.objects[0];
    const field = ["color", "colour", "primary_color", "material", "text"].find((k) => typeof first[k] === "string") ?? "color";
    log(`3a X-ray scan OK: ${schema.objects.length} objects (first "${String(first.label ?? first.name ?? first.id)}"), ${await spentSince(t0)} cr`);
    const before = made.remix;
    const edited = { ...schema, objects: schema.objects.map((o, i) => (i === 0 ? { ...o, [field]: field === "text" ? "WEEKEND 20% OFF" : "deep emerald green" } : o)) };
    const t1 = new Date().toISOString();
    const apply = await post(page.request, "/api/video/nano-banana", { mode: "scene_video_generator", video_mode: "json_image_edit", content_id: made.remixId, json_schema: edited, replacements: {}, kie_model: "nano-banana-2" });
    expect(apply.status, JSON.stringify(apply.body)).toBe(200);
    // The edit lands on the post a little later.
    let after: string | undefined;
    for (let i = 0; i < 60 && (!after || after === before); i++) {
      await page.waitForTimeout(5000);
      const { data } = await sb.from("content").select("image_urls").eq("id", made.remixId!).single();
      const urls = data?.image_urls as string[] | undefined;
      after = urls?.find((u) => u !== before) ?? urls?.[0];
    }
    expect(after && after !== before, "the edited image never arrived").toBeTruthy();
    log(`3b X-ray apply OK, ${await spentSince(t1)} cr (should be 18)`);
  });

  test("4. Editor AI: remove background, swap a face, draw a vector", async ({ page }) => {
    await login(page);
    const photo = await ownCopy("kitenge-lookbook.jpg");
    const face = await ownCopy("mkate-story-1-frame.jpg");
    let t0 = new Date().toISOString();
    const bg = await post(page.request, "/api/editor/remove-bg", { url: photo });
    expect(bg.status, JSON.stringify(bg.body)).toBe(200);
    expect(bg.body.url).toMatch(/^https:\/\//);
    log(`4a Remove background OK, ${await spentSince(t0)} cr`);
    t0 = new Date().toISOString();
    const fs = await post(page.request, "/api/editor/face-swap", { url: photo, face });
    expect(fs.status, JSON.stringify(fs.body)).toBe(200);
    expect(fs.body.url).toMatch(/^https:\/\//);
    log(`4b Face swap OK, ${await spentSince(t0)} cr`);
    t0 = new Date().toISOString();
    const vec = await post(page.request, "/api/editor/vector", { prompt: "a simple coffee cup badge", brandId });
    expect(vec.status, JSON.stringify(vec.body)).toBe(200);
    expect(vec.body.svg).toMatch(/^<svg/i);
    log(`4c Vector OK, ${await spentSince(t0)} cr (metered, reported ${vec.body.credits})`);
  });

  test("5. Write a caption for a photo (1 cr)", async ({ page }) => {
    await login(page);
    const t0 = new Date().toISOString();
    const r = await post(page.request, "/api/content/analyze", { clientId, mediaUrl: made.nb2 ?? `${EX}/mavuno-poster.jpg`, mediaType: "image/jpeg", lengthPreference: "long", context: "Weekend breakfast special" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(String(r.body.caption_long ?? "")).not.toBe("");
    log(`5 Caption OK, ${await spentSince(t0)} cr: "${String(r.body.caption_short ?? r.body.caption_long).slice(0, 70)}"`);
  });

  test("6. Video: 4 s on Pruna from the remix", async ({ page }) => {
    test.skip(!made.remix, "needs the remix");
    await login(page);
    const t0 = new Date().toISOString();
    const { data: row } = await sb.from("content").insert({ client_id: clientId, brand_id: brandId, content_type: "reel", caption: "Sweep video", status: "draft", ai_model: "replicate:prunaai/p-video", generation_status_text: "Initializing AI Engine..." }).select("id").single();
    made.rows.push(row!.id);
    const t = Date.now();
    const r = await post(page.request, "/api/workflows?path=blink-generate-video-v1", {
      client_id: clientId, brand_id: brandId, post_id: row!.id, video_mode: "showcase", primary_image_url: made.remix,
      user_prompt: "Slow push-in, soft light moving across the poster", is_sequence: false, ai_model_override: "replicate:prunaai/p-video",
      strict_brand_alignment: true, aspect_ratio: "9:16", duration: "4", ai_enhance: false,
    }, 320_000);
    expect([200, 202].includes(r.status), JSON.stringify(r.body)).toBe(true);
    let video: string | undefined;
    let status = "";
    for (let i = 0; i < 96 && !video; i++) {
      await page.waitForTimeout(5000);
      const { data } = await sb.from("content").select("video_urls, generation_status_text, status").eq("id", row!.id).single();
      video = (data?.video_urls as string[] | undefined)?.[0];
      status = `${data?.status} / ${data?.generation_status_text}`;
      if (/fail|error|refund/i.test(status)) break;
    }
    expect(video, `no video; last state: ${status}`).toMatch(/^https:\/\//);
    log(`6 Video (Pruna 4 s) OK in ${Math.round((Date.now() - t) / 1000)} s, ${await spentSince(t0)} cr`);
  });

  test("7. Ask BlinkSpot answers (Balanced, then Thorough)", async ({ page }) => {
    await login(page);
    for (const effort of ["medium", "high"]) {
      const t0 = new Date().toISOString();
      const t = Date.now();
      const r = await post(page.request, "/api/assistant", { messages: [{ role: "user", text: "Give me three post ideas for this week, one line each." }], brandId, effort, page: "/studio" }, 280_000);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(String(r.body.reply ?? "").length).toBeGreaterThan(20);
      log(`7 Ask ${effort} OK in ${Math.round((Date.now() - t) / 1000)} s on ${r.body.model}, credits ${r.body.credits} (ledger ${await spentSince(t0)})`);
    }
  });

  test("8. Brand auto-fill (empty fields only, nothing saved)", async ({ page }) => {
    await login(page);
    const r = await post(page.request, "/api/brand/fill", { mode: "gaps", brandId });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(typeof r.body.fields).toBe("object");
    log(`8 Brand fill OK: ${Object.keys(r.body.fields ?? {}).length} fields suggested`);
  });

  test.afterAll(async () => {
    // Only what the sweep made (by id) and the photos it copied.
    for (const id of made.rows) await sb.from("content").delete().eq("id", id);
    if (made.owned.length) await sb.storage.from("assets").remove(made.owned);
    console.log(`\nSWEEP REPORT\n${report.join("\n")}\ncleaned ${made.rows.length} posts, ${made.owned.length} files; total spent ${await spentSince(started)} cr`);
  });
});
