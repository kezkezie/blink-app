import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The video editor in the studio look (2026-10-11).
 * 1 (free): add photos, a caption, a click-track song; cut to the beat; undo; split; 9:16 fill;
 *   export with ffmpeg in the browser; the export lands in the Library (cleaned up after).
 * 2 (LIVE, ~4 credits): captions on the lip-sync example (ffmpeg extracts the audio, Whisper
 *   transcribes it), and the shorts route answers with timestamped segments.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test studio-editor
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const LIPSYNC = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/mavuno-lipsync.mp4";
const VOICE = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/mavuno-lipsync-voice.mp3";
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** A 16-bit mono WAV with a click on every beat. */
function clickWav(bpm: number, seconds: number, sr = 22050) {
  const n = Math.round(seconds * sr);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let t = 0.1; t < seconds; t += 60 / bpm) {
    const s = Math.round(t * sr);
    for (let k = 0; k < 900 && s + k < n; k++) buf.writeInt16LE(Math.round(rnd() * Math.exp(-k / 150) * 28000), 44 + (s + k) * 2);
  }
  return buf;
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
}
async function openEditor(page: Page) {
  await page.goto(`${BASE}/studio/video?tab=editor`);
  await expect(page.locator(".ve")).toBeVisible({ timeout: 30_000 });
}

test("edit, cut to the beat, undo, split, 9:16 fill, export", async ({ page }) => {
  test.skip(!email || !password || !process.env.SUPABASE_SERVICE_ROLE_KEY, "needs E2E login and the service key");
  test.setTimeout(420_000);
  const started = new Date().toISOString();
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const dialogs: string[] = []; page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
  const ffLog: string[] = []; page.on("console", (m) => { if (m.text().includes("[FFmpeg]")) ffLog.push(m.text()); });
  for (const p of ["**/api/workflows**", "**/api/video**", "**/api/assistant**", "**/api/editor/**"]) await page.route(p, (r) => r.abort());
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await openEditor(page);

  // Two photos from the Library, a caption, and a song.
  const adds = page.locator(".ve-asset .add");
  await expect(adds.first()).toBeVisible({ timeout: 30_000 });
  await adds.nth(0).click({ force: true });
  await adds.nth(1).click({ force: true });
  await expect(page.locator(".ve-clip.image, .ve-clip.video")).toHaveCount(2);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: /^Caption/ }).click();
  await expect(page.locator(".ve-clip.text")).toHaveCount(1);
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await page.locator('.ve-bin input[type="file"]').setInputFiles({ name: "beat-120.wav", mimeType: "audio/wav", buffer: clickWav(120, 12) });
  await expect(page.locator(".ve-clip.audio")).toHaveCount(1);
  await expect(page.locator(".ve-wave i").first()).toBeVisible({ timeout: 20_000 });

  // Cut to the beat (every 2 beats at 120 BPM = a cut each second), then undo it.
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Every 2" }).click();
  await page.getByRole("button", { name: "15 s", exact: true }).click();
  await page.getByRole("button", { name: /^Cut it/ }).click();
  await expect(page.getByText(/cuts on the beat · 12\d BPM|cuts on the beat · 119 BPM/)).toBeVisible({ timeout: 30_000 });
  const cutCount = await page.locator(".ve-clip.image, .ve-clip.video").count();
  expect(cutCount).toBeGreaterThanOrEqual(9);
  await expect(page.getByText(/♪ \d+ beats/)).toBeVisible();
  await page.getByRole("button", { name: "Undo the last AI change" }).click();
  await expect(page.locator(".ve-clip.image, .ve-clip.video")).toHaveCount(2);
  await page.getByRole("button", { name: /^Cut it/ }).click();
  await expect(page.locator(".ve-clip.image, .ve-clip.video")).toHaveCount(cutCount, { timeout: 30_000 });

  // Split: playhead into the first clip, press S.
  const ruler = page.locator(".ve-ruler");
  const box = (await ruler.boundingBox())!;
  await page.mouse.click(box.x + 6, box.y + 10);
  await page.locator(".ve-stage").click({ position: { x: 20, y: 20 } }); // clear selection, keep focus off inputs
  const pps = await page.evaluate(() => { const r = document.querySelector(".ve-ruler span:nth-child(2)") as HTMLElement | null; return r ? parseFloat(r.style.left) : 20; });
  // The 2nd ruler mark is 5 s at this zoom, so pps/5 pixels per second; 0.55 s is mid-way into the first piece.
  await page.mouse.click(box.x + (pps / 5) * 0.55, box.y + 10);
  await page.keyboard.press("s");
  await expect(page.locator(".ve-clip.image, .ve-clip.video")).toHaveCount(cutCount + 1);

  // 9:16, fill, export.
  await page.getByRole("button", { name: "9:16" }).click();
  await page.getByRole("button", { name: "Fill", exact: true }).click();
  await page.screenshot({ path: "test-results/ve-beatcut.png" });
  const download = page.waitForEvent("download", { timeout: 300_000 }).catch(() => null);
  await page.getByRole("button", { name: /^Export/ }).click();
  const t0 = Date.now();
  await expect(page.getByText("Exported", { exact: true })).toBeVisible({ timeout: 300_000 }).catch((e) => { console.log("dialogs:", dialogs.join(" | "), "\nffmpeg tail:", ffLog.filter((l) => /rror|nvalid|fail|No such|matches no|not|Unable|Cannot/i.test(l)).slice(-20).join("\n")); throw e; });
  console.log(`export took ${Math.round((Date.now() - t0) / 1000)} s`);
  const file = await download;
  expect(file).not.toBeNull();
  await file!.saveAs(process.env.EXPORT_SAVE_PATH ?? "test-results/ve-export.mp4");

  const sb = db();
  const { data: rows } = await sb.from("content").select("id, video_urls, content_type, ai_model, created_at").eq("ai_model", "blink-wasm-editor").gte("created_at", started).order("created_at", { ascending: false }).limit(1);
  try {
    expect(rows?.length).toBe(1);
    expect(rows![0].content_type).toBe("reel");
  } finally {
    for (const r of rows ?? []) {
      const url = (r.video_urls as string[])[0];
      const path = url?.split("/object/public/assets/")[1];
      if (path) await sb.storage.from("assets").remove([decodeURIComponent(path)]);
      await sb.from("content").delete().eq("id", r.id);
    }
  }
  expect(errors).toEqual([]);
});

test("LIVE: captions from speech, and the shorts route", async ({ page }) => {
  test.skip(!email || !password || !process.env.SUPABASE_SERVICE_ROLE_KEY, "needs E2E login and the service key");
  test.setTimeout(300_000);
  const started = Date.now();
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await openEditor(page);
  const video = Buffer.from(await (await fetch(LIPSYNC)).arrayBuffer());
  await page.locator('.ve-bin input[type="file"]').setInputFiles({ name: "mavuno-lipsync.mp4", mimeType: "video/mp4", buffer: video });
  await expect(page.locator(".ve-clip.video")).toHaveCount(1);
  await page.waitForTimeout(1500); // the clip's real length loads from its metadata
  await page.getByRole("button", { name: "AI", exact: true }).click();
  const capBtn = page.getByRole("button", { name: /^Add captions/ });
  await expect(capBtn).toContainText(/\d+ cr/);
  await capBtn.click();
  await expect(page.getByText(/captions added · \d+ credits/)).toBeVisible({ timeout: 180_000 });
  expect(await page.locator(".ve-clip.text").count()).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/ve-captions.png" });

  // The shorts route on the voice track (uploaded to the account's own edits folder).
  const sb = db();
  const { data: u } = await sb.auth.admin.listUsers({ perPage: 200 });
  const user = u.users.find((x) => x.email === email)!;
  const { data: client } = await sb.from("clients").select("id").eq("user_id", user.id).single();
  const path = `edits/${client!.id}/e2e_voice_${started}.mp3`;
  await sb.storage.from("assets").upload(path, Buffer.from(await (await fetch(VOICE)).arrayBuffer()), { contentType: "audio/mpeg" });
  const audioUrl = sb.storage.from("assets").getPublicUrl(path).data.publicUrl;
  try {
    const res = await page.request.post(`${BASE}/api/editor/highlights`, { data: { mode: "highlights", audioUrl, seconds: 20, count: 1, target: 15 }, timeout: 200_000 });
    const body = await res.json();
    expect(res.status(), JSON.stringify(body)).toBe(200);
    expect(Array.isArray(body.segments) && body.segments.length).toBeTruthy();
    expect(Array.isArray(body.highlights)).toBe(true);
    console.log("shorts route:", JSON.stringify({ credits: body.credits, segments: body.segments.length, highlights: body.highlights, note: body.note }));
  } finally {
    // The test's voice file and the audio the captions step extracted.
    const { data: files } = await sb.storage.from("assets").list(`edits/${client!.id}`, { limit: 200 });
    const mine = (files ?? []).filter((f) => f.name.startsWith(`e2e_voice_${started}`) || (f.name.startsWith("clip_audio_") && Number(f.name.slice(11, 24)) >= started));
    if (mine.length) await sb.storage.from("assets").remove(mine.map((f) => `edits/${client!.id}/${f.name}`));
  }
});
