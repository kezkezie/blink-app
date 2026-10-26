import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Stop (2026-10-22, test users asked for it). Throwaway account: an image stopped while it's being
 * made leaves no post and gives the credits back; Ask BlinkSpot stops mid-answer. Deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test stop --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("Stop: an image being made is removed with its credits back; Ask stops mid-answer", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(300_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-stop-${stamp}@blinkspot-test.dev`;
  const password = `St-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Stop Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Stop Tester", contact_name: "Stop Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", industry: "Fashion", description: "Streetwear sneakers made in Nairobi.", is_active: true, primary_color: "#E4572E" });
    const balance = async () => Number((await sb.from("credit_balances").select("balance").eq("client_id", clientId!).single()).data?.balance);
    await page.setViewportSize({ width: 1440, height: 900 });
    page.on("response", (r) => { if (r.url().includes("/api/images") && r.request().method() !== "GET") console.log(`${r.request().method()} ${r.url().slice(-80)} ${r.status()}`); });
    page.on("console", (m) => { if (m.type() === "error") console.log(`console: ${m.text().slice(0, 200)}`); });
    await signIn(page, email, password);
    const start = await balance();

    // 1. Generate (Fast), stopped while it's being made.
    await page.goto(`${BASE}/studio/image?mode=generate&prompt=${encodeURIComponent("A red sneaker on a Nairobi rooftop at dusk, product hero shot")}&auto=1&count=1&quality=fast`);
    await expect(page.getByText(/Making it…|Designing it…/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Making it…")).toBeVisible({ timeout: 90_000 });
    await expect.poll(async () => (await sb.from("content").select("id", { count: "exact", head: true }).eq("client_id", clientId!).eq("content_type", "post_image")).count, { timeout: 20_000 }).toBe(1);
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Stopped. Your credits are back.")).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await sb.from("content").select("id", { count: "exact", head: true }).eq("client_id", clientId!).eq("content_type", "post_image")).count, { timeout: 20_000 }).toBe(0);
    // n8n may charge just before or just after the stop: either way the balance comes back level.
    const t0 = Date.now();
    await expect.poll(balance, { timeout: 300_000, intervals: [5000] }).toBe(start);
    console.log(`credits back ${Math.round((Date.now() - t0) / 1000)} s after the stop`);
    // And a picture that arrives later lands nowhere.
    await page.waitForTimeout(45_000);
    expect((await sb.from("content").select("id", { count: "exact", head: true }).eq("client_id", clientId!).eq("content_type", "post_image")).count).toBe(0);
    expect(await balance()).toBe(start);

    // 2. Ask BlinkSpot, stopped mid-answer.
    const panel = page.getByRole("dialog", { name: "Ask BlinkSpot" });
    if (!(await panel.isVisible())) await page.getByRole("button", { name: "Ask BlinkSpot" }).first().click();
    await panel.getByLabel("Message").fill("Write me a detailed 30 day content plan for Kasi Kicks with a post idea for every day");
    await panel.getByRole("button", { name: "Send" }).click();
    await panel.getByRole("button", { name: "Stop" }).click({ timeout: 10_000 });
    await expect(panel.getByText("Stopped. Nothing else was done.")).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByRole("button", { name: "Send" })).toBeVisible();
  } finally {
    if (clientId) {
      const { data: tx } = await sb.from("credit_transactions").select("created_at, amount, description").eq("client_id", clientId).order("created_at");
      console.log(`credits: ${JSON.stringify(tx)}`);
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
