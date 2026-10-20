import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Magic outline and the AI eraser (2026-10-20). LIVE on a throwaway account, 13 credits: a made-up
 * photo (a navy square and an orange circle on beige). The outline goes round the square by moving
 * along its edges and erases it (checked pixel by pixel near the edge: the line has to snap); then
 * the photo is mapped, the circle clicked and erased with AI (the circle's centre turns background).
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test editor-outline-eraser --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const W = 1080, H = 1350;
const SQUARE = { x0: 200, y0: 300, x1: 600, y1: 700 };
const CIRCLE = { cx: 760, cy: 1000, r: 160 };

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}

/** The photo layer's own pixel at natural (x, y): [r, g, b, a]. */
async function photoPixel(page: Page, x: number, y: number) {
  return page.evaluate(([px, py]) => {
    type Img = { type: string; getElement(): CanvasImageSource & { naturalWidth?: number; width: number; naturalHeight?: number; height: number } };
    const c = (window as unknown as { __blinkEditorCanvas: { getObjects(): Img[] } }).__blinkEditorCanvas;
    const img = c.getObjects().find((o) => o.type === "image" || o.type === "Image")!;
    const el = img.getElement();
    const cv = document.createElement("canvas");
    cv.width = el.naturalWidth || el.width; cv.height = el.naturalHeight || el.height;
    const g = cv.getContext("2d")!;
    g.drawImage(el, 0, 0);
    // The photo may come back at another size (the eraser's 2048 cap): scale the point.
    const sx = cv.width / 1080, sy = cv.height / 1350;
    return Array.from(g.getImageData(Math.round(px * sx), Math.round(py * sy), 1, 1).data);
  }, [x, y]);
}

test("magic outline erases a shape along its edges; the AI eraser removes a mapped thing", async ({ page, browser }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(480_000);
  // The made-up photo, drawn in a browser page.
  const art = await browser.newPage({ viewport: { width: W, height: H } });
  await art.setContent(`<body style="margin:0"><canvas id="c" width="${W}" height="${H}"></canvas><script>
    const g = document.getElementById("c").getContext("2d");
    g.fillStyle = "#D9D4CA"; g.fillRect(0, 0, ${W}, ${H});
    for (let i = 0; i < 4000; i++) { g.fillStyle = "rgba(0,0,0," + (Math.random() * 0.04) + ")"; g.fillRect(Math.random() * ${W}, Math.random() * ${H}, 2, 2); }
    g.fillStyle = "#1B2A4A"; g.fillRect(${SQUARE.x0}, ${SQUARE.y0}, ${SQUARE.x1 - SQUARE.x0}, ${SQUARE.y1 - SQUARE.y0});
    g.fillStyle = "#F08A24"; g.beginPath(); g.arc(${CIRCLE.cx}, ${CIRCLE.cy}, ${CIRCLE.r}, 0, Math.PI * 2); g.fill();
  </script></body>`);
  const png = await art.locator("#c").screenshot();
  await art.close();

  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-eraser-${stamp}@blinkspot-test.dev`;
  const password = `Er-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Eraser Tester", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Eraser Tester", contact_name: "Eraser Tester", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 50 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Beige Studio", is_active: true, primary_color: "#1B2A4A", secondary_color: "#F08A24" }).select("id").single();
    const path = `images/${clientId}/e2e_photo_${stamp}.png`;
    await sb.storage.from("assets").upload(path, png, { contentType: "image/png" });
    const url = sb.storage.from("assets").getPublicUrl(path).data.publicUrl;
    const { data: post } = await sb.from("content").insert({ client_id: clientId, brand_id: b!.id, content_type: "post_image", image_urls: [url], caption: "Test photo", status: "draft" }).select("id").single();

    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email, password);
    await page.goto(`${BASE}/studio/image?mode=design&content=${post!.id}`);
    const cv = page.locator("canvas.upper-canvas");
    await expect(cv).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __blinkEditorCanvas?: { getObjects(): unknown[] } }).__blinkEditorCanvas?.getObjects().length ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1200); // the canvas grows to fit
    const box = (await cv.boundingBox())!;
    const at = (x: number, y: number) => ({ x: box.x + (x / W) * box.width, y: box.y + (y / H) * box.height });
    const moveTo = async (x: number, y: number, steps = 24) => { const p = at(x, y); await page.mouse.move(p.x, p.y, { steps }); };

    // ---- Magic outline round the square: click near its left edge, move roughly along the edges
    // (10 px off, so the snapping has to do the work), close on the first point.
    await page.getByRole("button", { name: /^Magic outline \(M\)/ }).click();
    const start = at(SQUARE.x0 + 4, 500);
    await page.mouse.click(start.x, start.y);
    await moveTo(SQUARE.x0 + 8, SQUARE.y0 + 10);
    await moveTo(SQUARE.x1 - 10, SQUARE.y0 - 8);
    await moveTo(SQUARE.x1 + 8, SQUARE.y1 - 10);
    await moveTo(SQUARE.x0 + 10, SQUARE.y1 + 8);
    await moveTo(SQUARE.x0 - 6, 520);
    await page.mouse.click(start.x, start.y);
    const panel = page.getByRole("region", { name: "Magic outline" });
    await expect(panel.getByText("Outlined. What should happen to it?")).toBeVisible({ timeout: 10_000 });
    await panel.getByRole("button", { name: /Erase it \(see-through\)/ }).click();
    await expect(page.getByText("Erased what you outlined.")).toBeVisible({ timeout: 30_000 });
    // Inside the square (even 8 px from its edge) is gone; 8 px outside is still the beige.
    expect((await photoPixel(page, 400, 500))[3]).toBe(0);
    expect((await photoPixel(page, SQUARE.x0 + 8, 500))[3]).toBe(0);
    expect((await photoPixel(page, 400, SQUARE.y0 + 8))[3]).toBe(0);
    const outside = await photoPixel(page, SQUARE.x0 - 8, 500);
    expect(outside[3]).toBe(255); expect(outside[0]).toBeGreaterThan(180);
    const outsideTop = await photoPixel(page, 400, SQUARE.y0 - 8);
    expect(outsideTop[3]).toBe(255); expect(outsideTop[0]).toBeGreaterThan(180);

    // ---- AI eraser: map the photo, click the circle, erase it.
    await page.keyboard.press("a");
    const cc = at(CIRCLE.cx, CIRCLE.cy);
    // The first click on the photo starts the eraser on it (and leaves a dot to clear).
    await page.mouse.click(cc.x, cc.y);
    const eraser = page.getByRole("region", { name: "AI eraser" });
    await eraser.getByRole("button", { name: "Clear" }).click();
    await eraser.getByRole("button", { name: /Map the photo/ }).click();
    await expect(eraser.getByText(/^Mapped: \d+ things/)).toBeVisible({ timeout: 200_000 });
    await page.mouse.move(cc.x - 4, cc.y - 4);
    await page.mouse.move(cc.x, cc.y);
    await page.mouse.click(cc.x, cc.y);
    await eraser.getByRole("button", { name: /Erase it/ }).click();
    await expect(page.getByText(/^Erased · 8 credits/)).toBeVisible({ timeout: 150_000 });
    const centre = await photoPixel(page, CIRCLE.cx, CIRCLE.cy);
    console.log("circle centre after AI erase", centre, "outside", outside);
    // Orange was (240, 138, 36): now close to the beige (217, 212, 202), blue far above orange's 36.
    expect(centre[2]).toBeGreaterThan(150);
    expect(Math.abs(centre[0] - centre[2])).toBeLessThan(50);
    // The square's hole is still there (see-through areas stay see-through).
    expect((await photoPixel(page, 400, 500))[3]).toBeLessThan(30);
    const { data: bal } = await sb.from("credit_balances").select("balance").eq("client_id", clientId).single();
    expect(bal!.balance).toBe(50 - 5 - 8);
  } finally {
    if (clientId) {
      const { data: files } = await sb.storage.from("assets").list(`images/${clientId}`, { limit: 200 });
      if (files?.length) await sb.storage.from("assets").remove(files.map((f) => `images/${clientId}/${f.name}`));
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
