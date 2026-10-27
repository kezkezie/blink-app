import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Editor playback of uploaded phone footage (Kezie, 2026-10-27: "the video editor is skipping a lot of
 * footage while pressing play... especially when you upload a video from your local machine... iPad").
 * Two 12 s 1080p60 clips at 18 Mb/s with 5 s between keyframes (like phone video) are uploaded from
 * the computer and played with the CPU slowed 4x (standing in for the iPad). Every 50 ms it notes
 * where the playing video is: a skip is the picture jumping ahead of real time. Real Chrome (Chromium
 * can't play H.264); a throwaway account, deleted after; nothing is saved or spent.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test video-editor-playback --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const THROTTLE = Number(process.env.PB_THROTTLE ?? 4);
test.use({ channel: "chrome" });

/**
 * A Mac's video chip starts and seeks instantly even with the CPU slowed, so the iPad's media timing
 * is put in: a video takes 250 ms to get going after play(), and every jump stalls its picture for
 * 400 ms (long-keyframe phone footage in Safari). The element stays "playing" meanwhile, like Safari's.
 * PB_IPAD=0 turns it off.
 */
function ipadMedia(timing: { start: number; seek: number }) {
  const proto = HTMLMediaElement.prototype;
  const time = Object.getOwnPropertyDescriptor(proto, "currentTime")!;
  const rate = Object.getOwnPropertyDescriptor(proto, "playbackRate")!;
  const seeking = Object.getOwnPropertyDescriptor(proto, "seeking")!;
  const play = proto.play;
  const s = new WeakMap<HTMLMediaElement, { want: number; until: number; seek: boolean; timer?: ReturnType<typeof setTimeout> }>();
  const of = (el: HTMLMediaElement) => { let v = s.get(el); if (!v) { v = { want: rate.get!.call(el) as number, until: 0, seek: false }; s.set(el, v); } return v; };
  const stall = (el: HTMLMediaElement, ms: number, isSeek: boolean) => {
    const v = of(el);
    v.until = performance.now() + ms; v.seek = isSeek;
    rate.set!.call(el, 0);
    clearTimeout(v.timer);
    v.timer = setTimeout(() => { v.until = 0; v.seek = false; rate.set!.call(el, v.want); }, ms);
  };
  Object.defineProperty(proto, "playbackRate", { configurable: true, get() { return of(this).want; }, set(x: number) { const v = of(this); v.want = x; if (!v.until) rate.set!.call(this, x); } });
  Object.defineProperty(proto, "seeking", { configurable: true, get() { const v = of(this); return (v.until > 0 && v.seek) || (seeking.get!.call(this) as boolean); } });
  Object.defineProperty(proto, "currentTime", { configurable: true, get() { return time.get!.call(this); }, set(x: number) { time.set!.call(this, x); if (this instanceof HTMLVideoElement) stall(this, timing.seek, true); } });
  proto.play = function (this: HTMLMediaElement) { if (this.paused && this instanceof HTMLVideoElement) stall(this, timing.start, false); return play.call(this); };
}

type Sample = { wall: number; src: number | null; el: number };

function phoneClip(file: string, tone: number) {
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=60:duration=12", "-f", "lavfi", "-i", `sine=frequency=${tone}:duration=12`,
    "-c:v", "libx264", "-preset", "veryfast", "-b:v", "18M", "-g", "300", "-keyint_min", "300", "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", file]);
}

test("uploaded phone clips play through without skipping", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(300_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-playback-${stamp}@blinkspot-test.dev`;
  const password = `Pb-${Math.random().toString(36).slice(2)}-${stamp}`;
  const clips = [1, 2].map((i) => path.join(os.tmpdir(), `phone-${stamp}-${i}.mp4`));
  clips.forEach((f, i) => phoneClip(f, 300 * (i + 1)));
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Playback Test", onboarding_completed: true } });
  let clientId = "";
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  for (const p of ["**/api/workflows**", "**/api/video**", "**/api/assistant**", "**/api/editor/**"]) await page.route(p, (r) => r.abort());
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Playback Farm", contact_name: "Playback Test", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Playback Farm", industry: "Farming", description: "A farm.", is_active: true }).select("*").single();
    await page.addInitScript((brand) => { localStorage.setItem("blink-active-brand", JSON.stringify({ state: { activeBrand: brand }, version: 0 })); localStorage.setItem("blink.tourDone", "1"); }, b);
    if (process.env.PB_IPAD !== "0") await page.addInitScript(ipadMedia, { start: 250, seek: 400 });
    await page.setViewportSize({ width: 1366, height: 1024 }); // an iPad in landscape
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/video?tab=editor`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".ve")).toBeVisible({ timeout: 60_000 });

    await page.locator('.ve-bin input[type="file"]').first().setInputFiles(clips);
    await expect(page.locator(".ve-clip.video")).toHaveCount(2, { timeout: 30_000 });
    await page.waitForFunction(() => [...document.querySelectorAll(".ve-canvas video")].every((v) => (v as HTMLVideoElement).readyState >= 1), null, { timeout: 30_000 });
    await page.waitForTimeout(1500); // the clips take their real 12 s lengths

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
    await page.evaluate(() => {
      const w = window as unknown as { __pb: { samples: Sample[]; seeks: number } };
      w.__pb = { samples: [], seeks: 0 };
      const vids = [...document.querySelectorAll(".ve-canvas video")] as HTMLVideoElement[];
      vids.forEach((v) => v.addEventListener("seeking", () => { w.__pb.seeks++; }));
      const t0 = performance.now();
      const tick = () => {
        const playing = vids.find((v) => !v.paused);
        w.__pb.samples.push({ wall: (performance.now() - t0) / 1000, src: playing ? playing.currentTime : null, el: playing ? vids.indexOf(playing) : -1 });
        if (w.__pb.samples.length < 1500) setTimeout(tick, 50);
      };
      tick();
    });
    const started = Date.now();
    await page.locator("button.ve-play").click();
    await expect(page.locator("button.ve-play")).toHaveAttribute("aria-label", "Pause");
    await expect(page.locator("button.ve-play")).toHaveAttribute("aria-label", "Play", { timeout: 120_000 });
    const took = (Date.now() - started) / 1000;
    const { samples, seeks } = await page.evaluate(() => (window as unknown as { __pb: { samples: Sample[]; seeks: number } }).__pb);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    // Seen moving: footage that played at about real speed. Skips: the picture jumping further than
    // the time that passed. Still: the picture standing still while it's meant to play.
    let moving = 0, skips = 0, skipped = 0, still = 0;
    const seen = new Set<number>();
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], z = samples[i];
      if (z.src === null || a.src === null || a.el !== z.el) continue;
      seen.add(z.el);
      const moved = z.src - a.src, wall = z.wall - a.wall;
      if (moved > 0.005 && moved <= wall * 1.5 + 0.02) moving += moved;
      if (moved > wall * 1.5 + 0.1) { skips++; skipped += moved - wall; }
      if (moved < 0.005) still += wall;
    }
    const report = { throttle: THROTTLE, ipadTiming: process.env.PB_IPAD !== "0", took: +took.toFixed(1), footage: 24, seenMoving: +moving.toFixed(1), seeksWhilePlaying: seeks, skips, skippedSeconds: +skipped.toFixed(2), stillSeconds: +still.toFixed(2), clipsSeenPlaying: seen.size };
    console.log("playback", JSON.stringify(report));
    fs.writeFileSync(path.join("test-results", `playback-${stamp}.json`), JSON.stringify({ report, samples }, null, 1));
    expect(errors).toEqual([]);
    expect(seen.size).toBe(2);
    expect(skips).toBe(0);
    expect(seeks).toBeLessThanOrEqual(4);
    expect(moving).toBeGreaterThan(22.5); // of 24 s (the sampler misses a little at each cut)
    expect(still).toBeLessThan(1.5);
  } finally {
    clips.forEach((f) => fs.rmSync(f, { force: true }));
    if (clientId) {
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
