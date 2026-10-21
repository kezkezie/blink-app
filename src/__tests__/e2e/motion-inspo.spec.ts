import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";

/**
 * Motion Inspo (Kezie, 2026-10-21: "copy the inspiration motion graphics video, create similar
 * things in the brand, keep placeholders for images"). Throwaway account with a copy of a real
 * brand kit and three of its pictures; a reference motion video is read shot by shot, planned into
 * the motion kit and rendered. The reference isn't in the repo (it's someone else's video):
 *   MOTION_INSPO_VIDEO=/path/to/reference.mp4 PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test motion-inspo --workers=1
 * Writes test-results/motion-inspo.json (the plan) and motion-inspo.mp4/webm (the render).
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const VIDEO = process.env.MOTION_INSPO_VIDEO;
const PICS = [
  ["Harvested Today: button mushrooms in a wooden crate", "https://res.cloudinary.com/dap8jijxa/image/upload/v1792097392/blinkspot/image%20content/hocbqxnjsuti7f44conk.jpg"],
  ["Inside the Container: picking mushrooms from the racks", "https://res.cloudinary.com/dap8jijxa/image/upload/v1792003215/blinkspot/image%20content/bea1jrbtrcyqaohzqyng.jpg"],
  ["Weekly Availability: oyster mushrooms, KSh 400/kg", "https://res.cloudinary.com/dap8jijxa/image/upload/v1791977949/blinkspot/image%20content/pr7rjvn5gfvrftyqarwl.jpg"],
] as const;

// Real Chrome: Playwright's own Chromium can't decode H.264, so an MP4 reads as blank frames there.
test.use({ channel: "chrome" });

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("a motion video is copied beat for beat into the brand, and renders", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY || !VIDEO || !fs.existsSync(VIDEO), "needs the service key and MOTION_INSPO_VIDEO");
  test.setTimeout(600_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-minspo-${stamp}@blinkspot-test.dev`;
  const password = `Mi-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Inspo Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Inspo Tester", contact_name: "Inspo Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    const { data: b } = await sb.from("brand_profiles").insert({
      client_id: clientId, brand_name: "NUF FARMS", is_active: true, industry: "Agriculture", primary_color: "#1F1D1B", secondary_color: "#9C9A96", primary_font: "Archivo",
      logo_url: "https://res.cloudinary.com/dap8jijxa/image/upload/v1791190128/odfr6x8bnl4oy9hmrjtm.png", website_url: "https://nuffarms.com",
      description: "Container mushroom farm in Kiambu growing fresh button mushrooms.", brand_voice: "Plain, specific and quantified. A supplier talking to a chef, not a lifestyle brand talking to a shopper.",
    }).select("id").single();
    for (const [caption, url] of PICS) await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption, image_urls: [url] });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, email, password);

    await page.goto(`${BASE}/studio/motion`);
    await expect(page.getByText("for NUF FARMS")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("tab", { name: /9:16/ }).click();
    await expect(page.getByLabel("Motion video to copy")).toBeEnabled();
    const planned = page.waitForResponse((r) => r.url().includes("/api/inspo/video") && r.request().method() === "POST", { timeout: 300_000 });
    await page.getByLabel("Motion video to copy").setInputFiles(VIDEO!);
    await expect(page.getByText(/Reading its shots|Making it for/)).toBeVisible({ timeout: 30_000 });
    const res = await planned;
    const body = await res.json();
    fs.writeFileSync("test-results/motion-inspo.json", JSON.stringify(body, null, 2));
    expect(res.status(), JSON.stringify(body).slice(0, 300)).toBe(200);
    const scenes = body.spec.scenes as Array<{ template: string; lines?: Array<{ text: string }>; picture?: string; placeholder?: string }>;
    console.log(`concept: ${body.concept}\ncredits: ${body.credits}\n${scenes.map((s, i) => `${i + 1}. ${s.template} ${s.lines?.map((l) => l.text).join(" / ") ?? ""} ${s.picture ? "[picture]" : s.placeholder ? `[placeholder: ${s.placeholder}]` : ""}`).join("\n")}`);
    expect(scenes.length).toBeGreaterThanOrEqual(3);
    expect(scenes.some((s) => s.template === "story")).toBe(true);
    // The brand's colours, never the reference's blue.
    const bluish = (hex: string) => { const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return bl > r + 60 && bl > g + 20; };
    console.log(`palette: ${JSON.stringify(body.spec.palette)}`);
    expect(bluish(body.spec.palette.accent)).toBe(false);
    const studio = page.getByRole("dialog", { name: "Motion", exact: true });
    await expect(studio.getByRole("button", { name: /Make it/ })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-results/motion-inspo-studio.png" });

    // Render it (free) and keep the file to look at.
    await studio.getByRole("button", { name: /Make it/ }).click();
    await expect(studio).toBeHidden({ timeout: 400_000 });
    const { data: made } = await sb.from("content").select("video_urls").eq("client_id", clientId).eq("ai_model", "remotion").single();
    const url = (made!.video_urls as string[])[0];
    const file = await fetch(url).then((r) => r.arrayBuffer());
    fs.writeFileSync(`test-results/motion-inspo.${url.endsWith(".webm") ? "webm" : "mp4"}`, Buffer.from(file));
    console.log(`rendered: ${url} (${file.byteLength} bytes)`);
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

/** The plan Claude made from the reference on 2026-10-21, kept so the drawing can be checked without a new reading. */
const PLAN = {"kind": "full", "shape": "9:16", "palette": {"background": "#FFFFFF", "text": "#1F1D1B", "accent": "#1F1D1B", "second": "#9C9A96"}, "scenes": [{"template": "story", "seconds": 2, "lines": [{"text": "Fresh", "size": "m", "accent": false, "align": "left"}, {"text": "mushrooms", "size": "xl", "accent": true, "align": "center"}], "place": "top", "backdrop": "dots", "picture": "https://res.cloudinary.com/dap8jijxa/image/upload/v1792097392/blinkspot/image%20content/hocbqxnjsuti7f44conk.jpg", "frame": "none", "enter": "pop"}, {"template": "story", "seconds": 3.3, "lines": [{"text": "Picked this morning", "size": "m", "accent": false, "align": "left"}, {"text": "On your table", "size": "l", "accent": true, "align": "right"}], "place": "center", "backdrop": "plain", "picture": "https://res.cloudinary.com/dap8jijxa/image/upload/v1792003215/blinkspot/image%20content/bea1jrbtrcyqaohzqyng.jpg", "frame": "card", "enter": "rise"}, {"template": "story", "seconds": 4.7, "lines": [{"text": "grown with care", "size": "m", "accent": false, "align": "left"}, {"text": "in our container", "size": "m", "accent": false, "align": "right"}], "place": "center", "backdrop": "dots", "frame": "circle", "enter": "blur"}, {"template": "story", "seconds": 3, "lines": [], "place": "center", "backdrop": "sunrise", "picture": "https://res.cloudinary.com/dap8jijxa/image/upload/v1791977949/blinkspot/image%20content/pr7rjvn5gfvrftyqarwl.jpg", "frame": "circle", "enter": "pop"}, {"template": "story", "seconds": 7, "lines": [{"text": "Oyster", "size": "s", "accent": false, "align": "left"}, {"text": "mushrooms", "size": "xl", "accent": true, "align": "center"}, {"text": "KSh 400/kg", "size": "l", "accent": true, "align": "right"}, {"text": "fresh every week", "size": "s", "accent": false, "align": "left"}, {"text": "nuffarms.com", "size": "m", "accent": false, "align": "center"}], "place": "bottom", "backdrop": "sunrise", "frame": "circle", "enter": "blur"}]};
const PLAN_PICTURES = [{"url": "https://res.cloudinary.com/dap8jijxa/image/upload/v1791977949/blinkspot/image%20content/pr7rjvn5gfvrftyqarwl.jpg", "title": "Weekly Availability: oyster mushrooms, KSh 400/kg"}, {"url": "https://res.cloudinary.com/dap8jijxa/image/upload/v1792003215/blinkspot/image%20content/bea1jrbtrcyqaohzqyng.jpg", "title": "Inside the Container: picking mushrooms from the racks"}, {"url": "https://res.cloudinary.com/dap8jijxa/image/upload/v1792097392/blinkspot/image%20content/hocbqxnjsuti7f44conk.jpg", "title": "Harvested Today: button mushrooms in a wooden crate"}];

test("a plan handed over from Video Inspo opens in the studio and renders", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(400_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-mhand-${stamp}@blinkspot-test.dev`;
  const password = `Mh-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Handoff Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Handoff Tester", contact_name: "Handoff Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "NUF FARMS", is_active: true, primary_color: "#1F1D1B", secondary_color: "#9C9A96", primary_font: "Archivo" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, email, password);
    await page.evaluate(([spec, pictures]) => sessionStorage.setItem("blink-motion-inspo-plan", JSON.stringify({ spec, pictures, concept: "Copied from a motion quote", at: Date.now() })), [PLAN, PLAN_PICTURES] as const);
    await page.goto(`${BASE}/studio/motion?from=inspo`);
    const studio = page.getByRole("dialog", { name: "Motion", exact: true });
    await expect(studio.getByRole("button", { name: /Make it/ })).toBeVisible({ timeout: 60_000 });
    await expect(studio.getByText("Story card").first()).toBeVisible();
    // Handed over once: a reload doesn't reopen it.
    expect(await page.evaluate(() => sessionStorage.getItem("blink-motion-inspo-plan"))).toBeNull();
    await studio.getByRole("button", { name: /Make it/ }).click();
    await expect(studio).toBeHidden({ timeout: 300_000 });
    const { data: made } = await sb.from("content").select("video_urls").eq("client_id", clientId).eq("ai_model", "remotion").single();
    const url = (made!.video_urls as string[])[0];
    const file = await fetch(url).then((r) => r.arrayBuffer());
    fs.writeFileSync(`test-results/motion-handoff.${url.endsWith(".webm") ? "webm" : "mp4"}`, Buffer.from(file));
    expect(errors.filter((e) => !/ResizeObserver/.test(e))).toEqual([]);
  } finally {
    if (clientId) {
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
