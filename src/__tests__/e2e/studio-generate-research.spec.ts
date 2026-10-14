import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Generate, 2026-10-14 (Kezie and a friend testing Gasless Cash: "the images have nothing to do
 * with crypto or his brand"). LIVE on a throwaway crypto brand, about $0.20: the first "Get 3 ideas"
 * researches how brands in its industry post (web search, kept on the brand), the ideas name the
 * post format they follow and come with a look, Plain and "Words on the image" are there, a Draft
 * (1 credit) is made, and its charge is tied to the brand and shown under Credits by brand.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test studio-generate-research
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("ideas follow the industry, Plain and words are there, a Draft is charged to its brand", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(420_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-research-${stamp}@blinkspot-test.dev`;
  const password = `Rs-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Research Tester", onboarding_completed: true } });
  expect(error).toBeNull();
  let clientId: string | undefined;
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Research Tester", contact_name: "Research Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 50 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({
      client_id: clientId, brand_name: "Gasless Test", company_name: "Gasless Test", industry: "Tech & apps",
      description: "Lets crypto users send ERC20 and TRC20 tokens across 6 blockchains by paying network fees in stablecoins, with no ETH, BNB or TRX needed. Also an SDK for developers.",
      website_url: "https://gasless.cash", primary_color: "#6BBD51", secondary_color: "#231F20", primary_font: "Space Grotesk", is_active: true,
    }).select("id").single();
    const brandId = b!.id;

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/image?mode=generate`);
    await expect(page.getByRole("button", { name: "Pro controls" })).toHaveCount(0);
    await page.getByLabel("Your idea").fill("A post announcing that you can now pay gas fees in USDT on Tron");
    await page.getByRole("button", { name: /Get 3 ideas/ }).click();
    await expect(page.getByText(/Studying how brands like Gasless Test post/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Based on how .+ post, with your colours/)).toBeVisible({ timeout: 180_000 });
    const { data: researched } = await sb.from("brand_profiles").select("research, research_at").eq("id", brandId).single();
    expect((researched!.research as { formats: unknown[] }).formats.length).toBeGreaterThanOrEqual(2);
    const ideas = page.locator("section", { hasText: "Three ideas for Gasless Test" }).locator("button.s-card");
    await expect(ideas).toHaveCount(3, { timeout: 90_000 });
    const ideaText = (await ideas.allInnerTexts()).join("\n");
    console.log("IDEAS\n" + ideaText);
    expect(ideaText).toMatch(/USDT|stablecoin|gas|fee|Tron|TRC20|chain/i);
    await page.screenshot({ path: "test-results/generate-research-ideas.png", fullPage: true });

    await ideas.first().click();
    await expect(page.getByLabel("Your brief")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Plain", exact: true })).toBeVisible();
    await page.getByLabel("Words on the image").fill("Pay gas in USDT");
    // QUALITY=best to judge the real thing (18 credits); Draft (1 credit) by default.
    const best = process.env.QUALITY === "best";
    if (!best) await page.getByRole("button", { name: "Quality draft" }).click();
    const t0 = new Date(Date.now() - 2000).toISOString();
    await page.getByRole("button", { name: /^Generate/ }).click();
    await expect(page.getByText("Made just now")).toBeVisible({ timeout: 180_000 });
    await page.screenshot({ path: "test-results/generate-research-result.png", fullPage: true });

    const { data: made } = await sb.from("content").select("image_urls").eq("client_id", clientId!).eq("brand_id", brandId).order("created_at", { ascending: false }).limit(1);
    console.log("IMAGE", JSON.stringify(made?.[0]?.image_urls));
    await expect.poll(async () => (await sb.from("credit_transactions").select("amount, brand_id").eq("client_id", clientId!).gte("created_at", t0).lt("amount", 0)).data ?? [], { timeout: 30_000 })
      .toEqual([{ amount: best ? -18 : -1, brand_id: brandId }]);
    await page.goto(`${BASE}/studio/account/billing`);
    const card = page.getByLabel("Credits by brand");
    await expect(card).toContainText("Gasless Test", { timeout: 30_000 });
    await expect(card).toContainText(best ? "18 cr" : "1 cr");
    expect(errors).toEqual([]);
  } finally {
    if (clientId) {
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
