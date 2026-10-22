import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Animate a picture (Kezie, 2026-10-22: "animate vectors over a real frame"). Renders in-browser
 * (Remotion, no credits): a brand picture is set as the motion background, the words animate over
 * it with a scrim, and the clip saves to the Library. Screenshots the preview for a look and checks
 * the rendered clip lands. Deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test motion-background --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 4; i++) {
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    if (await page.waitForURL(/\/(studio|welcome)/, { timeout: 20_000, waitUntil: "commit" }).then(() => true, () => false)) return;
  }
  throw new Error("couldn't sign in");
}

test("a picture becomes the motion background and the clip renders", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(400_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-motionbg-${stamp}@blinkspot-test.dev`;
  const password = `Mb-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Motion BG", onboarding_completed: true } });
  let clientId: string | undefined;
  // A local file to upload as the background: the example sneaker poster.
  const imgUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/examples/kasi-poster.jpg`;
  const tmp = path.join(os.tmpdir(), `motion-bg-${stamp}.jpg`);
  fs.writeFileSync(tmp, Buffer.from(await (await fetch(imgUrl)).arrayBuffer()));
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Motion BG", contact_name: "Motion BG", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 50 }, { onConflict: "client_id" });
    await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", is_active: true, primary_color: "#E4572E", secondary_color: "#14141A", primary_font: "Space Grotesk" });
    await signIn(page, email, password);

    await page.goto(`${BASE}/studio/motion`);
    await page.getByRole("tab", { name: /9:16/ }).click();
    await page.getByLabel("What the motion is for").fill("A 5 second intro for our Drop 01 sneaker launch: the words Drop 01, then an end card saying Shop the drop");
    await page.getByRole("button", { name: /Write it/ }).click();
    const studio = page.getByRole("dialog", { name: "Motion", exact: true });
    await expect(studio.getByRole("button", { name: /^Make it/ })).toBeVisible({ timeout: 120_000 });

    // Set the picture as the background (the new control), then let the preview settle.
    await studio.getByLabel("Background picture file").setInputFiles(tmp);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: "test-results/motion-background-preview.png" });
    // The preview canvas shows the picture behind the words.
    await expect(studio.locator("video, canvas, img").first()).toBeVisible();

    await studio.getByRole("button", { name: /^Make it/ }).click();
    await expect(page.getByText(/saved to your Library/)).toBeVisible({ timeout: 200_000 });
    const { data: row } = await sb.from("content").select("video_urls, ai_model").eq("client_id", clientId).eq("ai_model", "remotion").single();
    expect((row!.video_urls as string[])[0]).toMatch(/\/videos\/.+\/motion_\d+\.(mp4|webm)$/);
    console.log(`motion-over-picture clip: ${(row!.video_urls as string[])[0]}`);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    if (clientId) {
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});

test("the Library 'Motion graphic' entry sets the picture as the background", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(240_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-motionbg2-${stamp}@blinkspot-test.dev`;
  const password = `Mc-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Motion BG2", onboarding_completed: true } });
  const img = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/examples/kasi-poster.jpg`;
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Motion BG2", contact_name: "Motion BG2", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 50 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", is_active: true, primary_color: "#E4572E", secondary_color: "#14141A" }).select("id").single();
    const { data: post } = await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption: "Drop 01 lands Friday", image_urls: [img] }).select("id").single();
    await signIn(page, email, password);

    await page.goto(`${BASE}/studio/motion?picture=${post!.id}&brief=${encodeURIComponent("Animate this picture: Drop 01 lands Friday")}`);
    const resP = page.waitForResponse((r) => r.url().includes("/api/editor/motion") && r.request().method() === "POST");
    await page.getByRole("button", { name: /Write it/ }).click();
    const spec = (await (await resP).json()).spec;
    console.log(`handed-off background: ${spec?.background}`);
    expect(spec.background).toBe(img);
    expect(spec.kind).toBe("full");
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
