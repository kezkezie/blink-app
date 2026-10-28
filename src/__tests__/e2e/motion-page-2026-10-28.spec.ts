import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The Motion page, redesigned (Kezie, 2026-10-28: "people need to really see what the capabilities
 * are", from his Pinterest picks and two motion-graphics videos). Checks: the fan of every look
 * with the brand's name, picking one, length and loop going into the brief, "Start from this"
 * filling it, an example opening in the studio for free, and the picked look, length and loop
 * reaching the plan. The planning call is answered here (no Claude, no credits). Throwaway
 * account, deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test motion-page-2026-10-28 --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("motion page: looks fan, steps, what it can make, free examples", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(240_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const stamp = Date.now();
  const email = `e2e-motionpage-${stamp}@blinkspot-test.dev`, password = `Mp-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Motion Page", onboarding_completed: true } });
  let clientId = "";
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  // The plan comes back from here: what was asked is kept to check.
  let asked = "";
  await page.route("**/api/editor/motion", async (r) => {
    asked = (r.request().postDataJSON() as { prompt?: string }).prompt ?? "";
    await r.fulfill({ json: { spec: { kind: "full", shape: "9:16", palette: { background: "#0C0D0F", text: "#F5F5F7", accent: "#3FA34D" }, scenes: [{ template: "kinetic-headline", seconds: 4, words: "Fresh from Nuf Farms.", enter: "word" }] }, pictures: [] } });
  });
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Nuf Farms Test", contact_name: "Motion Page", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Nuf Farms", industry: "Farming", is_active: true, primary_color: "#3FA34D", secondary_color: "#F2C14E" }).select("*").single();
    await page.addInitScript((brand) => { localStorage.setItem("blink-active-brand", JSON.stringify({ state: { activeBrand: brand }, version: 0 })); localStorage.setItem("blink.tourDone", "1"); }, b);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/motion`);

    // 1. The fan: every look, with the brand's name in it; tap one to pick it.
    const fan = page.getByRole("region", { name: "Looks" });
    await expect(fan.getByRole("button", { name: /^Neon Glass:/ })).toHaveCount(1, { timeout: 60_000 });
    await expect(fan.locator(".mg-card")).toHaveCount(15);
    await fan.getByRole("button", { name: /^Neon Glass:/ }).click();
    await expect(fan.getByRole("button", { name: /^Neon Glass:/ })).toHaveAttribute("aria-pressed", "true");
    await expect(fan.getByText("Neon Glass is your look")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/motion-page-fan.png" });

    // 2. The steps: the look shows, a length and a loop are picked.
    const make = page.getByRole("region", { name: "Make yours" });
    await expect(make.getByText(/Neon Glass · change/)).toBeVisible();
    await make.getByRole("group", { name: "How long" }).getByRole("button", { name: "10s" }).click();
    await make.getByLabel(/Make it loop/).check();

    // 3. What it can make: Start from this fills the brief.
    const stack = page.getByRole("region", { name: "What it can make" });
    await stack.locator("article", { hasText: "Numbers" }).getByRole("button", { name: "Start from this" }).click();
    await expect(page.getByLabel("What the motion is for")).toHaveValue(/animated bar chart/, { timeout: 10_000 });

    // 4. Write it: the brief carries the length and the loop, the plan comes back in Neon Glass and loops.
    await page.getByRole("button", { name: /Write it/ }).click();
    await expect(page.getByRole("dialog", { name: "Motion" })).toBeVisible({ timeout: 30_000 });
    expect(asked).toContain("About 10 seconds long in total.");
    expect(asked).toContain("It loops");
    const kept = await page.evaluate((id) => JSON.parse(localStorage.getItem(`kept:motion:${id}:spec`) || "null")?.value, b!.id);
    expect(kept?.look).toBe("glass");
    expect(kept?.loop).toBe(true);
    expect(kept?.palette?.accent).toBe("#3FA34D"); // the brand's green, not the look's purple
    await page.keyboard.press("Escape");

    // 5. Examples: open one for free, straight in the studio, with the brand's name in it.
    const examples = page.getByRole("region", { name: "Examples to start from" });
    await examples.getByRole("button", { name: "Use the Product drop example" }).scrollIntoViewIfNeeded();
    const before = asked;
    await examples.getByRole("button", { name: "Use the Product drop example" }).click();
    const studio = page.getByRole("dialog", { name: "Motion" });
    await expect(studio).toBeVisible({ timeout: 30_000 });
    await expect(studio).toContainText("Nuf Farms Signature", { timeout: 20_000 });
    expect(asked).toBe(before); // nothing was planned (no credits)
    await page.screenshot({ path: "test-results/motion-page-example-open.png" });
    await page.keyboard.press("Escape");

    // 6. A phone: nothing wider than the screen.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
    expect(errors.filter((e) => !/hydrat/i.test(e))).toEqual([]);
  } finally {
    if (clientId) {
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
