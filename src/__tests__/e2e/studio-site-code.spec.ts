import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Website studio (Kezie, 2026-10-16). LIVE on a throwaway account: a website the owner likes,
 * one page written with its code streaming in, a hand edit in the code, an AI change (version 2),
 * download, publish at /w/<slug> (sandboxed: opaque origin, CSP), the gallery card, take offline,
 * and the phone layout. Everything deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test studio-site-code --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EX = "https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/examples";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

test("website studio: a site you like, write, edit, change, publish, download", async ({ page, context }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(900_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-sitecode-${stamp}@blinkspot-test.dev`;
  const password = `Sc-${Math.random().toString(36).slice(2)}-${stamp}`;
  const slug = `e2e-kasi-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Site Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  if (process.env.DEBUG_SITE) page.on("console", (m) => { if (m.type() === "error") console.log(`[browser] ${m.text().slice(0, 300)}`); });
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Site Tester", contact_name: "Site Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 200 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({
      client_id: clientId, brand_name: "Kasi Kicks", industry: "Streetwear sneakers", description: "Sneakers and streetwear made for Nairobi streets, sold online and at our Westlands shop.",
      is_active: true, primary_color: "#E4572E", secondary_color: "#14141A", primary_font: "Space Grotesk", secondary_font: "Inter",
      dna: { location: "Nairobi", whatsapp: "+254 700 111 222", cta: "Order on WhatsApp", tagline: "Built for the streets" },
    }).select("id").single();
    await sb.from("content").insert([
      { client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "approved", caption: "Kasi Kicks poster: orange sneaker on concrete", image_urls: [`${EX}/kasi-poster.jpg`] },
    ]);
    const balance = async () => ((await sb.from("credit_balances").select("balance").eq("client_id", clientId!).single()).data?.balance as number);
    const pages = async () => ((await sb.from("site_pages").select("id, html, parent_id, slug, published_at, notes").eq("client_id", clientId!).order("created_at")).data ?? []);
    await signIn(page, email, password);

    // 1. Research, then one Editorial page, its code streaming into the card and the editor.
    await page.goto(`${BASE}/studio/sites`);
    await expect(page.getByRole("heading", { name: "Websites you can edit by sections or as code" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: /^Editorial/ }).click(); // one website, Editorial
    await page.getByLabel("What the site is for").fill("A launch page for our Runner 01 sneaker with a WhatsApp order button");
    // A website the owner likes (2026-10-27: picked, never searched for them); the page follows it.
    const liked = page.getByRole("group", { name: "Websites you like" });
    await liked.getByLabel("Website address").fill("kith.com");
    await liked.getByRole("button", { name: "Add", exact: true }).click();
    await expect(liked.getByRole("link", { name: /kith\.com/ })).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: /Write the website/ }).click();
    const card = page.getByRole("button", { name: "Editorial page, writing" });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(/Writing… \d+ KB/)).toBeVisible({ timeout: 90_000 });
    await card.click();
    await expect(page.locator('[data-testid="code-editor"] .cm-content')).toContainText(/<!doctype html/i, { timeout: 60_000 });
    await page.screenshot({ path: "test-results/site-code-writing.png" });
    await expect(page.getByRole("button", { name: /Download \.html/ })).toBeVisible({ timeout: 300_000 });
    expect(await balance()).toBe(170);
    const [first] = await pages();
    expect(first.notes).toBe("editorial");
    expect(first.html).toMatch(/^<!doctype html/i);
    expect(first.html).not.toMatch(/\{\{\s*(img|logo)/);
    expect(first.html).not.toMatch(/\bfetch\(|XMLHttpRequest|localStorage|<form\b/);
    fs.writeFileSync("test-results/site-code-v1.html", first.html);
    expect(first.html).toMatch(/data-section=/); // marked for Sections editing

    // 2. Sections (the default): click the headline on the page and type; swap a picture; hide a part.
    const editable = page.frameLocator('iframe[title="Website preview (click to edit)"]');
    await expect(editable.locator("body")).toContainText(/Kasi Kicks/i, { timeout: 30_000 });
    expect(await page.locator('iframe[title="Website preview (click to edit)"]').getAttribute("sandbox")).toBe("allow-scripts");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/site-code-sections.png" });
    await editable.locator("h1").first().click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.type("Fresh pairs every Friday");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 30_000 });
    const words = (html: string) => html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
    await expect.poll(async () => words((await pages())[0].html), { timeout: 15_000 }).toContain("Fresh pairs every Friday");
    expect((await pages())[0].html).not.toMatch(/data-bk-|contenteditable/);
    if (await editable.locator("img").count()) {
      await editable.locator("img").first().click();
      await page.getByRole("dialog").getByTitle(/Kasi Kicks poster/).click({ timeout: 30_000 });
      await expect.poll(async () => (await pages())[0].html, { timeout: 15_000 }).toContain("kasi-poster.jpg");
    }
    const list = page.getByRole("list", { name: "Sections" });
    const hideButtons = list.getByRole("button", { name: /^Hide / });
    await hideButtons.nth(1).click();
    await expect.poll(async () => (await pages())[0].html, { timeout: 15_000 }).toContain("data-hidden");
    await list.getByRole("button", { name: /^Show / }).first().click();
    await expect.poll(async () => (await pages())[0].html, { timeout: 15_000 }).not.toContain("data-hidden=\"\"");

    // Try it: the page's own links work in the app (they used to open BlinkSpot's sign-in inside the frame).
    await page.getByRole("tab", { name: "Try it" }).click();
    const tryIt = page.frameLocator('iframe[title="Website preview (try it)"]');
    await expect(tryIt.locator("body")).toContainText("Fresh pairs every Friday", { timeout: 30_000 });
    const anchor = tryIt.locator('a[href^="#"]').first();
    if (await anchor.count()) {
      await anchor.click();
      await page.waitForTimeout(800);
      await expect(tryIt.locator("body")).toContainText("Fresh pairs every Friday");
      await expect(tryIt.locator("body")).not.toContainText(/sign in|log in|password/i);
    }
    await page.getByRole("tab", { name: "Edit" }).click();

    // Full screen preview.
    await page.getByRole("button", { name: "Full screen", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /full screen/ })).toBeVisible();
    await page.getByRole("button", { name: "Close full screen" }).click();

    // 3. A hand edit in the Code view: saved, and the preview follows.
    await page.getByRole("tab", { name: "Code" }).click();
    const preview = page.frameLocator('iframe[title="Website preview"]');
    await expect(preview.locator("body")).toContainText("Fresh pairs every Friday", { timeout: 30_000 });
    await page.locator('[data-testid="code-editor"] .cm-content').click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.type("<!-- e2e hand edit -->\n");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 30_000 });
    expect((await pages())[0].html).toContain("<!-- e2e hand edit -->");

    // 3. An AI change: version 2, the first kept.
    await page.getByLabel("What to change").fill("Change the main hero headline to exactly: Kicks built for Nairobi streets");
    await page.getByRole("button", { name: /Change it/ }).click();
    await expect(page.getByText(/Changed\. This is v2/)).toBeVisible({ timeout: 280_000 });
    expect(await balance()).toBe(164);
    const [, second] = await pages();
    expect(second.parent_id).toBe(first.id);
    // Claude keeps the page's styling, so the words may be split by tags (<em>Nairobi</em>).
    expect(words(second.html)).toContain("Kicks built for Nairobi streets");
    expect(second.html).toContain("<!-- e2e hand edit -->");
    await expect(page.getByLabel("Version", { exact: true })).toHaveValue(second.id);
    await expect(preview.locator("body")).toContainText("Kicks built for Nairobi streets", { timeout: 30_000 });

    // 4. Download the file.
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download \.html/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.html$/);
    const saved = fs.readFileSync((await download.path())!, "utf8");
    expect(words(saved)).toContain("Kicks built for Nairobi streets");

    // 5. Publish at /w/<slug>: served sandboxed.
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.locator("#code-slug").fill(slug);
    await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText(/Live at/)).toBeVisible({ timeout: 30_000 });
    const res = await page.request.get(`${BASE}/w/${slug}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-security-policy"]).toMatch(/^sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'/);
    expect(res.headers()["content-security-policy"]).toContain("connect-src 'none'");
    expect(words(await res.text())).toContain("Kicks built for Nairobi streets");
    const live = await context.newPage();
    await live.goto(`${BASE}/w/${slug}`);
    await expect(live.locator("body")).toContainText("Kicks built for Nairobi streets");
    expect(await live.evaluate(() => { try { void document.cookie; return "readable"; } catch { return "blocked"; } })).toBe("blocked");
    expect(await live.evaluate(() => window.origin)).toBe("null");
    await live.close();

    // 6. The gallery: one card, v2, live.
    await page.getByRole("button", { name: "All pages" }).click();
    const galleryCard = page.locator("button.s-card").filter({ hasText: "v2" });
    await expect(galleryCard).toHaveCount(1);
    await expect(galleryCard.getByText("Live")).toBeVisible();
    await expect(galleryCard.frameLocator("iframe").locator("body")).toContainText("Nairobi streets", { timeout: 20_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "test-results/site-code-gallery.png", fullPage: true });

    // 7. Take it offline.
    await galleryCard.click();
    await page.getByRole("button", { name: "Live settings" }).click();
    await page.getByRole("button", { name: "Take offline" }).click();
    await expect(page.getByText("Taken offline.")).toBeVisible();
    expect((await page.request.get(`${BASE}/w/${slug}`)).status()).toBe(404);

    // 8. Phone: preview and code as tabs, nothing wider than the screen.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Show code" }).click();
    await expect(page.locator('[data-testid="code-editor"] .cm-content')).toBeVisible();
    await page.getByRole("tab", { name: "Show preview" }).click();
    await expect(page.locator('iframe[title="Website preview"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: "test-results/site-code-phone.png" });
    expect(errors.filter((e) => !/ResizeObserver/.test(e))).toEqual([]);
  } finally {
    if (clientId) {
      await sb.from("site_pages").delete().eq("client_id", clientId);
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
