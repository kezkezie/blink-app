import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Out of credits (launch sweep, 2026-10-25). A Free account with 0 credits is told at once what a
 * Generate or a Remix costs, with a way to top up, instead of a minute of "Studying references…"
 * ending in a refusal; the motion planner refuses with 402. Nothing is charged, nothing is made.
 * No AI calls. Deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test studio-no-credits
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const INSPO = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/kasi-poster.jpg";

test("with no credits, paid starts say what they cost and spend nothing", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(180_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-nocredits-${stamp}@blinkspot-test.dev`;
  const password = `Nc-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "No Credits", onboarding_completed: true } });
  expect(error).toBeNull();
  let clientId: string | undefined;
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "No Credits", contact_name: "No Credits", contact_email: email, plan_tier: "free", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 0 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "No Credits Test", is_active: true, primary_color: "#C6F432", secondary_color: "#0C0D0F" }).select("id").single();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });

    // Generate: the cost and the balance, and a way to top up, straight away.
    await page.goto(`${BASE}/studio/image`);
    await page.getByText("Generate", { exact: true }).first().click();
    await page.locator("textarea").first().fill("A launch poster for our new juice");
    await page.getByRole("button", { name: /Use my words/ }).click();
    await expect(page.getByRole("link", { name: /^0 credits/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /^Generate/ }).last().click();
    await expect(page.getByText("This image is 18 credits and you have 0.")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Studying references")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Top up" })).toBeVisible();

    // Inspo Remix: the same.
    await page.getByText("Inspo Remix", { exact: true }).first().click();
    await page.getByPlaceholder(/paste a Pinterest pin or image link/).fill(INSPO);
    await page.getByRole("button", { name: "Use link" }).click();
    const go = page.getByRole("button", { name: /^Remix for/ });
    await expect(go).toBeEnabled({ timeout: 30_000 });
    await go.click();
    await expect(page.getByText("A remix is 18 credits and you have 0.")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Remaking it for/)).toHaveCount(0);

    // The motion planner refuses on the server.
    const motion = await page.request.post(`${BASE}/api/editor/motion`, { data: { brandId: b!.id, prompt: "A 6 second intro", shape: "9:16" } });
    expect(motion.status()).toBe(402);

    const { data: bal } = await sb.from("credit_balances").select("balance").eq("client_id", clientId).single();
    expect(bal!.balance).toBe(0);
    const { data: made } = await sb.from("content").select("id").eq("client_id", clientId).neq("content_type", "inspo");
    expect(made ?? []).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if (clientId) {
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
