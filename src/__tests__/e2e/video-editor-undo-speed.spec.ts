import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Video editor: undo/redo shortcuts and slow-mo (Kezie, 2026-10-23: "a shortcut for undo, Command Z
 * on Mac, Control Z on Windows. Also, we need to have a slow-mo"). Real Chrome (Chromium can't play
 * H.264). Uploads a 5 s clip, adds a photo after it, splits and undoes/redoes with the keyboard,
 * sets 0.5x (the clip doubles, the next clip moves along), undoes that, then exports and checks the
 * file's length with ffprobe. The export is removed from the Library after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test video-editor-undo-speed --workers=1
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
test.use({ channel: "chrome" });
const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 4; i++) {
    await page.fill('input[type="email"]', email!); await page.fill('input[type="password"]', password!);
    await page.click('button[type="submit"]');
    if (await page.waitForURL(/\/(dashboard|studio)/, { timeout: 20_000, waitUntil: "commit" }).then(() => true, () => false)) return;
  }
  throw new Error("couldn't sign in");
}

test("undo/redo with the keyboard, and a slow-mo clip that exports at the right length", async ({ page }) => {
  test.skip(!email || !password || !process.env.SUPABASE_SERVICE_ROLE_KEY, "needs E2E login and the service key");
  test.setTimeout(420_000);
  const started = new Date().toISOString();
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  for (const p of ["**/api/workflows**", "**/api/video**", "**/api/assistant**", "**/api/editor/**"]) await page.route(p, (r) => r.abort());
  const clipFile = path.join(os.tmpdir(), `ve-clip-${Date.now()}.mp4`);
  fs.writeFileSync(clipFile, Buffer.from(await (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/examples/oud-noir-push.mp4`)).arrayBuffer()));
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto(`${BASE}/studio/video?tab=editor`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".ve")).toBeVisible({ timeout: 30_000 });
    const fresh = page.getByRole("button", { name: "Start fresh" });
    if (await fresh.isVisible({ timeout: 5000 }).catch(() => false)) await fresh.click();
    await expect(page.locator(".ve-clip")).toHaveCount(0, { timeout: 10_000 });

    const visual = page.locator(".ve-clip.image, .ve-clip.video");
    await page.locator('.ve-bin input[type="file"]').first().setInputFiles(clipFile);
    await expect(page.locator(".ve-clip.video")).toHaveCount(1, { timeout: 30_000 });
    await page.waitForTimeout(1500); // the clip's length comes from its metadata
    const adds = page.locator(".ve-asset .add");
    await adds.first().click({ force: true, timeout: 10_000 });
    await expect(visual).toHaveCount(2);
    // A Library video is guessed at 10 s until its real length loads: wait for every clip's file.
    await page.waitForFunction(() => [...document.querySelectorAll("video")].every((v) => (v as HTMLVideoElement).readyState >= 1), null, { timeout: 30_000 });
    await page.waitForTimeout(800);
    const pps = await page.evaluate(() => { const r = document.querySelector(".ve-ruler span:nth-child(2)") as HTMLElement | null; return r ? parseFloat(r.style.left) / 5 : 4; });
    const lengthOf = async (i: number) => ((await visual.nth(i).boundingBox({ timeout: 10_000 }))!.width) / pps;
    const realSecond = await lengthOf(1);

    // Split at about 1 s, then undo and redo it from the keyboard.
    const ruler = page.locator(".ve-ruler"), rb = (await ruler.boundingBox())!;
    await page.mouse.click(rb.x + pps * 1.2, rb.y + 10);
    await page.locator(".ve-stage").click({ position: { x: 20, y: 20 } });
    await page.keyboard.press("s");
    await expect(visual).toHaveCount(3);
    await page.keyboard.press(`${MOD}+z`); // straight after the edit, the way people do it
    await expect(visual).toHaveCount(2);
    await page.keyboard.press(`${MOD}+Shift+z`);
    await expect(visual).toHaveCount(3);
    await page.getByRole("button", { name: "Undo", exact: true }).click({ timeout: 10_000 }); // the toolbar button does the same
    await expect(visual).toHaveCount(2);
    // Undo and redo never bring back a guessed length.
    expect(Math.abs((await lengthOf(1)) - realSecond)).toBeLessThan(0.1);

    // Slow-mo: 0.5x doubles the uploaded clip and pushes the next one along. (Clips by position: the
    // Library item may be a photo or a video.)
    const video = visual.nth(0), photo = visual.nth(1);
    const before = (await video.boundingBox({ timeout: 10_000 }))!, photoBefore = (await photo.boundingBox({ timeout: 10_000 }))!;
    await video.click({ position: { x: Math.min(40, before.width / 2), y: before.height / 2 }, timeout: 10_000 });
    const speed = page.getByRole("group", { name: "Speed" });
    await expect(speed).toBeVisible({ timeout: 10_000 });
    await speed.getByRole("button", { name: "0.5×" }).click({ timeout: 10_000 });
    await expect(video.locator(".ve-speed")).toHaveText("0.5×");
    const after = (await video.boundingBox({ timeout: 10_000 }))!, photoAfter = (await photo.boundingBox({ timeout: 10_000 }))!;
    expect(after.width / before.width).toBeGreaterThan(1.9);
    expect(after.width / before.width).toBeLessThan(2.1);
    expect(photoAfter.x - photoBefore.x).toBeGreaterThan(before.width * 0.9);
    await page.screenshot({ path: "test-results/ve-slowmo.png" });
    await page.waitForTimeout(600);
    await page.keyboard.press(`${MOD}+z`);
    await expect(video.locator(".ve-speed")).toHaveCount(0);
    await page.keyboard.press(`${MOD}+Shift+z`);
    await expect(video.locator(".ve-speed")).toHaveText("0.5×");

    // Export: the file lasts as long as the timeline says (the slowed clip plus the next one).
    const total = await page.locator(".ve-top .mono").first().textContent();
    const [m, sec] = (total ?? "00:00.0").split(":").map(Number);
    const expected = m * 60 + sec;
    const download = page.waitForEvent("download", { timeout: 300_000 }).catch(() => null);
    await page.getByRole("button", { name: /^Export/ }).click();
    await expect(page.getByText("Exported", { exact: true })).toBeVisible({ timeout: 300_000 });
    const file = await download;
    const out = path.join(os.tmpdir(), `ve-slowmo-${Date.now()}.mp4`);
    await file!.saveAs(out);
    const got = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString().trim());
    console.log(`timeline ${expected.toFixed(1)} s, exported ${got.toFixed(2)} s`);
    expect(Math.abs(got - expected)).toBeLessThan(0.4);
    fs.copyFileSync(out, "test-results/ve-slowmo.mp4");
    expect(errors).toEqual([]);
  } finally {
    try { fs.unlinkSync(clipFile); } catch { /* ignore */ }
    const { data: rows } = await sb.from("content").select("id, video_urls").eq("ai_model", "blink-wasm-editor").gte("created_at", started);
    for (const r of rows ?? []) {
      const url = (r.video_urls as string[])?.[0];
      const p = url?.split("/object/public/assets/")[1];
      if (p) await sb.storage.from("assets").remove([decodeURIComponent(p)]);
      await sb.from("content").delete().eq("id", r.id);
    }
  }
});
