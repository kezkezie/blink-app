import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The agreement at sign-up (Kezie, 2026-10-25: "a checkbox ... to just agree to our agreements and
 * everything, before they sign up"). Create account stays off until the box is ticked, the links go
 * to the three policies, and the account records when it agreed and to which versions. Throwaway
 * account, deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test signup-agreement --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

test("no account without agreeing, and the agreement is recorded", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key to clean up");
  test.setTimeout(120_000);
  const email = `agree-${Date.now()}@blinkspot.local`;
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`${BASE}/get-started`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("John Doe").fill("Akinyi Test");
    await page.getByPlaceholder("you@company.com").fill(email);
    await page.getByPlaceholder("••••••••").fill("BlinkTest123!");
    const create = page.getByRole("button", { name: /Create account/ });
    await expect(create).toBeDisabled();
    for (const [name, href] of [["Terms of Service", "/terms"], ["Privacy Policy", "/privacy"], ["Acceptable Use Policy", "/acceptable-use"]]) {
      await expect(page.locator("label").filter({ has: page.getByRole("checkbox") }).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    await expect(page.getByText(/small BlinkSpot stamp/)).toBeVisible();
    await page.getByRole("checkbox", { name: /I agree to BlinkSpot/ }).check();
    await expect(create).toBeEnabled();
    await create.click();
    await page.waitForURL(/\/welcome/, { timeout: 30_000, waitUntil: "commit" });

    const sb = admin();
    const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const found = list.users.find((x) => x.email === email);
    const { data: user } = await sb.auth.admin.getUserById(found!.id);
    expect(user.user?.user_metadata?.terms_version).toBe("terms@2026-10-26,privacy@2026-10-26,acceptable-use@2026-10-26");
    expect(Date.now() - new Date(user.user?.user_metadata?.terms_accepted_at).getTime()).toBeLessThan(5 * 60_000);
    expect(errors).toEqual([]);
  } finally {
    const sb = admin();
    const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const u = list.users.find((x) => x.email === email);
    if (u) {
      const { data: client } = await sb.from("clients").select("id").eq("user_id", u.id).maybeSingle();
      if (client) {
        await sb.from("credit_transactions").delete().eq("client_id", client.id);
        await sb.from("credit_balances").delete().eq("client_id", client.id);
        await sb.from("clients").delete().eq("id", client.id);
      }
      await sb.from("signup_grants").delete().eq("user_id", u.id);
      await sb.auth.admin.deleteUser(u.id);
    }
  }
});

test("Continue with Google waits for the agreement, then opens Google's sign-in", async ({ page }) => {
  await page.goto(`${BASE}/get-started`, { waitUntil: "domcontentloaded" });
  const google = page.getByRole("button", { name: "Continue with Google" });
  await expect(google).toBeDisabled();
  await page.getByRole("checkbox", { name: /I agree to BlinkSpot/ }).check();
  await expect(google).toBeEnabled();
  await google.click();
  await page.waitForURL(/accounts\.google\.com/, { timeout: 30_000, waitUntil: "commit" });
  const url = new URL(page.url());
  // Google sends people back through Supabase, which then returns them to our callback.
  expect(decodeURIComponent(url.toString())).toContain("supabase.co/auth/v1/callback");

  // The sign-in page has it too, with the agreement line.
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  await expect(page.getByText(/Continuing with Google means you agree/)).toBeVisible();
});
