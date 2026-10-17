import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Ask BlinkSpot does the work (Kezie, 2026-10-17). LIVE on a throwaway account, a few cents plus
 * one draft image: paste what a brand is about and Ask saves it to the Brand page (with products),
 * Undo puts it back; "set up a new brand" creates it and switches to it; "make me a draft image"
 * opens Generate and starts it; the picture opens full screen from the result. Deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test ask-does-tasks --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

async function ask(page: Page, text: string) {
  const panel = page.getByRole("dialog", { name: "Ask BlinkSpot" });
  if (!(await panel.isVisible())) await page.getByRole("button", { name: "Ask BlinkSpot" }).first().click();
  const before = await panel.locator(".msg.ai").count();
  await panel.getByLabel("Message").fill(text);
  await panel.getByRole("button", { name: "Send" }).click();
  await expect(panel.locator(".msg.ai")).toHaveCount(before + 1, { timeout: 180_000 });
  return panel;
}

test("Ask BlinkSpot fills the brand, undoes it, creates a brand and makes an image", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(900_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-asktasks-${stamp}@blinkspot-test.dev`;
  const password = `At-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Ask Tasks Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Ask Tasks Tester", contact_name: "Ask Tasks Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 100 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Mama Njeri Kitchen", is_active: true }).select("id").single();
    const brand = async (id: string) => (await sb.from("brand_profiles").select("brand_name, description, industry, dna").eq("id", id).single()).data!;
    const products = async (id: string) => ((await sb.from("products").select("name, price, currency").eq("brand_id", id).order("name")).data ?? []);
    await signIn(page, email, password);
    await page.goto(`${BASE}/studio`);

    // 1. Paste what the brand is about: Ask saves it, no "go to the Brand page and type it".
    const panel = await ask(page, `Here's everything about my business, please set it up: Mama Njeri Kitchen is a home-style Kenyan restaurant in Kilimani, Nairobi. We serve office workers and families who miss home cooking. Our menu: Pilau with beef KES 650, Chapati and beans KES 300, Fish and ugali KES 900. People love that everything is cooked fresh every morning. Order on WhatsApp +254 712 345 678.`);
    await expect(panel.getByText("Saved to your Brand page")).toBeVisible({ timeout: 30_000 });
    const filled = await brand(b!.id);
    expect(filled.description).toMatch(/Kenyan|home/i);
    expect((filled.dna as { location?: string }).location).toMatch(/Kilimani|Nairobi/);
    expect((filled.dna as { whatsapp?: string }).whatsapp?.replace(/\D/g, "")).toBe("254712345678");
    const menu = await products(b!.id);
    expect(menu.map((p) => p.name).join(" | ")).toMatch(/Pilau/i);
    expect(menu.find((p) => /pilau/i.test(p.name))?.price).toBe(650);

    // Undo puts it back.
    await panel.getByRole("button", { name: "Undo" }).last().click();
    await expect(panel.getByText("Undone").last()).toBeVisible({ timeout: 30_000 });
    expect((await brand(b!.id)).description ?? "").not.toMatch(/Kenyan/i);
    expect(await products(b!.id)).toEqual([]);

    // 2. A new brand from a sentence: created and switched to.
    await ask(page, "Set up a second brand for me called Kasi Kicks: a streetwear sneaker shop in Westlands, Nairobi, for young people who love fresh kicks.");
    await expect(panel.getByText("New brand: Kasi Kicks").first()).toBeVisible({ timeout: 30_000 });
    const { data: kasi } = await sb.from("brand_profiles").select("id, description, industry").eq("client_id", clientId).eq("brand_name", "Kasi Kicks").single();
    expect(kasi!.description).toMatch(/sneaker|streetwear/i);
    await expect(page.getByRole("button", { name: "Switch brand" })).toContainText("Kasi Kicks", { timeout: 15_000 });

    // 3. "Make me one": Generate opens and starts by itself.
    await ask(page, "Make me one quick draft image now: a pair of white sneakers on a concrete step in Nairobi, morning light. Square.");
    await page.waitForURL(/\/studio\/image/, { timeout: 30_000 });
    await expect(page.getByText(/made and saved to your Library/)).toBeVisible({ timeout: 330_000 });
    const { data: made } = await sb.from("content").select("id, image_urls, brand_id").eq("client_id", clientId).eq("brand_id", kasi!.id).order("created_at", { ascending: false }).limit(1).single();
    expect((made!.image_urls as string[])[0]).toMatch(/^https:\/\//);

    // 4. Full screen from the result, without going to the Library.
    await page.getByRole("dialog", { name: "Ask BlinkSpot" }).getByRole("button", { name: "Close" }).click();
    const shot = page.getByRole("img", { name: "Generated" }).first();
    await shot.hover({ timeout: 30_000 });
    const box = (await shot.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2 + 4);
    await page.getByRole("button", { name: "View full screen" }).click({ timeout: 15_000 });
    await expect(page.getByRole("dialog", { name: "Full screen view" })).toBeVisible();
    await page.screenshot({ path: "test-results/ask-tasks-fullscreen.png" });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Full screen view" })).toHaveCount(0);
  } finally {
    if (clientId) {
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("products").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
