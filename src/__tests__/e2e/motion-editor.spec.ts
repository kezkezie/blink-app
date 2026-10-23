import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The motion studio as a canvas editor (Kezie, 2026-10-23: "enlarging images, or placing images in
 * various locations while editing", Looks from Lemo-Opuscar, a revamped UI). Throwaway account,
 * renders in the browser (one small planning call). Adds words and a picture as free layers, moves
 * and resizes them on the canvas (the picture keeps its shape), uses the right-click menu, applies
 * the Swiss Motion look, and renders: the saved spec carries the layers and the look. Deleted after.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test motion-editor --workers=1
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
const num = async (page: Page, label: string) => Number(await page.getByLabel(label, { exact: true }).inputValue());

test("free layers: add, move, resize, arrange, a look, and a render that keeps them", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(400_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-motioned-${stamp}@blinkspot-test.dev`;
  const password = `Me-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Motion Editor", onboarding_completed: true } });
  const tmp = path.join(os.tmpdir(), `motion-layer-${stamp}.jpg`);
  fs.writeFileSync(tmp, Buffer.from(await (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/examples/kasi-reveal-frame.jpg`)).arrayBuffer()));
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "Motion Editor", contact_name: "Motion Editor", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 50 }, { onConflict: "client_id" });
    await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", is_active: true, primary_color: "#E4572E", secondary_color: "#14141A", primary_font: "Space Grotesk" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email, password);
    await page.goto(`${BASE}/studio/motion`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /9:16/ }).click();
    await page.getByLabel("What the motion is for").fill("A 5 second intro for our Drop 01 sneaker launch: the words Drop 01, then an end card saying Shop the drop");
    await page.getByRole("button", { name: /Write it/ }).click();
    const studio = page.getByRole("dialog", { name: "Motion", exact: true });
    await expect(studio.getByRole("button", { name: /^Make it/ })).toBeVisible({ timeout: 120_000 });

    // Words: a layer appears, selected, and its words can be typed.
    await studio.getByRole("navigation", { name: "Motion tools" }).getByRole("button", { name: /Text/ }).click();
    const words = studio.getByRole("button", { name: "Layer: Your words" });
    await expect(words).toBeVisible();
    await studio.getByLabel("Layer words").fill("Free words");
    await expect(studio.getByRole("button", { name: "Layer: Free words" })).toBeVisible();

    // Move it by dragging: X goes up; then make it bigger from a corner.
    const box = (await studio.getByRole("button", { name: "Layer: Free words" }).boundingBox())!;
    const x0 = await num(page, "X %"), w0 = await num(page, "Width %");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 60, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await num(page, "X %")).toBeGreaterThan(x0 + 5);
    const corner = async () => { const h = (await studio.locator(".ms-box.sel .ms-h.se").boundingBox({ timeout: 5000 }))!; return { x: h.x + h.width / 2, y: h.y + h.height / 2 }; };
    // Smaller from the corner (it hangs off the right edge now, and its handle still works).
    let c0 = await corner();
    await page.mouse.move(c0.x, c0.y);
    await page.mouse.down(); await page.mouse.move(c0.x - 60, c0.y - 10, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await num(page, "Width %")).toBeLessThan(w0 - 5);
    c0 = await corner();
    const w1 = await num(page, "Width %");
    await page.mouse.move(c0.x, c0.y);
    await page.mouse.down(); await page.mouse.move(c0.x + 30, c0.y + 20, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await num(page, "Width %")).toBeGreaterThan(w1 + 5);

    // A picture (uploaded), enlarged from a corner: it keeps its shape.
    await studio.getByRole("navigation", { name: "Motion tools" }).getByRole("button", { name: /Picture/ }).click();
    await studio.getByLabel("Picture layer file").setInputFiles(tmp);
    const pic = studio.getByRole("button", { name: "Layer: Picture" });
    await expect(pic).toBeVisible({ timeout: 30_000 });
    const ratio = async () => (await num(page, "Height %")) / (await num(page, "Width %"));
    const r0 = await ratio();
    const pb = (await pic.boundingBox())!;
    const pc = await corner();
    await page.mouse.move(pc.x, pc.y);
    await page.mouse.down(); await page.mouse.move(pc.x + 50, pc.y + 10, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(300);
    expect(Math.abs((await ratio()) - r0)).toBeLessThan(0.02);
    expect((await pic.boundingBox())!.width).toBeGreaterThan(pb.width + 30);

    // Right-click: send the picture to the back (it lists last in the layer list, which is top first).
    await pic.click({ button: "right" });
    await studio.getByRole("menuitem", { name: "Send to back" }).click();
    await studio.getByRole("button", { name: "Back to the scene" }).click();
    const listed = await studio.locator(".ms-layer").allTextContents();
    expect(listed.map((t) => t.trim())).toEqual(["Free words", "Picture"]);
    await page.screenshot({ path: "test-results/motion-editor-layers.png" });

    // A look: Swiss Motion, with the brand colour as the accent.
    await studio.getByRole("button", { name: "Looks", exact: true }).first().click();
    const looks = page.getByRole("dialog", { name: "Looks" });
    await looks.getByRole("option", { name: /Swiss Motion/ }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: "test-results/motion-editor-looks.png" });
    await looks.getByRole("button", { name: /^Use Swiss Motion/ }).click();
    await expect(looks).toBeHidden();
    await expect(studio.getByText("Swiss Motion", { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "test-results/motion-editor-swiss.png" });

    // Render: the clip saves, and its spec keeps the layers and the look.
    await studio.getByRole("button", { name: /^Make it/ }).click();
    await expect(page.getByText(/saved to your Library/)).toBeVisible({ timeout: 200_000 });
    const { data: row } = await sb.from("content").select("video_urls, creation_metadata").eq("client_id", clientId).eq("ai_model", "remotion").single();
    const saved = (row!.creation_metadata as { spec: { look?: string; font?: string; scenes: Array<{ layers?: Array<{ kind: string }> }> } }).spec;
    expect(saved.look).toBe("swiss");
    expect(saved.font).toBe("Archivo");
    expect(saved.scenes.flatMap((s) => s.layers ?? []).map((l) => l.kind).sort()).toEqual(["image", "text"]);
    console.log(`motion with layers + look: ${(row!.video_urls as string[])[0]}`);
    expect(errors).toEqual([]);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
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
