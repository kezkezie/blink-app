import { test, expect, type Page, type Browser } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * App walkthroughs (2026-10-20). LIVE on a throwaway account, 4 credits: two made-up app screens
 * with buttons at known places are uploaded as screenshots, Claude plans one step per screen, and
 * each step's box must land on the right button (its centre inside the button, padded a little).
 * Then it's made in the browser and saved to the Library. Deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test motion-walkthrough --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

type Box = { x: number; y: number; w: number; h: number };

/** A fake app screen as a PNG, and where its target button sits (fractions of the picture). */
async function fakeScreen(browser: Browser, viewport: { width: number; height: number }, html: string, target: string, file: string): Promise<Box> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.setContent(`<!doctype html><html><body style="margin:0;font-family:system-ui;background:#F5F3EE;color:#14141A">${html}</body></html>`);
  const r = (await p.locator(target).boundingBox())!;
  await p.screenshot({ path: file });
  await ctx.close();
  return { x: r.x / viewport.width, y: r.y / viewport.height, w: r.width / viewport.width, h: r.height / viewport.height };
}

const centreInside = (box: [number, number, number, number], t: Box, pad = 0.03) => {
  const cx = box[0] + box[2] / 2, cy = box[1] + box[3] / 2;
  return cx >= t.x - pad && cx <= t.x + t.w + pad && cy >= t.y - pad && cy <= t.y + t.h + pad;
};

test("an app walkthrough from screenshots points at the right buttons", async ({ page, browser }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(420_000);
  const dir = mkdtempSync(join(tmpdir(), "walkthrough-"));
  const phone = join(dir, "1-phone.png"), laptop = join(dir, "2-laptop.png");
  const generate = await fakeScreen(browser, { width: 390, height: 844 }, `
    <div style="padding:24px 20px"><b style="font-size:22px">Kasi Kicks Studio</b>
      <p style="color:#666;margin:28px 0 8px">Describe your poster</p>
      <div style="height:120px;border:1px solid #ccc;border-radius:12px;background:#fff;padding:12px;color:#999">Drop 01 sneaker launch, bold orange</div>
      <div style="display:flex;gap:8px;margin-top:16px"><span style="padding:8px 12px;border-radius:99px;background:#eee">Square</span><span style="padding:8px 12px;border-radius:99px;background:#eee">Story</span></div>
    </div>
    <button id="go" style="position:absolute;left:20px;right:20px;bottom:40px;height:56px;border:0;border-radius:14px;background:#E4572E;color:#fff;font-size:18px;font-weight:700">Generate poster</button>`,
    "#go", phone);
  const schedule = await fakeScreen(browser, { width: 1280, height: 800 }, `
    <div style="display:flex;height:800px"><nav style="width:220px;background:#14141A;color:#fff;padding:24px">Library<br><br>Calendar<br><br>Settings</nav>
      <main style="flex:1;padding:32px;position:relative"><b style="font-size:26px">Your poster is ready</b>
        <div style="margin-top:24px;width:420px;height:420px;background:#E4572E;border-radius:16px"></div>
        <button id="sched" style="position:absolute;right:40px;top:32px;height:44px;padding:0 22px;border:0;border-radius:10px;background:#14141A;color:#fff;font-size:15px">Schedule post</button>
      </main></div>`,
    "#sched", laptop);
  writeFileSync(join(dir, "targets.json"), JSON.stringify({ generate, schedule }));

  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-walkthrough-${stamp}@blinkspot-test.dev`;
  const password = `Wt-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Walkthrough Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Walkthrough Tester", contact_name: "Walkthrough Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 50 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", is_active: true, primary_color: "#E4572E", secondary_color: "#14141A", primary_font: "Space Grotesk" }).select("id").single();
    await signIn(page, email, password);

    await page.goto(`${BASE}/studio/motion`);
    await page.getByRole("tab", { name: /9:16/ }).click();
    await expect(page.getByText(/for Kasi Kicks/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Add app screenshots")).toBeEnabled({ timeout: 30_000 });
    await page.getByLabel("Add app screenshots").setInputFiles([phone, laptop]);
    await expect(page.getByRole("img", { name: "Screenshot 2" })).toBeVisible({ timeout: 60_000 });
    // Uploading fills the brief with the walkthrough start.
    await expect(page.getByLabel("What the motion is for")).toHaveValue(/walkthrough/i);
    await page.getByLabel("What the motion is for").fill("A walkthrough of our app: first tap Generate poster, then click Schedule post. One step per screenshot.");
    await page.getByRole("button", { name: /Write it/ }).click();
    const studio = page.getByRole("dialog", { name: "Motion", exact: true });
    await expect(studio.getByRole("button", { name: /^Make it/ })).toBeVisible({ timeout: 150_000 });

    // The plan (kept on this device) has one screen step per screenshot, on the right buttons.
    const spec = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.value, `kept:motion:${b!.id}:spec`);
    const steps = (spec?.scenes ?? []).filter((s: { template: string }) => s.template === "screen") as Array<{ image: string; box: [number, number, number, number]; device: string; label: string }>;
    console.log("walkthrough steps", JSON.stringify(steps.map((s) => ({ box: s.box.map((n) => Number(n.toFixed(3))), device: s.device, label: s.label }))), JSON.stringify({ generate, schedule }));
    expect(steps).toHaveLength(2);
    expect(steps[0].image).toMatch(new RegExp(`/assets/images/${clientId}/screen_\\d+_0\\.webp$`));
    expect(steps[0].device).toBe("phone");
    expect(steps[1].device).toBe("laptop");
    expect(centreInside(steps[0].box, generate)).toBe(true);
    expect(centreInside(steps[1].box, schedule)).toBe(true);

    // The step editor: pick the first walkthrough step in the scene strip (the studio edits one scene
    // at a time since 2026-10-23), then clicking the screenshot moves where it points.
    await studio.getByRole("list", { name: "Scenes" }).getByRole("listitem").filter({ hasText: "App walkthrough step" }).first().click();
    const where = studio.getByRole("button", { name: "Where this step points" }).first();
    await where.scrollIntoViewIfNeeded();
    const r = (await where.boundingBox())!;
    await page.mouse.click(r.x + r.width * 0.5, r.y + r.height * 0.1);
    const moved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.value, `kept:motion:${b!.id}:spec`);
    const box = (moved.scenes as Array<{ template: string; box: number[] }>).find((s) => s.template === "screen")!.box;
    expect(box[1] + box[3] / 2).toBeLessThan(0.2);

    await studio.getByRole("button", { name: /^Make it/ }).click();
    await expect(page.getByText(/saved to your Library/)).toBeVisible({ timeout: 240_000 });
    const { data: row } = await sb.from("content").select("video_urls").eq("client_id", clientId).eq("ai_model", "remotion").single();
    expect((row!.video_urls as string[])[0]).toMatch(/\/videos\/.+\/motion_\d+\.(mp4|webm)$/);
    if (process.env.WALKTHROUGH_KEEP_VIDEO) console.log("walkthrough video", (row!.video_urls as string[])[0]);
  } finally {
    if (clientId) {
      const { data: files } = await sb.storage.from("assets").list(`images/${clientId}`);
      if (files?.length) await sb.storage.from("assets").remove(files.map((f) => `images/${clientId}/${f.name}`));
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
