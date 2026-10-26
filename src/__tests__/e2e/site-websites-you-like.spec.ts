import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Websites you like (Kezie, 2026-10-27: "people are having issues with the website just randomly
 * going to search for inspirations... let them go look for those particular type of websites then
 * pick the websites"). An older automatic find isn't shown; a gallery link is refused; the owner's
 * sites are studied (opened by our server, patterns by Claude, no credits), shown as chips with
 * What we learned, kept after a reload, and removing them clears it. Throwaway account, deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test site-websites-you-like
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("the owner picks the websites the page follows", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(300_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-siteslike-${stamp}@blinkspot-test.dev`;
  const password = `Sl-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Sites Tester", onboarding_completed: true } });
  let clientId = "";
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Sites Tester", contact_name: "Sites Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    // What the old automatic search left on a brand: never shown or followed now.
    const old = { sites: [{ url: "https://flux-academy.com/", name: "Flux", why: "", host: "flux-academy.com", dark: true, fonts: [] }], patterns: "- Old automatic pattern one here\n- two\n- three", at: new Date().toISOString() };
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", industry: "Streetwear sneakers", is_active: true, site_refs: old, site_refs_at: old.at }).select("*").single();
    const brandId = b!.id as string;
    const refs = async () => (await sb.from("brand_profiles").select("site_refs").eq("id", brandId).single()).data?.site_refs as { picked?: boolean; sites: Array<{ host: string }>; patterns: string } | null;

    await page.addInitScript((brand) => { localStorage.setItem("blink-active-brand", JSON.stringify({ state: { activeBrand: brand }, version: 0 })); localStorage.setItem("blink.tourDone", "1"); }, b);
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/sites`);
    const box = page.getByRole("group", { name: "Websites you like" });
    await expect(box).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/sites like yours/)).toHaveCount(0);
    await expect(box.getByText("flux-academy.com")).toHaveCount(0);
    await expect(box.getByRole("link", { name: "Awwwards" })).toHaveAttribute("href", /awwwards\.com/);

    // A gallery page isn't a website to follow.
    const address = box.getByLabel("Website address");
    await address.fill("https://www.awwwards.com/sites/kith");
    await box.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(/not a gallery or social page/)).toBeVisible();

    // Two sites the owner likes, typed the way people paste them.
    await address.fill("kith.com");
    await box.getByRole("button", { name: "Add", exact: true }).click();
    await expect(box.getByRole("link", { name: /kith\.com/ })).toBeVisible({ timeout: 120_000 });
    await address.fill("www.aimeleondore.com");
    await address.press("Enter");
    await expect(box.getByRole("link", { name: /aimeleondore\.com/ })).toBeVisible({ timeout: 120_000 });
    await box.getByRole("button", { name: "What we learned" }).click();
    await expect(box.locator("pre")).toContainText("- ");
    await box.screenshot({ path: "test-results/websites-you-like.png" });
    const kept = await refs();
    expect(kept?.picked).toBe(true);
    expect(kept?.sites.map((s) => s.host).sort()).toEqual(["aimeleondore.com", "kith.com"]);
    await expect(page.getByText(/Using 2 websites you like/)).toBeVisible();

    // Kept on the brand.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(box.getByRole("link", { name: /kith\.com/ })).toBeVisible({ timeout: 60_000 });

    // Removing one studies the rest; removing the last clears it.
    await box.getByRole("button", { name: "Remove kith.com" }).click();
    await expect(box.getByRole("link", { name: /kith\.com/ })).toHaveCount(0, { timeout: 120_000 });
    await expect(box.getByRole("link", { name: /aimeleondore\.com/ })).toBeVisible();
    await box.getByRole("button", { name: "Remove aimeleondore.com" }).click();
    await expect(box.getByRole("link", { name: /aimeleondore\.com/ })).toHaveCount(0, { timeout: 60_000 });
    expect(await refs()).toBeNull();
  } finally {
    if (clientId) {
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
