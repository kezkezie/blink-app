import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * New-account flow (2026-10-11): sign up → /welcome (six steps) → the studio with the brand made
 * and its answers saved. Creates a throwaway account and deletes it (auth user, client, brand).
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test welcome-onboarding
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

test("sign up, answer the brand questions, land in the studio", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key to clean up");
  test.setTimeout(180_000);
  const email = `welcome-${Date.now()}@blinkspot.local`;
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 860 });
  try {
    await page.goto(`${BASE}/get-started`);
    await page.getByPlaceholder("John Doe").fill("Wanjiru Test");
    await page.getByPlaceholder("you@company.com").fill(email);
    await page.getByPlaceholder("••••••••").fill("BlinkTest123!");
    await page.getByRole("button", { name: /Create account/ }).click();
    await page.waitForURL(/\/welcome/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Hi Wanjiru/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^My business/ }).click();
    await page.getByRole("button", { name: /^Yes, but no website/ }).click();
    await page.getByLabel("Brand name").fill("Test Juice Bar");
    await page.getByLabel("What you do").fill("Fresh juices pressed every morning in Nairobi.");
    await page.getByLabel("Who it's for").fill("Gym goers and office workers");
    await page.getByLabel("Where you're based").fill("Nairobi");
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: "Bright & clean" }).click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: "Warm", exact: true }).click();
    await page.getByRole("button", { name: "Swahili", exact: true }).click();
    await page.getByLabel("WhatsApp").fill("+254 712 345 678");
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.screenshot({ path: "test-results/welcome-style.png" });
    await page.getByRole("button", { name: /^I'll use the tools/ }).click();
    await page.waitForURL(/\/studio(\?|$)/, { timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Switch brand" })).toContainText("Test Juice Bar", { timeout: 20_000 });

    const sb = admin();
    const { data: client } = await sb.from("clients").select("id").eq("contact_email", email).maybeSingle();
    const { data: brand } = await sb.from("brand_profiles").select("brand_name, description, tone_keywords, dna").eq("client_id", client!.id).single();
    if (!brand) throw new Error("brand not created");
    expect(brand.brand_name).toBe("Test Juice Bar");
    expect(brand.dna).toMatchObject({ role: "business", audience: "Gym goers and office workers", location: "Nairobi", whatsapp: "+254 712 345 678", photoVibes: ["Bright & clean"] });
    expect(brand.dna.languages).toEqual(["English", "Swahili"]);
    expect(errors).toEqual([]);
  } finally {
    const sb = admin();
    const { data: client } = await sb.from("clients").select("id, user_id").eq("contact_email", email).maybeSingle();
    if (client) {
      await sb.from("brand_profiles").delete().eq("client_id", client.id);
      await sb.from("credit_balances").delete().eq("client_id", client.id);
      await sb.from("clients").delete().eq("id", client.id);
      await sb.auth.admin.deleteUser(client.user_id);
    } else {
      const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
      const u = users?.users.find((x) => x.email === email);
      if (u) await sb.auth.admin.deleteUser(u.id);
    }
  }
});

test("sign up and fill the brand in from a website (AI auto-fill)", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key to clean up");
  test.setTimeout(180_000);
  const email = `welcome-site-${Date.now()}@blinkspot.local`;
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 860 });
  try {
    await page.goto(`${BASE}/get-started`);
    await page.getByPlaceholder("John Doe").fill("Njeri Test");
    await page.getByPlaceholder("you@company.com").fill(email);
    await page.getByPlaceholder("••••••••").fill("BlinkTest123!");
    await page.getByRole("button", { name: /Create account/ }).click();
    await page.waitForURL(/\/welcome/, { timeout: 30_000 });
    await page.getByRole("button", { name: /^My business/ }).click();
    await page.getByLabel("Website").fill("scintillating-pegasus-f263f8.netlify.app");
    await page.getByRole("button", { name: /Fill it in for me/ }).click();
    await expect(page.getByText(/Filled in from/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel("Brand name")).toHaveValue(/Mama Njeri/i);
    await expect(page.getByLabel("Where you're based")).toHaveValue(/Nairobi/i);
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /^I'll use the tools/ }).click();
    await page.waitForURL(/\/studio(\?|$)/, { timeout: 60_000 });
    const sb = admin();
    const { data: client } = await sb.from("clients").select("id, plan_tier").eq("contact_email", email).maybeSingle();
    expect(client?.plan_tier).toBe("free");
    const { data: brand } = await sb.from("brand_profiles").select("id, brand_name, dna").eq("client_id", client!.id).single();
    if (!brand) throw new Error("brand not created");
    expect(brand.dna.location).toMatch(/Nairobi/);
    const { count } = await sb.from("products").select("id", { count: "exact", head: true }).eq("brand_id", brand.id);
    expect(count ?? 0).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally {
    const sb = admin();
    const { data: client } = await sb.from("clients").select("id, user_id").eq("contact_email", email).maybeSingle();
    if (client) {
      // Auto-fill copied the site's logo into the account's folder.
      const { data: files } = await sb.storage.from("assets").list(`images/${client.id}`);
      if (files?.length) await sb.storage.from("assets").remove(files.map((f) => `images/${client.id}/${f.name}`));
      await sb.from("products").delete().eq("client_id", client.id);
      await sb.from("brand_profiles").delete().eq("client_id", client.id);
      await sb.from("credit_balances").delete().eq("client_id", client.id);
      await sb.from("clients").delete().eq("id", client.id);
      await sb.auth.admin.deleteUser(client.user_id);
    }
  }
});
