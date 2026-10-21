import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Motion graphics end to end (Kezie, 2026-10-15: "straight through to clips on the timeline").
 * LIVE on a throwaway account: Claude plans an intro (4 credits), the Player previews it, it
 * renders in this browser and lands on the timeline and in the Library; a see-through lower third
 * goes over it at the playhead; the export lays the lower third over the intro (its accent shows
 * bottom-left while it's on screen, not after). Frames saved for a look. Everything deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test studio-motion --workers=1
 * (alone: rendering and ffmpeg run in the browser, and two heavy specs at once time out.)
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const ACCENT = "#E4572E";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

/** Share of pixels near a colour in a region of a video frame at a time (and the frame as a PNG). */
async function sample(page: Page, url: string, t: number, region: [number, number, number, number], hex: string) {
  return page.evaluate(async ({ url, t, region, hex }) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous"; v.muted = true; v.src = url;
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error("video")); });
    v.currentTime = t;
    await new Promise((r) => { v.onseeked = r; });
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext("2d")!;
    g.drawImage(v, 0, 0);
    const [x, y, w, h] = [region[0] * c.width, region[1] * c.height, region[2] * c.width, region[3] * c.height].map(Math.round);
    const d = g.getImageData(x, y, w, h).data;
    const [R, G, B] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    let near = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - R) + Math.abs(d[i + 1] - G) + Math.abs(d[i + 2] - B) < 90) near++;
    return { share: near / (d.length / 4), png: c.toDataURL("image/png"), size: [c.width, c.height] };
  }, { url, t, region, hex });
}


/** Wait for the studio to close after Add; if the app shows an error instead, fail with its words. */
async function addAndWait(page: Page, button: ReturnType<Page["getByRole"]>) {
  const studio = page.getByRole("dialog", { name: "Motion", exact: true });
  await button.click();
  const error = page.locator('[data-sonner-toast][data-type="error"]').first();
  const outcome = await Promise.race([
    studio.waitFor({ state: "hidden", timeout: 240_000 }).then(() => "added"),
    error.waitFor({ state: "visible", timeout: 240_000 }).then(async () => `error: ${await error.innerText()}`),
  ]);
  expect(outcome).toBe("added");
}

test("plan, preview, render to the timeline, overlay a lower third, export", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(900_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-motion-${stamp}@blinkspot-test.dev`;
  const password = `Mo-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Motion Tester", onboarding_completed: true } });
  expect(error).toBeNull();
  let clientId: string | undefined;
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  // DEBUG_FFMPEG=1 prints the export's ffmpeg lines about streams and decoders.
  if (process.env.DEBUG_MOTION) page.on("console", (m) => { if (m.type() === "error") console.log(`[browser ${m.type()}] ${m.text().slice(0, 300)}`); });
  if (process.env.DEBUG_FFMPEG) page.on("console", (m) => { const t = m.text(); if (/\[FFmpeg\].*(Stream #|libvpx|yuva|Unknown|rror|Input #|overlay|alpha)/i.test(t)) console.log(t.slice(0, 220)); });
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Motion Tester", contact_name: "Motion Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 100 }, { onConflict: "client_id" });
    await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", industry: "Sneakers", is_active: true, primary_color: ACCENT, secondary_color: "#14141A", primary_font: "Space Grotesk", website_url: "https://kasikicks.example" });
    const balance = async () => ((await sb.from("credit_balances").select("balance").eq("client_id", clientId!).single()).data?.balance as number);
    await signIn(page, email, password);

    // 1. Plan an intro in Motion (a window over the editor since 2026-10-21), 9:16.
    await page.goto(`${BASE}/studio/video?tab=editor`);
    await page.getByRole("group", { name: "Shape" }).getByRole("button", { name: "9:16" }).click({ timeout: 60_000 });
    const openMotion = () => page.getByRole("navigation", { name: "Editor tools" }).getByRole("button", { name: "Motion" }).click();
    await openMotion();
    await expect(page.getByRole("dialog", { name: "Motion graphics" })).toBeVisible();
    await page.getByLabel("What the motion is for").fill("A 9 second intro for our Drop 01 sneaker launch this Friday: the words Drop 01, then 200 pairs only, then an end card saying Shop the drop");
    await page.getByRole("button", { name: /Write it/ }).click();
    const studio = page.getByRole("dialog", { name: "Motion", exact: true });
    await expect(studio.getByRole("button", { name: /Add at the start/ })).toBeVisible({ timeout: 120_000 });
    expect(await balance()).toBe(96);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "test-results/motion-studio.png" });

    // 2. Render it onto the timeline (and the Library).
    await addAndWait(page, studio.getByRole("button", { name: /Add at the start/ }));
    const { data: intro } = await sb.from("content").select("id, caption, video_urls, creation_metadata").eq("client_id", clientId!).eq("ai_model", "remotion").single();
    const introUrl = (intro!.video_urls as string[])[0];
    expect(introUrl).toMatch(/\/videos\/.+\/motion_\d+\.(mp4|webm)$/);
    const introSeconds = (intro!.creation_metadata as { seconds: number }).seconds;
    console.log(`intro: ${intro!.caption} · ${introSeconds}s · ${introUrl}`);
    const f1 = await sample(page, introUrl, Math.min(2, introSeconds / 3), [0, 0, 1, 1], ACCENT);
    expect(f1.size).toEqual([1080, 1920]);
    fs.writeFileSync("test-results/motion-intro-frame.png", Buffer.from(f1.png.split(",")[1], "base64"));

    // 3. A see-through lower third over it, at the playhead (0 s). Adding closed the Motion window.
    await expect(page.getByRole("dialog", { name: "Motion graphics" })).toBeHidden();
    await openMotion();
    await page.getByRole("button", { name: "Lower third", exact: true }).click();
    await page.getByLabel("What the motion is for").fill("A lower third with the name Thandi Mokoena and the title Founder, Kasi Kicks");
    await page.getByRole("button", { name: /Write it/ }).click();
    await expect(studio.getByRole("button", { name: /Add over the video at the playhead/ })).toBeVisible({ timeout: 120_000 });
    await addAndWait(page, studio.getByRole("button", { name: /Add over the video at the playhead/ }));
    expect(await balance()).toBe(92);
    const { data: lower } = await sb.from("content").select("video_urls, creation_metadata").eq("client_id", clientId!).eq("ai_model", "remotion").neq("id", intro!.id).single();
    expect((lower!.creation_metadata as { kind: string }).kind).toBe("overlay");
    expect((lower!.video_urls as string[])[0]).toMatch(/\.webm$/);
    const lowerSpec = (lower!.creation_metadata as { spec: { palette: { accent: string }; scenes: Array<{ seconds: number }> } }).spec;
    await page.screenshot({ path: "test-results/motion-timeline.png" });

    // 4. Export: the lower third's accent shows bottom-left while it's on screen, not after.
    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByText("Exported", { exact: true })).toBeVisible({ timeout: 400_000 });
    const { data: exported } = await sb.from("content").select("video_urls").eq("client_id", clientId!).eq("content_type", "reel").order("created_at", { ascending: false }).limit(1).single();
    const out = (exported!.video_urls as string[])[0];
    const region: [number, number, number, number] = [0, 0.62, 0.55, 0.3];
    const during = await sample(page, out, 2.5, region, lowerSpec.palette.accent);
    const after = await sample(page, out, Math.min(introSeconds - 0.3, lowerSpec.scenes[0].seconds + 1.5), region, lowerSpec.palette.accent);
    fs.writeFileSync("test-results/motion-export-during.png", Buffer.from(during.png.split(",")[1], "base64"));
    fs.writeFileSync("test-results/motion-export-after.png", Buffer.from(after.png.split(",")[1], "base64"));
    console.log(`export ${out} · accent share during ${during.share.toFixed(4)} · after ${after.share.toFixed(4)}`);
    expect(during.share).toBeGreaterThan(after.share + 0.002);
    // And it's see-through: the intro's white words above the lower third still show in the export
    // (an opaque overlay painted everything around the bar black until the alpha was decoded).
    const band: [number, number, number, number] = [0, 0.15, 1, 0.47];
    const wordsDuring = await sample(page, out, 2.5, band, "#FFFFFF");
    const wordsIntro = await sample(page, introUrl, 2.5, band, "#FFFFFF");
    console.log(`white share above the lower third: export ${wordsDuring.share.toFixed(4)} · intro alone ${wordsIntro.share.toFixed(4)}`);
    expect(wordsIntro.share).toBeGreaterThan(0.005);
    expect(wordsDuring.share).toBeGreaterThan(wordsIntro.share * 0.7);
    expect(errors.filter((e) => !/ResizeObserver/.test(e))).toEqual([]);
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
