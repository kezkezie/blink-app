import { test, expect, type Page } from "@playwright/test";

/**
 * Image Editor tools in a real browser: transparent start, pen (draw, then edit points), eraser,
 * undo/redo putting the pixels back exactly, and picking several layers to delete at once. Uses no AI and saves nothing.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test image-editor-tools
 */

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
type Win = { __blinkEditorCanvas: { discardActiveObject(): void; renderAll(): void; getObjects(): Array<{ type: string }> } };

/** A fingerprint of the artwork (selection handles excluded). */
async function pixels(page: Page) {
  await page.evaluate(() => { const c = (window as unknown as Win).__blinkEditorCanvas; c.discardActiveObject(); c.renderAll(); });
  return page.evaluate(() => {
    const c = document.querySelector("canvas.lower-canvas") as HTMLCanvasElement;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let sum = 0; for (let i = 0; i < d.length; i += 97) sum += d[i] * 3 + d[i + 3];
    return sum;
  });
}

test("editor: transparent start, pen, edit points, eraser, undo", async ({ page }) => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD not set");
  test.setTimeout(240_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/studio/image?mode=design`);
  await page.getByRole("button", { name: "Blank canvas, transparent" }).click();
  const cv = page.locator("canvas.upper-canvas");
  await expect(cv).toBeVisible();
  await page.waitForTimeout(1000); // the canvas grows to fit the screen
  const b = (await cv.boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy });
  expect(await page.locator("canvas.lower-canvas").evaluate((c: HTMLCanvasElement) => c.getContext("2d")!.getImageData(5, 5, 1, 1).data[3])).toBe(0);

  // Pen: a triangle, closed by clicking the first point. Picking the tool must not move the canvas.
  await page.getByRole("button", { name: /^Pen \(P\)/ }).click();
  expect(Math.abs((await cv.boundingBox())!.y - b.y)).toBeLessThan(2);
  for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.5, 0.6], [0.3, 0.3]] as const) { const p = at(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); }
  await expect(page.getByLabel("Layer name")).toHaveCount(1);
  const drawn = await pixels(page);

  // Edit points: double-click the shape, drag the bottom point down.
  const mid = at(0.5, 0.42);
  await page.mouse.dblclick(mid.x, mid.y);
  await expect(page.getByText("Drag the white points")).toBeVisible({ timeout: 5000 });
  const bottom = at(0.5, 0.6);
  await page.mouse.move(bottom.x, bottom.y); await page.mouse.down();
  await page.mouse.move(bottom.x, bottom.y + b.height * 0.2, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Done" }).first().click();
  await page.waitForTimeout(500);
  const edited = await pixels(page);
  expect(edited).not.toBe(drawn);
  await page.keyboard.press("Meta+z"); await page.waitForTimeout(800);
  expect(await pixels(page)).toBe(drawn);
  await page.keyboard.press("Meta+Shift+z"); await page.waitForTimeout(800);
  expect(await pixels(page)).toBe(edited);

  // Eraser across the shape, then undo puts it back exactly.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Eraser \(E\)/ }).click();
  const s1 = at(0.25, 0.4), s2 = at(0.75, 0.45);
  await page.mouse.move(s1.x, s1.y); await page.mouse.down(); await page.mouse.move(s2.x, s2.y, { steps: 15 }); await page.mouse.up();
  await page.waitForTimeout(800);
  expect(await pixels(page)).not.toBe(edited);
  await page.keyboard.press("Meta+z"); await page.waitForTimeout(1200);
  expect(await pixels(page)).toBe(edited);
  expect(errors).toEqual([]);
});

test("editor: drag a layer by its grip to the top of the stack, one undo puts it back", async ({ page }) => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD not set");
  test.setTimeout(180_000);
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/studio/image?mode=design`);
  // A design kept from an earlier run opens by itself: start fresh.
  const fresh = page.getByRole("button", { name: "Start fresh" });
  if (await fresh.isVisible({ timeout: 4000 }).catch(() => false)) await fresh.click();
  await page.getByRole("button", { name: "Blank canvas, transparent" }).click();
  const cv = page.locator("canvas.upper-canvas");
  await expect(cv).toBeVisible();
  await page.waitForTimeout(800);
  const b = (await cv.boundingBox())!;
  for (const fx of [0.25, 0.5, 0.75]) {
    await page.getByRole("button", { name: "Shapes" }).click();
    await page.mouse.click(b.x + b.width * fx, b.y + b.height * 0.5);
    await page.waitForTimeout(200);
  }
  type W = { __blinkEditorCanvas: { getObjects(): Array<{ id?: string; excludeFromExport?: boolean }> } };
  const order = () => page.evaluate(() => (window as unknown as W).__blinkEditorCanvas.getObjects().filter((o) => !o.excludeFromExport).map((o) => o.id));
  const before = await order();
  expect(before).toHaveLength(3);
  const grips = page.getByRole("button", { name: "Drag to reorder" });
  await expect(grips).toHaveCount(3);
  // The list is top first: the last row is the bottom layer. Drag it above the first row.
  const from = (await grips.nth(2).boundingBox())!, to = (await grips.nth(0).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y - 6, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const after = await order();
  expect(after[after.length - 1]).toBe(before[0]); // the bottom layer is now on top
  expect(new Set(after)).toEqual(new Set(before));
  await page.keyboard.press("Meta+z"); await page.waitForTimeout(1000);
  expect(await order()).toEqual(before);
});

test("editor: pick several layers (Shift, Cmd, Select all) and delete them at once, one undo brings them back", async ({ page }) => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD not set");
  test.setTimeout(180_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/studio/image?mode=design`);
  const fresh = page.getByRole("button", { name: "Start fresh" });
  if (await fresh.isVisible({ timeout: 4000 }).catch(() => false)) await fresh.click();
  await page.getByRole("button", { name: "Blank canvas, transparent" }).click();
  const cv = page.locator("canvas.upper-canvas");
  await expect(cv).toBeVisible();
  await page.waitForTimeout(800);
  const b = (await cv.boundingBox())!;
  for (const fx of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    await page.getByRole("button", { name: "Shapes" }).click();
    await page.mouse.click(b.x + b.width * fx, b.y + b.height * 0.5);
    await page.waitForTimeout(200);
  }
  type W = { __blinkEditorCanvas: { getObjects(): Array<{ id?: string; excludeFromExport?: boolean }>; getActiveObjects(): unknown[] } };
  const ids = () => page.evaluate(() => (window as unknown as W).__blinkEditorCanvas.getObjects().filter((o) => !o.excludeFromExport).map((o) => o.id));
  const picked = () => page.evaluate(() => (window as unknown as W).__blinkEditorCanvas.getActiveObjects().length);
  const all = await ids();
  expect(all).toHaveLength(5);
  const rows = page.getByLabel("Layer order").locator(":scope > div");
  await expect(rows).toHaveCount(5);
  const at = { position: { x: 30, y: 12 } }; // the type label, past the grip and before the name box

  // Click, then Shift-click: a range of three.
  await rows.nth(0).click(at);
  await rows.nth(2).click({ ...at, modifiers: ["Shift"] });
  expect(await picked()).toBe(3);
  await expect(page.getByText("3 picked")).toBeVisible();
  // Cmd-click takes one away and adds another.
  await rows.nth(1).click({ ...at, modifiers: ["Meta"] });
  await rows.nth(4).click({ ...at, modifiers: ["Meta"] });
  expect(await picked()).toBe(3);
  // Delete them in one go: two stay.
  await page.getByRole("button", { name: "Delete 3 layers" }).click();
  await page.waitForTimeout(600);
  expect(await ids()).toHaveLength(2);
  await expect(rows).toHaveCount(2);
  await page.keyboard.press("Meta+z"); await page.waitForTimeout(1000);
  expect(new Set(await ids())).toEqual(new Set(all));

  // Select all, then delete: the canvas is empty; one undo puts all five back.
  await page.getByRole("button", { name: "Select all" }).click();
  await expect(page.getByText("5 picked")).toBeVisible();
  // The panel speaks for all of them: a colour goes on each, no Ungroup, Duplicate copies each.
  await expect(page.locator("b", { hasText: /^5 layers$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ungroup into layers" })).toHaveCount(0);
  await page.getByRole("button", { name: "Colour #FFFFFF" }).first().click();
  const fills = () => page.evaluate(() => (window as unknown as { __blinkEditorCanvas: { getObjects(): Array<{ fill?: unknown; excludeFromExport?: boolean }> } }).__blinkEditorCanvas.getObjects().filter((o) => !o.excludeFromExport).map((o) => String(o.fill).toUpperCase()));
  expect(await fills()).toEqual(Array(5).fill("#FFFFFF"));
  await page.screenshot({ path: "test-results/editor-layers-picked.png" });
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.waitForTimeout(600);
  expect(await ids()).toHaveLength(10);
  await expect(page.getByText("5 picked")).toBeVisible();
  await page.keyboard.press("Meta+z"); await page.waitForTimeout(1000);
  expect(await ids()).toHaveLength(5);
  await page.getByRole("button", { name: "Select all" }).click();
  await expect(page.getByText("5 picked")).toBeVisible();
  await page.getByRole("button", { name: "Delete 5 layers" }).click();
  await page.waitForTimeout(600);
  expect(await ids()).toHaveLength(0);
  await page.keyboard.press("Meta+z"); await page.waitForTimeout(1000);
  expect(new Set(await ids())).toEqual(new Set(all));
  expect(errors).toEqual([]);
});
