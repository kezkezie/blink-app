import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Top-ups from Starter up (Kezie, 2026-10-13: not on Free). A new Free account sees the packs
 * locked with the way to a plan, and the checkout refuses a pack without opening a payment.
 * No credits, no payment.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test studio-billing-free
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("Free: credit packs are locked until Starter, the checkout refuses one", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(180_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-billing-free-${stamp}@blinkspot-test.dev`;
  const password = `Bf-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Free Tester", onboarding_completed: true } });
  expect(error).toBeNull();
  const userId = data.user!.id;
  let clientId: string | undefined;
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: userId, company_name: "Free Tester", contact_name: "Free Tester", contact_email: email, plan_tier: "free", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/account/billing`);
    await expect(page.getByText(/Top-ups come with Starter \(\$25 a month\) and up/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Buy 800 credits for $8" })).toBeDisabled();
    await page.getByRole("link", { name: "See plans" }).click();
    await expect(page.getByRole("heading", { name: "Plans" })).toBeInViewport();
    await page.screenshot({ path: "test-results/billing-free.png", fullPage: true });

    const pack = await page.request.post(`${BASE}/api/billing/checkout`, { data: { item: "pack_300" } });
    expect(pack.status()).toBe(403);
    expect((await pack.json()).code).toBe("needs_plan");
    const { data: payments } = await sb.from("payments").select("id").eq("client_id", clientId!);
    expect(payments ?? []).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if (clientId) {
      await sb.from("payments").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(userId);
  }
});
