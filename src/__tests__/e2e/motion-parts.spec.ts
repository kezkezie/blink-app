import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Dragging what the AI made in the motion studio (Kezie, 2026-10-24: "we could drag it around, you
 * know, like almost like an image editor"). No AI call: a plan like KYRA's (a headline, two app
 * walkthrough steps, an end card) is put on the device, the studio opens on it. Picking scene 3
 * shows scene 3 on the canvas (it showed scene 1 in Kezie's screenshot), the label and the device
 * can be dragged and resized there, and the saved plan and the rendered clip carry where they went.
 * Deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test motion-parts --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 4; i++) {
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    if (await page.waitForURL(/\/(studio|welcome)/, { timeout: 20_000, waitUntil: "commit" }).then(() => true, () => false)) return;
  }
  throw new Error("couldn't sign in");
}

const keptSpec = (page: Page, brandId: string) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.value, `kept:motion:${brandId}:spec`);

test("the AI's parts can be dragged and resized on the canvas, on the right scene", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(300_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && process.env.SHOW_CONSOLE) console.log("console error:", m.text().slice(0, 400)); });
  page.on("requestfailed", (r) => { if (process.env.SHOW_CONSOLE) console.log("request failed:", r.url().slice(0, 160), r.failure()?.errorText); });
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-motionparts-${stamp}@blinkspot-test.dev`;
  const password = `Mp-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Motion Parts", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Motion Parts", contact_name: "Motion Parts", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 50 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kyra Test", is_active: true, primary_color: "#E10600", secondary_color: "#0B0B0C", primary_font: "Archivo Black" }).select("id").single();
    const brandId = b!.id as string;
    const shot = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/examples/kasi-reveal-frame.jpg`;
    const spec = {
      kind: "full", shape: "16:9", palette: { background: "#0B0B0C", text: "#FFFFFF", accent: "#E10600" },
      scenes: [
        { template: "kinetic-headline", seconds: 3.5, words: "Your KYRA tour in two steps", sub: "Here is what each part does", enter: "word" },
        { template: "screen", seconds: 5, image: shot, aspect: 1.5, box: [0.1, 0.1, 0.3, 0.2], label: "Pick your import", sub: "Curated cars from Japan", device: "laptop" },
        { template: "screen", seconds: 5, image: shot, aspect: 1.5, box: [0.55, 0.6, 0.3, 0.2], label: "One destination for imports", sub: "Everything for your car in Nairobi", device: "phone" },
        { template: "end-card", seconds: 1, cta: "Visit KYRA", logo: false },
      ],
    };
    // The plan and its pictures, as the plan route leaves them (a render only takes offered pictures).
    await page.addInitScript((items) => { for (const [key, value] of items) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); },
      [[`kept:motion:${brandId}:spec`, spec], [`kept:motion:${brandId}:pictures`, [{ url: shot, title: "Screenshot 1" }]]] as Array<[string, unknown]>);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email, password);
    await page.goto(`${BASE}/studio/motion`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Back to your motion" }).click({ timeout: 60_000 });
    const studio = page.getByRole("dialog", { name: "Motion", exact: true });
    await expect(studio.getByRole("button", { name: /^Make it/ })).toBeVisible({ timeout: 30_000 });
    const frame = studio.locator(".ms-frame");

    // Scene 3 on the canvas, not scene 1.
    await studio.getByRole("list", { name: "Scenes" }).getByRole("listitem").nth(2).click();
    await expect(frame.getByText("One destination for imports")).toBeVisible({ timeout: 15_000 });
    // The headline draws a word per span, so look for its words part.
    await expect(frame.locator('[data-part="words"]')).toHaveCount(0);
    await expect(frame.locator('[data-part="device"]')).toBeVisible();
    await page.screenshot({ path: "test-results/motion-parts-scene3.png" });

    // The label is a part you can grab: drag it up and left.
    const label = studio.getByRole("button", { name: "Part: Label" });
    await expect(label).toBeVisible();
    const before = (await label.boundingBox())!;
    const canvasBox = (await frame.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 - canvasBox.width * 0.2, before.y + before.height / 2 - canvasBox.height * 0.25, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await keptSpec(page, brandId)).scenes[2].parts?.label?.dx ?? 0, { timeout: 5000 }).toBeLessThan(-0.15);
    const moved = (await keptSpec(page, brandId)).scenes[2].parts.label;
    expect(moved.dy).toBeLessThan(-0.2);
    // The box followed the label on the canvas.
    const after = (await label.boundingBox())!;
    expect(after.x).toBeLessThan(before.x - canvasBox.width * 0.15);

    // Resize the device from a corner: it grows, keeping its shape.
    const device = studio.getByRole("button", { name: "Part: Screen" });
    await device.click();
    const d0 = (await device.boundingBox())!;
    const handle = device.locator(".ms-h.se");
    const h = (await handle.boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + canvasBox.width * 0.06, h.y + h.height / 2 + canvasBox.height * 0.06, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await keptSpec(page, brandId)).scenes[2].parts?.device?.scale ?? 1, { timeout: 5000 }).toBeGreaterThan(1.05);
    const d1 = (await device.boundingBox())!;
    expect(d1.width).toBeGreaterThan(d0.width * 1.05);
    await page.screenshot({ path: "test-results/motion-parts-moved.png" });

    // Undo the move from the inspector: "Put it back".
    await label.click();
    await studio.getByRole("button", { name: "Put it back" }).click();
    await expect.poll(async () => (await keptSpec(page, brandId)).scenes[2].parts?.label ?? null, { timeout: 5000 }).toBeNull();

    // Another scene's parts: the headline's words on scene 1.
    await studio.getByRole("list", { name: "Scenes" }).getByRole("listitem").nth(0).click();
    await expect(frame.locator('[data-part="words"]')).toContainText("KYRA", { timeout: 15_000 });
    await expect(frame.locator('[data-part="device"]')).toHaveCount(0);
    await expect(studio.getByRole("button", { name: "Part: Words" })).toBeVisible();
    await studio.getByRole("button", { name: "Part: Words" }).focus();
    await page.keyboard.press("Shift+ArrowDown");
    await expect.poll(async () => (await keptSpec(page, brandId)).scenes[0].parts?.words?.dy ?? 0, { timeout: 5000 }).toBeGreaterThan(0.015);

    // The render keeps the moves: the saved plan has them, and the clip lands in the Library.
    await studio.getByRole("button", { name: /^Make it/ }).click();
    await expect(page.getByText(/saved to your Library/)).toBeVisible({ timeout: 240_000 });
    const { data: row } = await sb.from("content").select("video_urls, creation_metadata").eq("client_id", clientId).eq("ai_model", "remotion").single();
    const saved = (row!.creation_metadata as { spec: { scenes: Array<{ parts?: Record<string, { dx: number; dy: number; scale: number }> }> } }).spec;
    expect(saved.scenes[0].parts?.words?.dy).toBeGreaterThan(0.015);
    expect(saved.scenes[2].parts?.device?.scale).toBeGreaterThan(1.05);
    console.log("motion with moved parts:", (row!.video_urls as string[])[0]);
    expect(errors).toEqual([]);
  } finally {
    if (clientId) {
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    // The clip this test rendered (only this throwaway account's folder).
    const { data: vids } = await sb.storage.from("assets").list(`videos/${u.user!.id}`);
    if (vids?.length) await sb.storage.from("assets").remove(vids.map((f) => `videos/${u.user!.id}/${f.name}`));
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
