import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";

/**
 * Video Inspo (2026-10-12), LIVE (Claude with pictures, about 10-20 credits each):
 * 1. Drop a video with cuts, read it shot by shot, get the plan for the brand, send it to the
 *    Storyboard and see its scenes there (nothing is rendered).
 * 2. In the Editor, "Edit like a video you love" recuts two photos to the inspo's rhythm.
 * The inspo is VIDEO_INSPO_FIXTURE (a video with cuts) or an example clip.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 VIDEO_INSPO_FIXTURE=/path/cuts.mp4 npx playwright test studio-video-inspo
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EXAMPLE = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/mkate-story-1.mp4";

async function inspoVideo() {
  const p = process.env.VIDEO_INSPO_FIXTURE;
  if (p && fs.existsSync(p)) return { name: "inspo.mp4", mimeType: "video/mp4", buffer: fs.readFileSync(p), cuts: true };
  return { name: "inspo.mp4", mimeType: "video/mp4", buffer: Buffer.from(await (await fetch(EXAMPLE)).arrayBuffer()), cuts: false };
}
async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
}

test("Video Inspo: read a video, plan it for the brand, open it in the Storyboard", async ({ page }) => {
  test.skip(!email || !password, "needs E2E login");
  test.setTimeout(300_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`${BASE}/studio/video`);
  await page.getByRole("link", { name: /Seen a video you love\?/ }).click();
  await expect(page.getByRole("heading", { name: "Seen a video you love? Make it yours." })).toBeVisible({ timeout: 30_000 });
  const video = await inspoVideo();
  await page.locator('input[type="file"][accept="video/*"]').setInputFiles({ name: video.name, mimeType: video.mimeType, buffer: video.buffer });
  await page.getByLabel("What is it for").fill("Weekend special");
  const go = page.getByRole("button", { name: /^Remake it for/ });
  await expect(go).toBeEnabled({ timeout: 20_000 });
  await go.click();
  await expect(page.getByText("Why it works")).toBeVisible({ timeout: 200_000 });
  const summary = await page.getByText(/^\d+ shots · \d+ s · \d+ cr$/).innerText();
  const shots = Number(summary.split(" ")[0]);
  console.log(`VIDEO INSPO: ${summary} (fixture with cuts: ${video.cuts}); why: ${(await page.locator("li").filter({ hasText: /./ }).first().innerText()).slice(0, 120)}`);
  if (video.cuts) expect(shots).toBeGreaterThanOrEqual(4);
  const scenes = await page.getByText(/^Scene \d+ · /).count();
  expect(scenes).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/video-inspo-plan.png", fullPage: true });
  // One render per setup: the fixture alternates two photos, so a few scenes, not one per shot.
  if (video.cuts) expect(scenes).toBeLessThanOrEqual(4);
  await page.getByRole("button", { name: "Make it in the Storyboard" }).click();
  await expect(page.locator(".sb-card")).toHaveCount(scenes, { timeout: 30_000 });
  // The inspo is vertical, so the scenes are too.
  if (video.cuts) await expect(page.locator(".sb-card").first()).toContainText("9:16");
  await page.screenshot({ path: "test-results/video-inspo-storyboard.png" });

  // After rendering, "Cut like your inspo" cuts the scenes into its rhythm. Two Library photos stand in
  // for the rendered scenes here (no render is paid for).
  for (const p of ["**/api/workflows**", "**/api/video**", "**/api/assistant**"]) await page.route(p, (r) => r.abort());
  await page.goto(`${BASE}/studio/video?tab=editor`);
  await expect(page.locator(".ve")).toBeVisible({ timeout: 30_000 });
  const adds = page.locator(".ve-asset .add");
  await expect(adds.first()).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < Math.min(scenes, 3); i++) await adds.nth(i).click({ force: true });
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await expect(page.getByText("Cut like your inspo")).toBeVisible();
  await page.locator(".ve-card", { hasText: "Cut like your inspo" }).getByRole("button", { name: /^Cut it/ }).click();
  await expect(page.getByText(/Cut like ".+": \d+ shots/)).toBeVisible({ timeout: 10_000 });
  const pieces = await page.locator(".ve-clip.image, .ve-clip.video").count();
  console.log(`CUT LIKE INSPO: ${pieces} shots`);
  if (video.cuts) expect(pieces).toBeGreaterThanOrEqual(8);
  await page.screenshot({ path: "test-results/video-inspo-cut-like.png" });
  expect(errors).toEqual([]);
});

test("Editor: edit two photos like a video you love", async ({ page }) => {
  test.skip(!email || !password, "needs E2E login");
  test.setTimeout(300_000);
  const video = await inspoVideo();
  test.skip(!video.cuts, "needs a fixture video with cuts (VIDEO_INSPO_FIXTURE)");
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  for (const p of ["**/api/workflows**", "**/api/video**", "**/api/assistant**"]) await page.route(p, (r) => r.abort());
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`${BASE}/studio/video?tab=editor`);
  await expect(page.locator(".ve")).toBeVisible({ timeout: 30_000 });
  const adds = page.locator(".ve-asset .add");
  await expect(adds.first()).toBeVisible({ timeout: 30_000 });
  await adds.nth(0).click({ force: true });
  await adds.nth(1).click({ force: true });
  await expect(page.locator(".ve-clip.image, .ve-clip.video")).toHaveCount(2);
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await page.getByLabel("Video to copy the editing of").setInputFiles({ name: video.name, mimeType: video.mimeType, buffer: video.buffer });
  await expect(page.getByText(/Edited like the inspo: \d+ cuts/)).toBeVisible({ timeout: 200_000 });
  const cuts = await page.locator(".ve-clip.image, .ve-clip.video").count();
  console.log(`EDIT LIKE: ${cuts} pieces, ${await page.locator(".ve-clip.text").count()} text`);
  expect(cuts).toBeGreaterThanOrEqual(4);
  await page.screenshot({ path: "test-results/edit-like-video.png" });
  await page.getByRole("button", { name: "Undo the last AI change" }).click();
  await expect(page.locator(".ve-clip.image, .ve-clip.video")).toHaveCount(2);
  expect(errors).toEqual([]);
});
