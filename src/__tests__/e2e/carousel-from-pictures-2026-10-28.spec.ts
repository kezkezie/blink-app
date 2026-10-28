import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

/**
 * Separate pictures posted as one carousel (Kezie, 2026-10-28: "pick pictures that are not in a
 * carousel form, but then post it as carousels... different slides, of different images in one
 * post"). Library: select pictures in order, Make a carousel. Carousel Studio opens with them in
 * that order, shown whole (a tall poster isn't cropped). The post page shows every slide and
 * changes their order, takes one out, adds one. Nothing is posted. Throwaway account and its own
 * files, deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test carousel-from-pictures-2026-10-28 --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const pixel = async (url: string, x: number, y: number) => {
  const buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(30_000) })).arrayBuffer());
  const img = sharp(buf);
  const { width, height } = await img.metadata();
  const raw = await img.removeAlpha().raw().toBuffer();
  const i = (y * width! + x) * 3;
  return { width, height, r: raw[i], g: raw[i + 1], b: raw[i + 2] };
};

test("pictures picked in the Library become one carousel post, slides in order", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(480_000);
  // A stalled connection fails in 30 s instead of hanging the run (and skipping the clean-up).
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false }, global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(30_000) }) } });
  const stamp = Date.now();
  const email = `e2e-carouselpics-${stamp}@blinkspot-test.dev`, password = `Cp-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Carousel Pictures", onboarding_completed: true } });
  let clientId = "";
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  // Nothing goes out to a network from this test.
  await page.route("**/api/social/**", (r) => r.abort());
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Carousel Pictures", contact_name: "Carousel Pictures", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Nuf Test Farm", industry: "Farming", is_active: true }).select("*").single();

    // Three single pictures of three shapes: a tall red poster, a wide green field, a blue square.
    const make = async (name: string, w: number, h: number, rgb: [number, number, number]) => {
      const png = await sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();
      const path = `images/${clientId}/e2e_${name}_${stamp}.png`;
      await sb.storage.from("assets").upload(path, png, { contentType: "image/png" });
      const url = sb.storage.from("assets").getPublicUrl(path).data.publicUrl;
      const { data } = await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "post_image", status: "draft", caption: name, image_urls: [url] }).select("id").single();
      return data!.id as string;
    };
    const red = await make("Red poster", 1080, 1920, [220, 30, 30]);
    const green = await make("Green field", 1600, 900, [30, 200, 60]);
    const blue = await make("Blue square", 1000, 1000, [30, 60, 220]);

    await page.addInitScript((brand) => { localStorage.setItem("blink-active-brand", JSON.stringify({ state: { activeBrand: brand }, version: 0 })); localStorage.setItem("blink.tourDone", "1"); }, b);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });

    // 1. Library: pick green, red, blue; each shows its place; Make a carousel (3).
    await page.goto(`${BASE}/studio/library`);
    await page.getByRole("tab", { name: "Images" }).click();
    await expect(page.getByRole("button", { name: "View Green field" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Select", exact: true }).click();
    const card = (n: string) => page.getByRole("link", { name: n, exact: true });
    await card("Green field").click(); await card("Red poster").click(); await card("Blue square").click();
    await expect(card("Green field").getByLabel("Picked 1")).toBeVisible();
    await expect(card("Red poster").getByLabel("Picked 2")).toBeVisible();
    await expect(card("Blue square").getByLabel("Picked 3")).toBeVisible();
    await expect(page.getByRole("button", { name: /Edit together/ })).toHaveCount(0); // pictures only here
    await page.screenshot({ path: "test-results/carousel-pics-library.png" });
    await page.getByRole("button", { name: "Make a carousel (3)" }).click();

    // 2. Carousel Studio: From pictures, the three in the picked order, shown whole by default.
    await page.waitForURL(/\/studio\/image\?mode=carousel$/, { timeout: 30_000 });
    await expect(page.getByRole("tab", { name: "From pictures" })).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
    const strip = page.getByRole("list", { name: "Slides" });
    await expect(strip.getByRole("listitem")).toHaveCount(3, { timeout: 30_000 });
    await expect(strip.getByRole("listitem").nth(0).getByRole("img", { name: "Green field" })).toBeVisible();
    await expect(strip.getByRole("listitem").nth(1).getByRole("img", { name: "Red poster" })).toBeVisible();
    await expect(strip.getByRole("listitem").nth(0).getByText("Cover")).toBeVisible();
    await expect(page.getByRole("button", { name: "Show it whole" })).toHaveAttribute("aria-pressed", "true");
    // The previews really show (decoded pixels, not just an img tag).
    await expect.poll(() => strip.locator("img").evaluateAll((els) => els.filter((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0).length), { timeout: 30_000 }).toBe(6);
    await page.screenshot({ path: "test-results/carousel-pics-studio.png" });
    await page.getByRole("button", { name: /Make the carousel/ }).click();
    await expect(page.getByText("Your carousel · 3 slides")).toBeVisible({ timeout: 60_000 });

    // The post: a carousel, its slides in order, where they came from, each 4:5, the tall poster whole.
    const { data: made } = await sb.from("content").select("id, content_type, image_urls, creation_metadata").eq("client_id", clientId).eq("content_type", "carousel").single();
    const slides = made!.image_urls as string[];
    expect(slides).toHaveLength(3);
    expect((made!.creation_metadata as { from?: string[]; fit?: string }).from).toEqual([green, red, blue]);
    expect((made!.creation_metadata as { fit?: string }).fit).toBe("whole");
    const cover = await pixel(slides[0], 540, 675);
    expect([cover.width, cover.height]).toEqual([1080, 1350]);
    expect(cover.g).toBeGreaterThan(150); // green in the middle
    const posterMiddle = await pixel(slides[1], 540, 675), posterEdge = await pixel(slides[1], 540, 8), posterSide = await pixel(slides[1], 30, 675);
    expect(posterMiddle.r).toBeGreaterThan(180); // the poster
    expect(posterEdge.r).toBeGreaterThan(180); // its top isn't cropped off: the full height fits
    expect(posterSide.r).toBeGreaterThan(posterSide.g); // the side band: a soft red blur, not black
    expect(posterSide.r).toBeLessThan(posterMiddle.r); // and darker than the poster itself

    // 3. The post page: every slide, one at a time.
    await page.getByRole("link", { name: "Open the post" }).click();
    await page.waitForURL(new RegExp(`/studio/library/${made!.id}`));
    await expect(page.getByText("1 / 3")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Carousel · 3 slides")).toBeVisible();
    await page.getByRole("button", { name: "Next slide" }).click();
    await expect(page.getByText("2 / 3")).toBeVisible();
    const big = page.getByRole("button", { name: "View full size" }).getByRole("img");
    await expect(big).toHaveAttribute("alt", /slide 2 of 3/);
    await expect.poll(() => big.evaluate((e) => { const i = e as HTMLImageElement; return i.complete && i.naturalWidth > 0 ? i.currentSrc : ""; }), { timeout: 30_000 }).toBe(slides[1]);
    await expect(page.getByRole("link", { name: "Edit slide 2" })).toHaveAttribute("href", `/studio/image?mode=design&content=${made!.id}&slide=1`);
    await expect(page.getByRole("link", { name: /Edit with AI/ })).toHaveCount(0); // one-picture tools stay off a carousel
    await page.screenshot({ path: "test-results/carousel-pics-post.png" });

    // Change the order, take one out, add one: saved on the post.
    const group = page.getByRole("group", { name: "Slides" });
    await group.getByRole("button", { name: "Move slide 2 left" }).click();
    await expect(page.getByText("Slide moved to the cover.")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => ((await sb.from("content").select("image_urls").eq("id", made!.id).single()).data!.image_urls as string[])[0], { timeout: 15_000 }).toBe(slides[1]);
    await group.getByRole("button", { name: "Take out slide 3" }).click();
    await expect(page.getByText("Slide 3 taken out.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("2 / 2")).toBeVisible(); // it shows the slide that took its place
    await group.getByRole("button", { name: "Add a slide" }).click();
    const picker = page.getByRole("dialog", { name: "Add a slide" });
    await picker.getByRole("button", { name: "Blue square" }).click({ timeout: 20_000 });
    await expect(page.getByText("Added as slide 3.")).toBeVisible({ timeout: 30_000 });
    const after = (await sb.from("content").select("image_urls").eq("id", made!.id).single()).data!.image_urls as string[];
    expect(after.slice(0, 2)).toEqual([slides[1], slides[0]]);
    expect(after).toHaveLength(3);
    const added = await pixel(after[2], 540, 675);
    expect([added.width, added.height]).toEqual([1080, 1350]); // the cover's shape
    expect(added.b).toBeGreaterThan(180);

    // 4. A single picture offers to become a carousel.
    await page.goto(`${BASE}/studio/library/${red}`);
    await expect(page.getByRole("button", { name: "Make it a carousel" })).toBeVisible({ timeout: 30_000 });

    // 5. A phone: nothing wider than the screen on the carousel's page.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/studio/library/${made!.id}`);
    await expect(page.getByText("1 / 3")).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
    await page.screenshot({ path: "test-results/carousel-pics-phone.png" });
    expect(errors.filter((e) => !/hydrat/i.test(e))).toEqual([]);
  } finally {
    if (clientId) {
      const { data: files } = await sb.storage.from("assets").list(`images/${clientId}`, { limit: 100 });
      if (files?.length) await sb.storage.from("assets").remove(files.map((f) => `images/${clientId}/${f.name}`));
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
