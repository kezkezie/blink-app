import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The design pass before Best and Fast renders (2026-10-15). LIVE, about $0.01: a throwaway
 * account asks for a designed poster prompt; it must be a real prompt that keeps the exact words,
 * and another account's brand must be refused. Everything deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test generate-design-pass
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("design pass returns a designed prompt that keeps the words", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(180_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-design-${stamp}@blinkspot-test.dev`;
  const password = `Dp-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Design Tester", onboarding_completed: true } });
  expect(error).toBeNull();
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Design Tester", contact_name: "Design Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Gasless Test", industry: "Crypto wallets", is_active: true }).select("id").single();
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });

    const requirements = [
      "Announce that users can now pay network fees in USDT instead of holding ETH.",
      "Use the brand's colours as the palette: #6BBD51, #231F20.",
      "Set headlines in a typeface like Space Grotesk.",
      'Write exactly this text on the image, spelled exactly as given, and no other words: "Pay gas in USDT".',
      "Image 1 is our logo: place it exactly as given (same shapes and colours), small and clean in a corner. Do not redraw it and do not add any other logo.",
    ].join("\n");
    const res = await page.request.post(`${BASE}/api/generate/design`, { data: { brandId: b!.id, look: "poster", requirements }, timeout: 90_000 });
    const body = await res.json();
    expect(res.status(), JSON.stringify(body)).toBe(200);
    console.log(`NOTES: ${body.notes}\nPROMPT: ${body.prompt}`);
    expect(body.prompt.split(/\s+/).length).toBeGreaterThanOrEqual(40);
    expect(body.prompt).toContain("Pay gas in USDT");
    expect(body.prompt).toMatch(/logo/i);
    expect(typeof body.notes).toBe("string");

    const { data: foreign } = await sb.from("brand_profiles").select("id").neq("client_id", clientId).limit(1).single();
    const theirs = await page.request.post(`${BASE}/api/generate/design`, { data: { brandId: foreign!.id, look: "poster", requirements } });
    expect(theirs.status()).toBe(404);
  } finally {
    if (clientId) {
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
