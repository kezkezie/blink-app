import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Edit-with-AI layout (Kezie, 2026-10-22: the panel padding was overextended and the portrait image
 * sat in a wide black box). Seeds a post with a kept scan (free, no n8n) and screenshots the editor
 * at a laptop and a wide screen to eyeball the balance and check nothing overflows. Deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test xray-layout --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const IMG = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/examples/kasi-poster.jpg`;

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 4; i++) {
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    if (await page.waitForURL(/\/(studio|welcome)/, { timeout: 20_000, waitUntil: "commit" }).then(() => true, () => false)) return;
  }
  throw new Error("couldn't sign in");
}

test("the editor is balanced and doesn't overflow at laptop and wide widths", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(180_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-xray-${stamp}@blinkspot-test.dev`;
  const password = `Xr-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Xray", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Xray", contact_name: "Xray", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", industry: "Fashion", is_active: true, primary_color: "#E4572E", secondary_color: "#111111" }).select("id").single();
    const scan = { source: IMG, at: new Date().toISOString(), from: "scan", scan: { scene: "A promotional poster for a streetwear sneaker brand showing a red sneaker with bold headline type and a barcode footer.", light: "soft studio light", objects: [
      { id: "o1", name: "Headline text", kind: "words", color: "#FFFFFF", material: "", text: "DROP 01", font: "bold condensed sans", box: [120, 380, 520, 180] },
      { id: "o2", name: "The sneaker", kind: "thing", color: "#E4572E", material: "Matte", box: [300, 120, 420, 300] },
      { id: "o3", name: "The model", kind: "person", color: "#333333", material: "", box: [360, 360, 300, 560] },
      { id: "o4", name: "Background", kind: "background", color: "#6B2FB3", material: "" },
    ] } };
    const { data: post } = await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption: "Xray layout", image_urls: [IMG], xray: scan }).select("id").single();
    await signIn(page, email, password);

    for (const [w, h, tag] of [[1440, 900, "laptop"], [1920, 1080, "wide"]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${BASE}/studio/library/${post!.id}/edit`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Change what you want")).toBeVisible({ timeout: 30_000 });
      // Open a thing to show the material chips (where clipping showed before).
      await page.getByRole("button", { name: /Edit The sneaker/ }).first().click().catch(() => {});
      await page.getByText("The sneaker").first().click();
      await page.waitForTimeout(500);
      // No horizontal page scroll.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`${tag}: horizontal overflow = ${overflow}px`);
      expect(overflow, `${tag} has horizontal overflow`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/xray-${tag}.png` });
    }
  } finally {
    if (clientId) {
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
