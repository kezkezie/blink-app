import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Edit with AI, rebuilt (Kezie, 2026-10-15: cache the scan, swap from the Library, new UX). LIVE on
 * a throwaway account: scan once (4 credits, about $0.02), reopen free, unsent changes survive a
 * reload, change the words and swap a thing for a Library picture, apply (18 credits, about $0.04)
 * into a NEW post that starts pre-scanned while the original stays as it was. Everything deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test studio-ai-edit
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const POSTER = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/kasi-poster.jpg";
const SWAP = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples/aloe-ash-studio.jpg";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

/** Open a row of a group in the side panel (the first one by default). */
async function openRow(page: Page, group: string) {
  const row = page.locator("aside div.grid.gap-1").filter({ has: page.locator(`span.s-label:text-is("${group}")`) }).locator("button[aria-expanded]").first();
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
  return row;
}

test("scan once, keep it, swap from the Library, edit into a new post", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(720_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-aiedit-${stamp}@blinkspot-test.dev`;
  const password = `Ae-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "AI Edit Tester", onboarding_completed: true } });
  expect(error).toBeNull();
  let clientId: string | undefined;
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "AI Edit Tester", contact_name: "AI Edit Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 200 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "AI Edit Test", is_active: true, primary_color: "#E4572E" }).select("id").single();
    const { data: posts } = await sb.from("content").insert([
      { client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption: "E2E poster", image_urls: [POSTER] },
      { client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption: "E2E swap", image_urls: [SWAP] },
    ]).select("id, caption");
    const poster = posts!.find((p) => p.caption === "E2E poster")!;
    const balance = async () => ((await sb.from("credit_balances").select("balance").eq("client_id", clientId!).single()).data?.balance as number);

    await signIn(page, email, password);
    // 1. Scan: 4 credits, kept on the post with the brand on the ledger line.
    await page.goto(`${BASE}/studio/library/${poster.id}/edit`);
    const scanButton = page.getByRole("button", { name: /Scan it/ });
    await expect(scanButton).toContainText("4 cr", { timeout: 30_000 });
    await scanButton.click();
    await expect(page.getByText("Change what you want")).toBeVisible({ timeout: 120_000 });
    expect(await balance()).toBe(196);
    const { data: scanned } = await sb.from("content").select("xray").eq("id", poster.id).single();
    expect((scanned!.xray as { source: string }).source).toBe(POSTER);
    const { data: scanLine } = await sb.from("credit_transactions").select("amount, brand_id").eq("client_id", clientId!).eq("operation", "xray_analysis").single();
    expect(scanLine).toEqual({ amount: -4, brand_id: b!.id });
    await expect(page.locator("aside button[aria-expanded]").first()).toBeVisible();
    // Tappable areas sit on the picture.
    expect(await page.getByRole("button", { name: /^Edit / }).count()).toBeGreaterThan(1);

    // 2. Reopen: the saved scan, free.
    await page.reload();
    await expect(page.getByText("Saved scan")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Scan it/ })).toHaveCount(0);
    expect(await balance()).toBe(196);

    // 2b. Image Studio's Edit with AI tab is the same new editor (it showed the classic one until 10-15).
    await page.goto(`${BASE}/studio/image?mode=edit`);
    await page.getByTitle("E2E poster").click({ timeout: 30_000 });
    await expect(page.getByText("Saved scan")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("JSON Object Control")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pick another" })).toBeVisible();
    expect(await balance()).toBe(196);
    await page.goto(`${BASE}/studio/library/${poster.id}/edit`);
    await expect(page.getByText("Saved scan")).toBeVisible({ timeout: 30_000 });

    // 3. Change the words; the change survives a reload.
    await openRow(page, "Words");
    const words = page.getByRole("textbox", { name: / words$/ }).first();
    await words.fill("E2E SALE TODAY");
    await expect(page.getByRole("button", { name: /Apply 1 change/ })).toBeVisible();
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByText("Saved scan")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Apply 1 change/ })).toBeVisible({ timeout: 15_000 });

    // 4. Swap a thing for a Library picture.
    await openRow(page, "Things");
    await page.getByRole("button", { name: "Replace with…" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTitle("E2E swap").click({ timeout: 30_000 });
    await expect(page.getByText("Swapped for this picture")).toBeVisible();
    await expect(page.getByRole("button", { name: /Apply 2 changes/ })).toBeVisible();
    await page.screenshot({ path: "test-results/ai-edit-ready.png" });

    // 5. Apply: a new post, pre-scanned, 18 credits; the original untouched.
    await page.getByRole("button", { name: /Apply 2 changes/ }).click();
    await expect(page.getByText("Your edit is ready")).toBeVisible({ timeout: 300_000 });
    // The edited picture is what's on screen (loaded before "ready" shows).
    const after = page.getByRole("img", { name: "Your edited picture" });
    await expect(after).toHaveAttribute("src", /\/edit_\d+\.(jpg|png)$/);
    expect(await after.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: "test-results/ai-edit-result.png" });
    expect(await balance()).toBe(178);
    const { data: made } = await sb.from("content").select("id, caption, image_urls, xray, creation_metadata, generation_status_text, image_prompt_used").eq("client_id", clientId!).like("caption", "Edited ·%").single();
    expect(made!.caption).toBe("Edited · E2E poster");
    expect(made!.generation_status_text).toBeNull();
    const url = (made!.image_urls as string[])[0];
    console.log(`edit result ${url}\n--- prompt ---\n${made!.image_prompt_used}`);
    expect(url).toContain(`/assets/images/${clientId}/edit_`);
    expect((await fetch(url, { method: "HEAD" })).ok).toBe(true);
    expect((made!.xray as { from: string; source: string }).from).toBe("edit");
    expect((made!.xray as { source: string }).source).toBe(url);
    expect((made!.creation_metadata as { source_content_id: string }).source_content_id).toBe(poster.id);
    const { data: original } = await sb.from("content").select("image_urls").eq("id", poster.id).single();
    expect(original!.image_urls).toEqual([POSTER]);

    // 6. Keep editing the new one: already scanned, nothing charged.
    await page.getByRole("button", { name: "Keep editing this one" }).click();
    await expect(page.getByText("From your edit")).toBeVisible({ timeout: 30_000 });
    expect(await balance()).toBe(178);

    // 7. Refusals cost nothing: a made-up swap, no changes, someone else's post.
    const fake = await page.request.post(`${BASE}/api/ai-edit/apply`, { data: { contentId: made!.id, changes: { instruction: "make it evening" }, swaps: { [(made!.xray as { scan: { objects: Array<{ id: string }> } }).scan.objects[0].id]: { contentId: "00000000-0000-4000-8000-000000000000" } } } });
    expect(fake.status()).toBe(404);
    const none = await page.request.post(`${BASE}/api/ai-edit/apply`, { data: { contentId: made!.id, changes: {}, swaps: {} } });
    expect(none.status()).toBe(400);
    const { data: foreign } = await sb.from("content").select("id").neq("client_id", clientId!).not("image_urls", "is", null).limit(1).single();
    const theirs = await page.request.post(`${BASE}/api/ai-edit/scan`, { data: { contentId: foreign!.id } });
    expect(theirs.status()).toBe(404);
    expect(await balance()).toBe(178);
    expect(errors).toEqual([]);
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
