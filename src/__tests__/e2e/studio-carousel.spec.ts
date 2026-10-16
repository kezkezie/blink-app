import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Carousels (Kezie, 2026-10-16). LIVE on a throwaway account: a topic carousel (outline 4 credits,
 * slides drawn in this browser), one from two Library pictures, a seamless one (one 21:9 picture
 * cut into 3 slides, Best quality), the Library card's swipe, the viewer's slides, and editing slide
 * 2 back into place. Everything deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test studio-carousel --workers=1
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
const sizes = (page: Page, urls: string[]) => page.evaluate((list) => Promise.all(list.map((u) => new Promise<[number, number]>((r) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r([0, 0]); i.src = u; }))), urls);

test("carousels: topic, pictures, seamless; swipe; edit a slide", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(900_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-carousel-${stamp}@blinkspot-test.dev`;
  const password = `Cr-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Carousel Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  const errors: string[] = []; page.on("pageerror", (e) => { errors.push(e.message); if (process.env.DEBUG_CAROUSEL) console.log(`[pageerror] ${page.url()}\n${(e.stack ?? "").split("\n").slice(0, 8).join("\n")}`); });
  if (process.env.DEBUG_CAROUSEL) page.on("console", (m) => { if (m.type() === "error") console.log(`[browser] ${m.text().slice(0, 300)}`); });
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Carousel Tester", contact_name: "Carousel Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 100 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", industry: "Streetwear sneakers", is_active: true, primary_color: "#E4572E", secondary_color: "#14141A", primary_font: "Space Grotesk" }).select("id").single();
    await sb.from("content").insert([
      { client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption: "E2E kasi", image_urls: [`${EX}/kasi-poster.jpg`] },
      { client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption: "E2E aloe", image_urls: [`${EX}/aloe-ash-studio.jpg`] },
    ]);
    const balance = async () => ((await sb.from("credit_balances").select("balance").eq("client_id", clientId!).single()).data?.balance as number);
    const carousels = async () => ((await sb.from("content").select("id, image_urls, creation_metadata, caption").eq("client_id", clientId!).eq("content_type", "carousel").order("created_at")).data ?? []);
    await signIn(page, email, password);

    // 1. From a topic: outline, a word changed, slides drawn here.
    await page.goto(`${BASE}/studio/image?mode=carousel`);
    await page.getByLabel("What the carousel is about").fill("5 ways to keep your sneakers clean, from the Kasi Kicks team");
    await page.getByRole("button", { name: "5", exact: true }).click();
    await page.getByRole("button", { name: /Write the slides/ }).click();
    await expect(page.getByLabel("Headline")).toBeVisible({ timeout: 120_000 });
    expect(await balance()).toBe(96);
    await page.getByLabel("Headline").fill("Keep your kicks fresh");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/carousel-topic-preview.png", fullPage: true });
    await page.getByRole("button", { name: /Make the carousel/ }).click();
    await expect(page.getByText(/Your carousel · 5 slides/)).toBeVisible({ timeout: 180_000 });
    const [topic] = await carousels();
    const topicSlides = topic.image_urls as string[];
    expect(topicSlides).toHaveLength(5);
    expect(await sizes(page, topicSlides)).toEqual(Array(5).fill([1080, 1350]));
    expect((topic.creation_metadata as { kind: string }).kind).toBe("topic");
    fs.writeFileSync("test-results/carousel-topic-slides.json", JSON.stringify(topicSlides));

    // 2. From two Library pictures, fitted to 4:5.
    await page.getByRole("tab", { name: "From pictures" }).click();
    for (const title of ["E2E kasi", "E2E aloe"]) {
      await page.getByRole("button", { name: "Add a picture" }).click();
      await page.getByRole("dialog").getByTitle(title).click({ timeout: 30_000 });
    }
    await page.getByRole("button", { name: /Make the carousel/ }).click();
    await expect(page.getByText(/Your carousel · 2 slides/)).toBeVisible({ timeout: 120_000 });
    const pictures = (await carousels())[1];
    expect(await sizes(page, pictures.image_urls as string[])).toEqual([[1080, 1350], [1080, 1350]]);

    // 3. Seamless: one wide picture cut into 3 slides.
    await page.getByRole("tab", { name: "Seamless" }).click();
    await page.getByLabel("The wide picture").fill("Three Kasi Kicks sneakers in a row on a long concrete ledge at golden hour, a single orange stripe of paint running along the ledge behind them");
    await page.getByRole("button", { name: /Make it/ }).click();
    await expect(page.getByText(/Your carousel · 3 slides/)).toBeVisible({ timeout: 400_000 });
    const seamless = (await carousels())[2];
    const sSlides = seamless.image_urls as string[];
    expect(await sizes(page, sSlides)).toEqual(Array(3).fill([1080, 1350]));
    expect((seamless.creation_metadata as { panorama?: string }).panorama).toMatch(/^https:\/\//);
    fs.writeFileSync("test-results/carousel-seamless-slides.json", JSON.stringify(sSlides));

    // 4. The Library: one card per carousel, swipe on the card, slides in the viewer.
    await page.goto(`${BASE}/studio/library`);
    // Newest first: seamless, pictures, then the topic carousel (5 slides).
    const card = page.locator(".s-media").nth(2);
    await expect(card.getByText("1/5")).toBeVisible({ timeout: 30_000 });
    await card.hover();
    await card.getByLabel("Next slide").click();
    await expect(card.getByText("2/5")).toBeVisible();
    await card.getByRole("button", { name: /^View / }).click();
    const viewer = page.getByRole("dialog");
    await expect(viewer.getByText("slide 1 of 5")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByText("slide 2 of 5")).toBeVisible();
    await expect(viewer.getByRole("link", { name: "Edit slide 2" })).toHaveAttribute("href", `/studio/image?mode=design&content=${topic.id}&slide=1`);

    // 5. Edit slide 2 in the Editor and save it back in place.
    await page.goto(`${BASE}/studio/image?mode=design&content=${topic.id}&slide=1`);
    await page.getByRole("button", { name: "Save to slide 2" }).click({ timeout: 60_000 });
    await expect(page.getByText("Slide 2 saved in the carousel")).toBeVisible({ timeout: 60_000 });
    const after = (await carousels())[0];
    expect((after.image_urls as string[])[1]).not.toBe(topicSlides[1]);
    expect((after.image_urls as string[])[0]).toBe(topicSlides[0]);
    expect((after.creation_metadata as { replaced_slides: Array<{ slide: number; url: string }> }).replaced_slides[0]).toMatchObject({ slide: 1, url: topicSlides[1] });
    expect(errors.filter((e) => !/ResizeObserver/.test(e))).toEqual([]);
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
