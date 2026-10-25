import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The video editor's AI tools not covered elsewhere (launch sweep, 2026-10-25). LIVE on the E2E
 * account, a few credits:
 * 1. Voiceover: a short script becomes a voice clip on the audio track (its Library item is deleted after).
 * 2. Ask BlinkSpot edits the timeline: "make the first clip 2 seconds" is proposed, applied (the clip
 *    gets shorter on the timeline), and undone again.
 * (Cut to the beat, captions, shorts, "edit like a video you love", undo and slow-mo, and motion
 * graphics have their own specs.)
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test editor-ai-live --workers=1
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const SCRIPT = "Fresh juice, pressed every morning. Order on WhatsApp.";

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 4; i++) {
    await page.fill('input[type="email"]', email!); await page.fill('input[type="password"]', password!);
    await page.click('button[type="submit"]');
    if (await page.waitForURL(/\/(studio|welcome|dashboard)/, { timeout: 20_000, waitUntil: "commit" }).then(() => true, () => false)) return;
  }
  throw new Error("couldn't sign in");
}

async function openEditorWithTwoPhotos(page: Page) {
  await page.goto(`${BASE}/studio/video?tab=editor`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".ve")).toBeVisible({ timeout: 60_000 });
  // Start from an empty timeline (a kept draft would add to it).
  const fresh = page.getByRole("button", { name: /Start fresh|New project|Clear/ });
  if (await fresh.first().isVisible().catch(() => false)) await fresh.first().click();
  const adds = page.locator(".ve-asset .add");
  await expect(adds.first()).toBeVisible({ timeout: 30_000 });
  await adds.nth(0).click({ force: true });
  await adds.nth(1).click({ force: true });
  await expect(page.locator(".ve-clip.image, .ve-clip.video").first()).toBeVisible({ timeout: 15_000 });
}

test.describe.configure({ mode: "serial" });

test("LIVE: voiceover onto the audio track", async ({ page }) => {
  test.skip(!email || !password, "needs E2E login");
  test.setTimeout(180_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await openEditorWithTwoPhotos(page);
  const audioBefore = await page.locator(".ve-clip.audio").count();
  // Voiceovers live with the music, under Audio.
  await page.locator(".ve-rail").getByRole("button", { name: "Audio" }).click();
  await page.getByLabel("Voiceover script").fill(SCRIPT);
  const make = page.locator(".ve-card").filter({ hasText: "Make a voiceover" }).getByRole("button", { name: /Make it/ });
  await make.click();
  await expect(page.getByText(/Voiceover on the audio track/)).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".ve-clip.audio")).toHaveCount(audioBefore + 1, { timeout: 15_000 });
  expect(errors).toEqual([]);
  // The E2E account is a real one: take the test's voiceover back out of its Library.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await sb.from("content").delete().eq("content_type", "generated_audio").like("caption", `Voiceover: ${SCRIPT.slice(0, 30)}%`).gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  }
});

test("LIVE: Ask BlinkSpot edits the timeline, and it can be undone", async ({ page }) => {
  test.skip(!email || !password, "needs E2E login");
  test.setTimeout(240_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await openEditorWithTwoPhotos(page);
  // The timeline's own summary ("2 clips · 0 text · 0 audio · 00:15.0") is the measure; pixels re-zoom.
  const summary = page.getByText(/\d+ clips? · \d+ text · \d+ audio · \d\d:\d\d\.\d/).first();
  const total = async () => { const m = /(\d\d):(\d\d\.\d)\s*$/.exec((await summary.textContent()) ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
  // A Library video starts at a guessed length until the file's real length arrives: wait for it to settle.
  let before = await total();
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(2500); const now = await total(); if (now === before && i >= 1) break; before = now; }
  console.log(`settled at ${before} s`);
  expect(before).toBeGreaterThan(3);
  await page.getByRole("button", { name: /Ask BlinkSpot/ }).first().click();
  const ask = page.getByRole("dialog", { name: "Ask BlinkSpot" });
  await ask.getByLabel("Message").fill("Make the first clip on the timeline exactly 2 seconds long. Change nothing else.");
  await ask.getByRole("button", { name: "Send" }).click();
  const apply = ask.locator(".act").getByRole("button").filter({ hasNotText: /Undo/ }).last();
  await expect(apply).toBeEnabled({ timeout: 150_000 });
  await apply.click();
  await expect(ask.getByText("APPLIED")).toBeVisible({ timeout: 15_000 });
  await expect.poll(total, { timeout: 10_000 }).toBeLessThan(before - 0.5);
  const after = await total();
  console.log(`timeline ${before} s -> ${after} s`);
  await ask.locator(".act").getByRole("button", { name: /Undo/ }).click();
  await expect.poll(total, { timeout: 10_000 }).toBeCloseTo(before, 1);
  expect(errors).toEqual([]);
});
