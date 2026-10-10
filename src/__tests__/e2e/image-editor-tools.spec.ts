import { test, expect, type Page } from "@playwright/test";

/**
 * Image Editor tools in a real browser: transparent start, pen (draw, then edit points), eraser,
 * and undo/redo putting the pixels back exactly. Uses no AI and saves nothing.
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
