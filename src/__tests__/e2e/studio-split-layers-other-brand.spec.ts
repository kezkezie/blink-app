import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Split into layers on a post from another of your brands (Kezie, 2026-10-13: the NUF FARMS poster
 * opened while "mama njeri kitchen" was the active brand; the old words stayed under the new text
 * and the clean photo came back with the other brand's name painted on). LIVE, about 23 credits
 * on a throwaway account that is deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test studio-split-layers-other-brand
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const POSTER = "https://res.cloudinary.com/dap8jijxa/image/upload/v1791851330/blinkspot/image%20content/sedindfzcxmsbc59xnz1.jpg";

test("split into layers: the photo loses its words, even for a post from another brand", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(360_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-split-${stamp}@blinkspot-test.dev`;
  const password = `Sp-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Split Tester", onboarding_completed: true } });
  expect(error).toBeNull();
  let clientId: string | undefined;
  const logs: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Split Tester", contact_name: "Split Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 200 }, { onConflict: "client_id" });
    const { data: brands } = await sb.from("brand_profiles").insert([
      { client_id: clientId, brand_name: "Mama Test Kitchen", company_name: "Mama Test Kitchen", logo_url: "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/kasi-poster.jpg", is_active: true },
      { client_id: clientId, brand_name: "NUF Test Farms", company_name: "NUF Test Farms", is_active: true },
    ]).select("id, brand_name");
    const active = brands!.find((b) => b.brand_name === "Mama Test Kitchen")!;
    const other = brands!.find((b) => b.brand_name === "NUF Test Farms")!;
    const { data: row } = await sb.from("content").insert({ client_id: clientId, brand_id: other.id, content_type: "post_image", status: "draft", caption: "E2E split other brand", image_urls: [POSTER] }).select("id").single();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`);
    await page.evaluate((b) => localStorage.setItem("blink-active-brand", JSON.stringify({ state: { activeBrand: { id: b.id, brand_name: b.brand_name, logo_url: null } }, version: 0 })), active);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/image?mode=design&content=${row!.id}`);
    await expect(page.getByLabel("Layer name").first()).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Layer name").first().click();
    await page.keyboard.press("Escape");
    const box = (await page.locator("canvas").last().boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.getByRole("button", { name: /^Split into layers/ }).click({ timeout: 10_000 });
    await expect(page.getByText(/Split into \d+ text layers?/)).toBeVisible({ timeout: 300_000 });
    const names = await page.getByLabel("Layer name").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    console.log("LAYERS", JSON.stringify(names));
    console.log("LOGS", JSON.stringify(logs));
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-results/split-other-brand.png" });
    // The post opened in its own brand, so the edit used NUF's name and rules, not Mama's.
    await expect(page.getByRole("button", { name: "Switch brand" })).toContainText("NUF Test Farms");
    expect(names.some((n) => /no text/.test(n)), "the photo layer should be the clean one").toBe(true);
    // Sized from the poster's pixels: "Mushroom" is about 940 of 1080 wide in the original.
    await page.locator('input[aria-label="Layer name"][value="Text: Mushroom"]').click();
    const w = Number(await page.getByLabel("W", { exact: true }).inputValue());
    console.log("MUSHROOM width", w);
    expect(w).toBeGreaterThan(940 * 0.88);
    expect(w).toBeLessThan(940 * 1.12);
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
