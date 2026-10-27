import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * "Your own words" in the website studio (Kezie, 2026-10-27: "a way on how we can be able to post
 * our written personal written content for the website"). A PDF and a text file are read in the
 * browser into the box, and the page written from it carries those words as written. LIVE: one page
 * (30 credits on a throwaway account), deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test site-own-words --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const STORY = "We started baking in my mum's kitchen in Kisumu in 2019, with one oven and a sack of flour.";

test("your own words, from a PDF and a text file, go on the page as written", async ({ page, browser }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(600_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-ownwords-${stamp}@blinkspot-test.dev`;
  const password = `Ow-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Own Words", onboarding_completed: true } });
  let clientId = "";
  fs.mkdirSync("test-results", { recursive: true });
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Kisumu Crust", contact_name: "Own Words", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 60 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kisumu Crust", industry: "Bakery", description: "A small family bakery in Kisumu.", is_active: true, primary_color: "#C2410C", secondary_color: "#1C1917", primary_font: "Fraunces", secondary_font: "Inter" }).select("*").single();

    // A real PDF, made by the browser, and a text file.
    const maker = await browser.newPage();
    await maker.setContent(`<h1>Our story</h1><p>${STORY}</p><h2>Menu</h2><ul><li>Sourdough loaf, KES 450</li><li>Cinnamon rolls (6), KES 600</li></ul>`);
    const pdf = `test-results/own-words-${stamp}.pdf`;
    await maker.pdf({ path: pdf });
    await maker.close();
    const txt = `test-results/own-words-${stamp}.txt`;
    fs.writeFileSync(txt, "Opening hours\nTuesday to Sunday, 7am to 6pm");

    await page.addInitScript((brand) => { localStorage.setItem("blink-active-brand", JSON.stringify({ state: { activeBrand: brand }, version: 0 })); localStorage.setItem("blink.tourDone", "1"); }, b);
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/sites`);
    await expect(page.getByRole("heading", { name: "Websites you can edit by sections or as code" })).toBeVisible({ timeout: 60_000 });

    await page.getByLabel("What the site is for").fill("Our home page, with an order on WhatsApp button");
    const box = page.getByRole("group", { name: "Your own words" });
    await box.getByLabel("Files with your words").setInputFiles([pdf, txt]);
    await expect(page.getByText(/Added the words from own-words-\d+\.pdf \(1 page\)/)).toBeVisible({ timeout: 30_000 });
    const words = box.getByLabel("Your own words");
    await expect(words).toHaveValue(/Sourdough loaf, KES 450/);
    await expect(words).toHaveValue(/Tuesday to Sunday, 7am to 6pm/);
    await expect(words).toHaveValue(new RegExp(STORY.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await expect(page.getByText(/Using your own words/)).toBeVisible();

    // One website, Minimal (picking a look replaces the one before).
    await page.getByRole("button", { name: /^Minimal/ }).click();
    await page.getByRole("button", { name: /Write the website/ }).click();
    await expect(page.getByText(/page ready/)).toBeVisible({ timeout: 420_000 });
    const { data: rows } = await sb.from("site_pages").select("html").eq("client_id", clientId);
    expect(rows).toHaveLength(1);
    const text = (rows![0].html as string).replace(/<[^>]+>/g, " ").replace(/&#39;|&apos;|&rsquo;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
    expect(text).toContain("Sourdough loaf");
    expect(text).toContain("KES 450");
    expect(text).toContain("Cinnamon rolls (6)");
    expect(text).toContain("Tuesday to Sunday, 7am to 6pm");
    expect(text).toContain("one oven and a sack of flour");
    fs.writeFileSync(`test-results/own-words-page.html`, rows![0].html as string);
  } finally {
    if (clientId) {
      await sb.from("site_pages").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId).then(() => {}, () => {});
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
