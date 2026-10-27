import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The magic cutter, smarter (Kezie, 2026-10-27: no feedback while it worked, and it "just cuts videos
 * and starts them again randomly... you cut pauses, you cut awkward stares... remove repetition").
 * A talking clip made with the Mac's own voice, full of ums, a hmm, a stutter, a restarted sentence
 * and long stares, is cleaned up (LIVE: Whisper word by word, then Claude), then edited like a
 * five-shot inspiration. Checks: the steps show while it works, the fillers and stares are gone,
 * every cut is between words, nothing plays twice. macOS only (say). Throwaway account with credits,
 * its uploads and rows deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test editor-cleanup --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
test.use({ channel: "chrome" });

type Clip = { trimStart: number; trimEnd: number; timelineStart: number };
const SAID = "Hi, I'm Kezie from Nuf Farms. [[slnc 1600]] Um, so, uh, today I want to... [[slnc 700]] today I want to show you our new maize field. [[slnc 2200]] Hmm. [[slnc 600]] We grow, we grow everything without chemicals. [[slnc 1400]] Uh, come and visit us this weekend.";

function media(dir: string) {
  const ff = (...a: string[]) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...a]);
  execFileSync("say", ["-o", path.join(dir, "talk.aiff"), SAID]);
  ff("-f", "lavfi", "-i", "testsrc2=s=540x960:r=30", "-i", path.join(dir, "talk.aiff"), "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", path.join(dir, "talk.mp4"));
  ff("-f", "lavfi", "-i", "testsrc2=s=540x960:r=30:d=1.2", "-f", "lavfi", "-i", "smptebars=s=540x960:r=30:d=0.8", "-f", "lavfi", "-i", "mandelbrot=s=540x960:r=30,trim=duration=1.5", "-f", "lavfi", "-i", "rgbtestsrc=s=540x960:r=30:d=0.9", "-f", "lavfi", "-i", "testsrc=s=540x960:r=30:d=1.1",
    "-filter_complex", "[0][1][2][3][4]concat=n=5:v=1:a=0,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-movflags", "+faststart", path.join(dir, "inspo.mp4"));
}

type Word = { word: string; start: number; end: number };
const FILLER = /^(u+h+m*|u+m+|e+r+m*|a+h+|h+m+|m+)$/i;
const bare = (w: string) => w.toLowerCase().replace(/[^a-z']/g, "");

/** The editor's timeline as it saved it (IndexedDB, a second after each change). */
async function timeline(page: Page, brandId: string) {
  await page.waitForTimeout(1600);
  return page.evaluate((key) => new Promise<{ videoClips: Array<Clip & { trackRow?: number }>; textLayers: Array<{ text: string; style?: string }> }>((resolve, reject) => {
    const req = indexedDB.open("blinkspot-drafts", 1);
    req.onerror = () => reject(new Error("no drafts db"));
    req.onsuccess = () => { const g = req.result.transaction("drafts", "readonly").objectStore("drafts").get(key); g.onsuccess = () => resolve(g.result.value); g.onerror = () => reject(new Error("no draft")); };
  }), `videoEditor:${brandId}`);
}

/** Every kept word whole inside one piece; no filler or long stare inside any. */
function checkCuts(pieces: Clip[], words: Word[], drop: Set<number>) {
  const inside = (t: number) => pieces.some((p) => t > p.trimStart + 0.005 && t < p.trimEnd - 0.005);
  const kept = words.filter((_, i) => !drop.has(i));
  for (const w of kept) expect(pieces.some((p) => w.start >= p.trimStart - 0.02 && w.end <= p.trimEnd + 0.02), `"${w.word}" ${w.start}-${w.end} is whole`).toBe(true);
  for (const w of words.filter((x) => FILLER.test(bare(x.word)))) expect(inside((w.start + w.end) / 2), `"${w.word}" at ${w.start} is cut`).toBe(false);
  for (let i = 1; i < kept.length; i++) if (kept[i].start - kept[i - 1].end > 1) expect(inside((kept[i - 1].end + kept[i].start) / 2), `the ${(kept[i].start - kept[i - 1].end).toFixed(1)} s stare after "${kept[i - 1].word}" is cut`).toBe(false);
  const sorted = [...pieces].sort((x, y) => x.trimStart - y.trimStart);
  for (let i = 1; i < sorted.length; i++) expect(sorted[i].trimStart, "nothing plays twice").toBeGreaterThanOrEqual(sorted[i - 1].trimEnd - 0.01);
}

test("clean up the talking, then edit it like a video you love", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY || process.platform !== "darwin", "needs the service key and macOS say");
  test.setTimeout(600_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const t0 = Date.now();
  const step = (what: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${what}`);
  page.setDefaultTimeout(90_000);
  page.setDefaultNavigationTimeout(90_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-"));
  media(dir);
  step("media made");
  const email = `e2e-cleanup-${stamp}@blinkspot-test.dev`;
  const password = `Cu-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Cleanup Test", onboarding_completed: true } });
  let clientId = "";
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  // The first clean-up's words (seconds of the uploaded clip, which starts at 0).
  let heard: { words: Word[]; drop: Set<number> } | null = null;
  page.on("response", async (r) => {
    if (!r.url().includes("/api/editor/highlights") || heard) return;
    const j = await r.json().catch(() => null) as { words?: Word[]; drop?: number[]; error?: string; note?: string } | null;
    console.log("highlights", r.status(), j?.error ?? j?.note ?? `${j?.words?.length ?? "?"} words`);
    if (j?.words) heard = { words: j.words, drop: new Set(j.drop ?? []) };
  });
  // Every toast, as it appears (they're gone by the time a failure is reported).
  await page.exposeFunction("__toast", (t: string) => console.log("toast:", t.slice(0, 200)));
  await page.addInitScript(() => {
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n instanceof HTMLElement && n.matches?.("[data-sonner-toast]")) (window as unknown as { __toast: (t: string) => void }).__toast(n.innerText); }).observe(document, { childList: true, subtree: true });
  });
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Nuf Farms Test", contact_name: "Cleanup Test", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 60 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Nuf Farms", industry: "Farming", description: "A family farm in Kenya growing maize without chemicals.", is_active: true }).select("*").single();
    await page.addInitScript((brand) => { localStorage.setItem("blink-active-brand", JSON.stringify({ state: { activeBrand: brand }, version: 0 })); localStorage.setItem("blink.tourDone", "1"); }, b);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/video?tab=editor`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".ve")).toBeVisible({ timeout: 60_000 });
    step("editor open");
    await page.locator('.ve-bin input[type="file"]').first().setInputFiles(path.join(dir, "talk.mp4"));
    await expect(page.locator(".ve-clip.video")).toHaveCount(1, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    step("clip on the timeline");

    // 1. Clean up the talking: the step shows while it works.
    await page.getByRole("navigation", { name: "Editor tools" }).getByRole("button", { name: "AI" }).click();
    await page.getByRole("button", { name: /Clean it up/ }).click();
    const progress = page.getByRole("status", { name: "AI progress" });
    await expect(progress).toContainText(/Getting the sound ready|Listening to every word/, { timeout: 15_000 });
    await page.screenshot({ path: "test-results/cleanup-progress.png" });
    step("clean-up running");
    await expect(page.getByText(/^Cleaned up: \d+ ums, repeats and false starts out/)).toBeVisible({ timeout: 240_000 });
    expect(heard).not.toBeNull();
    const { words, drop } = heard!;
    console.log("heard", words.map((w, i) => `${drop.has(i) ? "~~" : ""}${w.word}${drop.has(i) ? "~~" : ""}`).join(" "));
    let tl = await timeline(page, b!.id as string);
    const cleaned = tl.videoClips.filter((x) => (x.trackRow ?? 0) === 0);
    const kept = cleaned.reduce((n, p) => n + p.trimEnd - p.trimStart, 0);
    console.log("cleaned", cleaned.length, "pieces,", kept.toFixed(1), "of 18.7 s:", cleaned.map((p) => `${p.trimStart.toFixed(2)}-${p.trimEnd.toFixed(2)}`).join(" "));
    expect(cleaned.length).toBeGreaterThanOrEqual(3);
    expect(kept).toBeLessThan(18.7 * 0.8);
    checkCuts(cleaned, words, drop);
    // Captions from the words it kept: the message is there, the ums aren't.
    await page.getByRole("button", { name: /Add captions from the words/ }).click();
    tl = await timeline(page, b!.id as string);
    const captions = tl.textLayers.filter((x) => x.style === "caption").map((x) => x.text).join(" ").toLowerCase();
    console.log("captions:", captions);
    expect(captions).toContain("maize");
    expect(captions).toContain("weekend");
    expect(captions.split(/[^a-z']+/).filter((w) => FILLER.test(w))).toEqual([]);
    await page.screenshot({ path: "test-results/cleanup-done.png" });

    // 2. Edit it like a video you love (five shots): steps 1 to 3 show, cuts land between words.
    await page.locator('input[aria-label="Video to copy the editing of"]').setInputFiles(path.join(dir, "inspo.mp4"));
    await expect(progress).toContainText(/Step 1 of 3 · Reading its cuts/, { timeout: 30_000 });
    await expect(progress).toContainText(/Step [23] of 3/, { timeout: 120_000 });
    await expect(page.getByText(/^Edited like the inspo: \d+ cuts/)).toBeVisible({ timeout: 300_000 });
    const edited = (await timeline(page, b!.id as string)).videoClips.filter((x) => (x.trackRow ?? 0) === 0);
    console.log("edited", edited.length, "pieces:", edited.map((p) => `${p.trimStart.toFixed(2)}-${p.trimEnd.toFixed(2)}`).join(" "));
    expect(edited.length).toBeGreaterThanOrEqual(3);
    // The cleaned clip is what was cut: the second hearing is of the cleaned pieces, so check against the first.
    checkCuts(edited, words, drop);
    await page.screenshot({ path: "test-results/cleanup-edited.png" });
    expect(errors).toEqual([]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    if (clientId) {
      const { data: files } = await sb.storage.from("assets").list(`edits/${clientId}`, { limit: 100 });
      if (files?.length) await sb.storage.from("assets").remove(files.map((f) => `edits/${clientId}/${f.name}`));
      await sb.from("credit_transactions").delete().eq("client_id", clientId).then(() => {}, () => {});
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
