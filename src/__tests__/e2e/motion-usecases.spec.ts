import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Motion use cases (2026-10-21). LIVE on a throwaway account, 8 credits: "Numbers that move" with a
 * pasted table plans a bar chart using exactly those numbers, and "Post to video" with a pasted post
 * plans key points from it; the chart is made in the browser and saved. Deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test motion-usecases --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}
type Scene = { template: string; bars?: Array<{ label: string; value: number }>; points?: string[]; title?: string };

test("numbers that move and a post turned into a video use only what was pasted", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(480_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-motionuse-${stamp}@blinkspot-test.dev`;
  const password = `Mu-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Motion Use", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Motion Use", contact_name: "Motion Use", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 50 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "NUF FARMS", industry: "Agriculture", is_active: true, primary_color: "#2F5D3A", secondary_color: "#F4EDE1", primary_font: "Space Grotesk" }).select("id").single();
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email, password);
    const kept = async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.value, `kept:motion:${b!.id}:spec`) as Promise<{ scenes: Scene[] } | null>;

    // 1. Numbers that move.
    await page.goto(`${BASE}/studio/motion`);
    await expect(page.getByText(/for NUF FARMS/).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("tab", { name: /16:9/ }).click();
    await page.getByRole("button", { name: "Numbers that move" }).click();
    await page.getByLabel("Text or numbers to use").fill("Mushroom harvest, kg per month\nJune 140\nJuly 210\nAugust 265\nSeptember 330");
    await page.getByRole("button", { name: /Write it/ }).click();
    const studio = page.getByRole("dialog", { name: "Motion", exact: true });
    await expect(studio.getByRole("button", { name: /^Make it/ })).toBeVisible({ timeout: 150_000 });
    const s1 = (await kept())!;
    console.log("numbers plan", JSON.stringify(s1.scenes.map((s) => ({ t: s.template, title: s.title, bars: s.bars }))));
    const bars = s1.scenes.find((s) => s.template === "bars");
    expect(bars?.bars?.map((x) => x.value)).toEqual([140, 210, 265, 330]);
    await studio.getByRole("button", { name: /^Make it/ }).click();
    await expect(page.getByText(/saved to your Library/)).toBeVisible({ timeout: 240_000 });
    const { data: row } = await sb.from("content").select("video_urls").eq("client_id", clientId).eq("ai_model", "remotion").order("created_at", { ascending: false }).limit(1).single();
    if (process.env.MOTION_KEEP_VIDEO) console.log("numbers video", (row!.video_urls as string[])[0]);

    // 2. A post turned into a video.
    await page.goto(`${BASE}/studio/motion`);
    await page.getByRole("tab", { name: /9:16/ }).click();
    await page.getByRole("button", { name: "Post to video" }).click();
    await page.getByLabel("Text or numbers to use").fill("Why we grow in containers. Our farm in Kiambu grows button mushrooms inside two shipping containers. The climate inside never changes, so every harvest is the same quality. We pick by hand every morning and pack the same day. Spent compost goes back to local farmers as fertiliser.");
    await page.getByRole("button", { name: /Write it/ }).click();
    await expect(studio.getByRole("button", { name: /^Make it/ })).toBeVisible({ timeout: 150_000 });
    const s2 = (await kept())!;
    console.log("post plan", JSON.stringify(s2.scenes.map((s) => ({ t: s.template, title: s.title, points: s.points }))));
    const pts = s2.scenes.find((s) => s.template === "points");
    expect(pts?.points?.length).toBeGreaterThanOrEqual(3);
    expect(pts!.points!.join(" ")).toMatch(/container|climate|hand|compost/i);
  } finally {
    if (clientId) {
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
