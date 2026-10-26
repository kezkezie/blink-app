import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The post page, redone (Kezie, 2026-10-27):
 * - "for the short tab, we just see the short tab's input... when we ask the AI to write it for us,
 *   we only write the short one and the hashtags, if we're on the tab for short";
 * - "I picked only YouTube on my calendar, and when I went to the post itself, it highlighted all
 *   the social medias that I've connected": one clear row per account and what it adds up to.
 * Throwaway account, stand-in accounts (never posted to), one AI caption (1 credit). Deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test post-page-2026-10-27
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EX = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples";

test("caption tabs write one at a time, and the ticks say exactly where it posts", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(240_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-postpage-${stamp}@blinkspot-test.dev`;
  const password = `Pp-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Post Page", onboarding_completed: true } });
  let clientId = "";
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Post Page", contact_name: "Post Page", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 20 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", industry: "Streetwear sneakers", is_active: true }).select("*").single();
    await sb.from("social_accounts").insert(["youtube", "instagram", "tiktok"].map((platform) => ({ client_id: clientId, brand_id: b!.id, platform, account_name: `Kasi ${platform}`, postforme_account_id: `spc_test_${platform}_${stamp}`, is_active: true })));
    const all = { youtube: { enabled: true, format: "standard" }, instagram: { enabled: true, format: "feed" }, tiktok: { enabled: true, format: "post" } };
    const workingTitle = "A reveal of our Runner 01 sneaker in its box";
    const { data: video } = await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "video", status: "draft", caption: workingTitle, caption_written: false, video_urls: [`${EX}/kasi-reveal.mp4`], target_platforms: all }).select("id").single();
    const { data: picture } = await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption: "Poster", caption_written: false, image_urls: [`${EX}/kasi-poster.jpg`] }).select("id").single();

    await page.addInitScript((brand) => { localStorage.setItem("blink-active-brand", JSON.stringify({ state: { activeBrand: brand }, version: 0 })); localStorage.setItem("blink.tourDone", "1"); }, b);
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/library/${video!.id}`);

    // 1. Tabs: one box at a time, the working title flagged on Long.
    await expect(page.getByLabel("Long caption")).toHaveValue(workingTitle, { timeout: 30_000 });
    await expect(page.getByLabel("Short caption")).toHaveCount(0);
    await expect(page.getByRole("note").getByText(/working title, not a caption/)).toBeVisible();
    await page.getByRole("tab", { name: "Short" }).click();
    await expect(page.getByLabel("Long caption")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Short" })).toHaveAttribute("aria-selected", "true");

    // 2. Write short with AI: only the short caption and the hashtags.
    await page.getByRole("button", { name: /Write short with AI/ }).click();
    await expect(page.getByText(/Short caption and hashtags written/)).toBeVisible({ timeout: 90_000 });
    const short = await page.getByLabel("Short caption").inputValue();
    expect(short.length).toBeGreaterThan(5);
    await expect(page.getByLabel("Hashtags")).toHaveValue(/#/);
    await page.getByRole("tab", { name: "Long" }).click();
    await expect(page.getByLabel("Long caption")).toHaveValue(workingTitle);
    await page.getByRole("tab", { name: "Short" }).click();

    // 3. Where it posts: saved with every account (the bug Kezie saw); untick down to YouTube.
    const rows = page.getByRole("group", { name: "Platforms" });
    for (const name of ["YouTube", "Instagram", "TikTok"]) await expect(rows.getByRole("checkbox", { name: new RegExp(name) })).toHaveAttribute("aria-checked", "true");
    const summary = page.getByRole("group", { name: "Platforms" }).locator("xpath=following-sibling::p[1]");
    for (const name of ["YouTube", "Instagram", "TikTok"]) await expect(summary).toContainText(name);
    await expect(summary).not.toContainText("only");
    await rows.getByRole("checkbox", { name: /Instagram/ }).click();
    await rows.getByRole("checkbox", { name: /TikTok/ }).click();
    await expect(page.getByText("Posts to YouTube only.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Post now to YouTube" })).toBeVisible();
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 15_000 });
    const saved = (await sb.from("content").select("target_platforms, caption, caption_short, caption_choice, caption_written, creation_metadata, hashtags").eq("id", video!.id).single()).data!;
    expect(Object.keys(saved.target_platforms as object)).toEqual(["youtube"]);
    expect(saved).toMatchObject({ caption: workingTitle, caption_short: short, caption_choice: "short", caption_written: true });
    expect((saved.creation_metadata as { working_title?: string }).working_title).toBe(workingTitle); // so the long one can't post as a caption
    await page.screenshot({ path: "test-results/post-page.png", fullPage: true });

    // 4. A picture: YouTube is videos only.
    await page.goto(`${BASE}/studio/library/${picture!.id}`);
    const yt = page.getByRole("group", { name: "Platforms" }).getByRole("checkbox", { name: /YouTube/ });
    await expect(yt).toBeDisabled({ timeout: 30_000 });
    await expect(yt).toContainText("Videos only");
  } finally {
    if (clientId) {
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("social_accounts").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
