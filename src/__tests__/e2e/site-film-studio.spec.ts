import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Website studio inputs (Kezie, 2026-10-23): designs you like and a scroll film. Throwaway account.
 * Uploads a design picture and pastes a Pinterest picture link (Design A, B), uploads a 6 s video
 * that is cut into frames in the browser and saved to storage, and tries the scroll. With
 * SITE_E2E_WRITE=1 it also writes one real page (30 credits, a Claude call, 1 to 3 minutes) and
 * checks the film is on it and plays in the preview. Everything is deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 [SITE_E2E_WRITE=1] npx playwright test site-film-studio --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const PIN = "https://i.pinimg.com/736x/6c/fb/9d/6cfb9dd09c29038b455f06461f617a1c.jpg";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 4; i++) {
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    if (await page.waitForURL(/\/(studio|welcome)/, { timeout: 20_000, waitUntil: "commit" }).then(() => true, () => false)) return;
  }
  throw new Error("couldn't sign in");
}

async function removeFolder(sb: SupabaseClient, prefix: string) {
  const { data } = await sb.storage.from("assets").list(prefix, { limit: 1000 });
  for (const item of data ?? []) {
    const p = `${prefix}/${item.name}`;
    if (item.id) await sb.storage.from("assets").remove([p]);
    else await removeFolder(sb, p);
  }
}

test.use({ channel: "chrome" });

test("designs you like and a scroll film, cut in the browser", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  const writing = process.env.SITE_E2E_WRITE === "1";
  test.setTimeout(writing ? 600_000 : 240_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-sitefilm-${stamp}@blinkspot-test.dev`;
  const password = `Sf-${Math.random().toString(36).slice(2)}-${stamp}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "site-film-"));
  const video = path.join(tmp, "film.mp4"), design = path.join(tmp, "design.jpg");
  // 6 s of a slow pan over a test pattern, and a "screenshot" with big blocks of colour.
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=6", "-vf", "hue=h=t*40", "-c:v", "libx264", "-pix_fmt", "yuv420p", video]);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=0x1d3557:s=1200x1600", "-vf", "drawbox=x=80:y=120:w=1040:h=600:color=0xe63946:t=fill,drawbox=x=80:y=800:w=500:h=600:color=0xf1faee:t=fill", "-frames:v", "1", design]);
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Site Film", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Site Film", contact_name: "Site Film", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 60 }, { onConflict: "client_id" });
    await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Nuf Test Farms", is_active: true, primary_color: "#2F5D3A", secondary_color: "#F4EBD9", primary_font: "Fraunces", description: "A family farm growing vegetables and fruit, selling fresh boxes every week." });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email, password);
    await page.goto(`${BASE}/studio/sites`, { waitUntil: "domcontentloaded" });

    // Designs you like: an upload and a pasted picture link.
    const designs = page.getByRole("group", { name: "Designs you like" });
    await expect(designs).toBeVisible({ timeout: 30_000 });
    await designs.getByLabel("Design picture files").setInputFiles(design);
    await expect(designs.getByRole("img", { name: "Design A" })).toBeVisible({ timeout: 30_000 });
    await designs.getByLabel("Design link").fill(PIN);
    await designs.getByRole("button", { name: "Add", exact: true }).click();
    await expect(designs.getByRole("img", { name: "Design B" })).toBeVisible({ timeout: 30_000 });
    await designs.getByRole("button", { name: "Remove design A" }).click();
    await expect(designs.getByRole("img", { name: "Design B" })).toHaveCount(0);
    await expect(designs.getByRole("img", { name: "Design A" })).toBeVisible();
    await designs.getByLabel("Design picture files").setInputFiles(design);
    await expect(designs.getByRole("img", { name: "Design B" })).toBeVisible({ timeout: 30_000 });

    // Scroll film: cut in the browser, saved to storage, and the scroll can be tried.
    const film = page.getByRole("group", { name: "Scroll film" });
    const t0 = Date.now();
    await film.getByLabel("Scroll film video file").setInputFiles(video);
    await expect(film.getByText(/Cutting and saving frames/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Write 2 pages/ })).toBeDisabled();
    const scrub = film.getByLabel("Try the scroll film");
    await expect(scrub).toBeVisible({ timeout: 180_000 });
    console.log(`film cut and saved in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const { data: folders } = await sb.storage.from("assets").list(`images/${clientId}`, { limit: 100 });
    const folder = folders!.find((f) => f.name.startsWith("site_film_"))!.name;
    const { data: desk } = await sb.storage.from("assets").list(`images/${clientId}/${folder}/d`, { limit: 200 });
    const { data: phone } = await sb.storage.from("assets").list(`images/${clientId}/${folder}/m`, { limit: 200 });
    expect(desk!.length).toBe(96);
    expect(phone!.length).toBe(48);
    const sizes = desk!.map((f) => (f.metadata as { size?: number } | null)?.size ?? 0);
    console.log(`desktop set ${(sizes.reduce((a, b) => a + b, 0) / 1e6).toFixed(2)} MB, type ${(desk![0].metadata as { mimetype?: string }).mimetype}`);
    await scrub.fill("47");
    await expect(film.getByRole("img", { name: "Scroll film frame" })).toHaveAttribute("src", /\/m\/047\.webp$/);
    await expect(page.getByText(/Using 2 designs you like and your scroll film/)).toBeVisible();
    // Kept on this device: still there after a reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("group", { name: "Scroll film" }).getByLabel("Try the scroll film")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("group", { name: "Designs you like" }).getByRole("img", { name: "Design B" })).toBeVisible();

    if (writing) {
      await page.getByRole("button", { name: /^Editorial/ }).click();
      await page.getByRole("button", { name: /Write the page/ }).click();
      await expect(page.getByText(/page ready/)).toBeVisible({ timeout: 330_000 });
      const { data: rows } = await sb.from("site_pages").select("id, html").eq("client_id", clientId);
      expect(rows!.length).toBe(1);
      const html = rows![0].html as string;
      fs.writeFileSync(path.join("test-results", "site-film-page.html"), html);
      expect(html).toContain(`/${folder}/d/`);
      expect((html.match(/<script data-blink-film>/g) ?? []).length).toBe(1);
      const steps = (html.match(/data-film-step/g) ?? []).length;
      console.log(`page ${Math.round(html.length / 1000)} KB, ${steps} film captions, Claude's own stage: ${/<div[^>]*data-film-stage[^>]*>\s*<canvas/.test(html)}`);

      // In the preview, the film is live and draws as it scrolls.
      await page.getByRole("main").getByRole("button", { name: /Cinematic ·/ }).click({ timeout: 15_000 });
      await page.getByRole("tab", { name: "Try it" }).click({ timeout: 15_000 });
      const frame = page.frameLocator('iframe[title="Website preview (try it)"]');
      const section = frame.locator("[data-scroll-film]");
      await expect(section).toHaveClass(/bs-film--live/, { timeout: 20_000 });
      // Into the film and a third of the way through it (the preview's own CSP lets the frames in).
      await section.evaluate((e) => { const top = e.getBoundingClientRect().top + window.scrollY; window.scrollTo(0, top + (e.getBoundingClientRect().height - window.innerHeight) / 3); });
      await expect(section).toHaveClass(/bs-film--drawn/, { timeout: 20_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: "test-results/site-film-preview.png" });
    }
    expect(errors).toEqual([]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (clientId) {
      await removeFolder(sb, `images/${clientId}`);
      await sb.from("site_pages").delete().eq("client_id", clientId);
      await sb.from("ai_usage").delete().eq("client_id", clientId);
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
