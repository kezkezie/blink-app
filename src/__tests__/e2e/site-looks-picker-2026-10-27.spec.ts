import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The website studio's looks (Kezie, 2026-10-27: "people are getting confused... they won't think
 * it's a combination of all these things that creates one website"). One website in one look by
 * default; Compare looks writes a separate website per look, each card labelled Website 1, 2, 3.
 * Writes nothing (no credits): a throwaway account, deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test site-looks-picker --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("looks: one website by default, separate websites when comparing", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(240_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-looks-${stamp}@blinkspot-test.dev`;
  const password = `Lk-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Looks Test", onboarding_completed: true } });
  let clientId = "";
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Looks Cafe", contact_name: "Looks Test", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Looks Cafe", industry: "Cafe", description: "A small cafe.", is_active: true }).select("*").single();
    await page.addInitScript((brand) => { localStorage.setItem("blink-active-brand", JSON.stringify({ state: { activeBrand: brand }, version: 0 })); localStorage.setItem("blink.tourDone", "1"); }, b);
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/sites`);
    await expect(page.getByRole("heading", { name: "Websites you can edit by sections or as code" })).toBeVisible({ timeout: 60_000 });

    const looks = page.getByRole("group", { name: "Look" });
    const lookButton = (name: RegExp) => looks.getByRole("button", { name });

    // One website, Cinematic to start; picking another look replaces it.
    await expect(looks.getByRole("button", { name: "One website" })).toHaveAttribute("aria-pressed", "true");
    await expect(looks.getByText(/You get one website, in the look you pick/)).toBeVisible();
    await expect(lookButton(/^Cinematic/)).toHaveAttribute("aria-pressed", "true");
    await lookButton(/^Minimal/).click();
    await expect(lookButton(/^Minimal/)).toHaveAttribute("aria-pressed", "true");
    await expect(lookButton(/^Cinematic/)).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: /Write the website/ })).toBeEnabled();
    await looks.screenshot({ path: "test-results/looks-one-website.png" });

    // Compare: each ticked look is its own website, numbered, and the button counts websites.
    await looks.getByRole("button", { name: "Compare looks" }).click();
    await expect(looks.getByText(/Each look you tick becomes its own separate website/)).toBeVisible();
    await lookButton(/^Editorial/).click();
    await lookButton(/^Bold/).click();
    await expect(lookButton(/^Minimal/)).toContainText("Website 1");
    await expect(lookButton(/^Editorial/)).toContainText("Website 2");
    await expect(lookButton(/^Bold/)).toContainText("Website 3");
    await expect(looks.getByText("You'll get 3 separate websites: 1. Minimal, 2. Editorial, 3. Bold. One of each, to compare.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Write 3 websites/ })).toBeVisible();
    await looks.screenshot({ path: "test-results/looks-compare.png" });

    // Back to one website: keeps the first look only.
    await looks.getByRole("button", { name: "One website" }).click();
    await expect(lookButton(/^Minimal/)).toHaveAttribute("aria-pressed", "true");
    await expect(lookButton(/^Editorial/)).toHaveAttribute("aria-pressed", "false");
    await expect(lookButton(/^Bold/)).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: /Write the website/ })).toBeVisible();
  } finally {
    if (clientId) {
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
