import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * After "Post now", the post page waits for each network's answer and says it (Kezie, 2026-10-27:
 * "I tried to repost it again, but nothing came out": YouTube refused it 46 s later, unseen). A post
 * just sent to a stand-in YouTube account (nothing reaches YouTube); PostForMe's refusal is then
 * delivered through our real webhook route, with its secret. Throwaway account, deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test post-answer-2026-10-27
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EX = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples";

test("the post page waits for YouTube's answer and shows the refusal in plain words", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.POSTFORME_WEBHOOK_SECRET, "needs the service key and the webhook secret");
  test.setTimeout(180_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-postanswer-${stamp}@blinkspot-test.dev`;
  const password = `Pa-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Post Answer", onboarding_completed: true } });
  let clientId = "";
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Post Answer", contact_name: "Post Answer", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Nuf Test Farm", industry: "Farming", is_active: true }).select("*").single();
    const account = `spc_test_youtube_${stamp}`, sent = `sp_test_${stamp}`;
    await sb.from("social_accounts").insert({ client_id: clientId, brand_id: b!.id, platform: "youtube", account_name: "Nuf YouTube", postforme_account_id: account, is_active: true });
    const { data: post } = await sb.from("content").insert({
      client_id: clientId, brand_id: b!.id, content_type: "video", status: "approved", caption: "Our farm at sunrise", caption_written: true, hashtags: "#nuffarms #kenya",
      video_urls: [`${EX}/kasi-reveal.mp4`], target_platforms: { youtube: { enabled: true, format: "standard" } }, postforme_tracking_id: sent,
      creation_metadata: { post_sent: { id: sent, platforms: ["youtube"], accounts: 1, skipped: [], at: new Date().toISOString() }, post_results: {} },
    }).select("id").single();

    await page.addInitScript((brand) => { localStorage.setItem("blink-active-brand", JSON.stringify({ state: { activeBrand: brand }, version: 0 })); localStorage.setItem("blink.tourDone", "1"); }, b);
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
    await page.goto(`${BASE}/studio/library/${post!.id}`);

    // Just sent: it says it's waiting, and Post now waits too (no second send while the first is out).
    const when = page.getByRole("region", { name: "When" });
    await expect(when.getByText(/Sent\. Waiting for YouTube to say it's posted/)).toBeVisible({ timeout: 30_000 });
    await expect(when.getByRole("button", { name: /Post now to YouTube/ })).toBeDisabled();

    // PostForMe's answer, through our webhook: the quota refusal Kezie's repost got.
    const res = await fetch(`${BASE}/api/webhooks/postforme`, {
      method: "POST", headers: { "Content-Type": "application/json", "Post-For-Me-Webhook-Secret": process.env.POSTFORME_WEBHOOK_SECRET! },
      body: JSON.stringify({ event_type: "social.post.result.created", data: { post_id: sent, social_account_id: account, success: false, error: "Failed to post to Youtube: Failed to start YouTube resumable upload session: 429 Too Many Requests. {\n \"error\": {\n \"code\": 429,\n \"message\": \"Quota exceeded for quota metric 'Video Uploads' and limit 'Video Uploads per day'" } }),
    });
    expect(res.status).toBe(200);

    // Within a few seconds, on screen: what YouTube said, when to try again, and Post now is back.
    const line = /YouTube didn't post: YouTube's daily upload limit on our posting service was reached\. It resets .+ your time, so post it again after that\./;
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: line })).toBeVisible({ timeout: 20_000 });
    await expect(when.getByRole("list", { name: "What each platform said" }).getByText(line)).toBeVisible();
    await expect(when.getByText(/Waiting for YouTube/)).toHaveCount(0);
    await expect(when.getByRole("button", { name: /Post now to YouTube/ })).toBeEnabled();
    await expect(page.locator(".s-badge", { hasText: /^Failed$/ })).toBeVisible();
    const { data: row } = await sb.from("content").select("status").eq("id", post!.id).single();
    expect(row!.status).toBe("failed");

    // Auto-posting is in beta (2026-10-27), so posting it yourself is right there: the file and the caption.
    await expect(page.getByRole("region", { name: "Where it posts" }).getByLabel("Beta")).toBeVisible();
    const yourself = when.getByRole("group", { name: "Post it yourself" });
    await expect(yourself.getByText(/Auto-posting is in beta/)).toBeVisible();
    const [file] = await Promise.all([page.waitForEvent("download"), yourself.getByRole("button", { name: "Download the video" }).click()]);
    expect(file.suggestedFilename()).toBe("nuf-test-farm.mp4");
    expect((await fs.promises.stat((await file.path())!)).size).toBeGreaterThan(100_000);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin }); // www. on production
    await yourself.getByRole("button", { name: "Copy the caption" }).click();
    await expect(page.getByText("Long caption and hashtags copied.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Our farm at sunrise\n\n#nuffarms #kenya");
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
