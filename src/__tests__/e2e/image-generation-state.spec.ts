/**
 * Image Studio Completion Plan — Slice 3 browser acceptance.
 *
 * Drives the unified generation/billing/retry status surface through its major
 * paths with a real login and fully mocked paid calls: success (charged),
 * failed-charged, failed-refunded, and a retry. Asserts the persistent in-page
 * status panel renders each state, no blocking dialog is used, and each action
 * fires exactly one generation request (retry never duplicates a run).
 *
 * The timeout path and every transition/billing combination are covered
 * deterministically in src/__tests__/unit/image-generation-state.test.ts;
 * forcing a real client-side generation timeout in the browser would require
 * changing the 800s generation timeout, which is outside this slice's boundary.
 *
 * Run: npx playwright test image-generation-state --headed
 */

import { test, expect, type Page } from "@playwright/test";

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

const CLOUDINARY_IMG = "https://res.cloudinary.com/demo/image/upload/blinkspot-e2e.jpg";

type WorkflowResponse = Record<string, unknown>;

async function login(page: Page) {
  if (!email || !password) throw new Error("E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be configured");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/dashboard(?:\/|$)/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({ timeout: 10_000 });
}

test("Image Studio surfaces unified generation, billing, and retry state", async ({ page }) => {
  test.setTimeout(90_000);

  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  let generationRequests = 0;
  // The route handler serves whatever the current scenario needs.
  let nextWorkflowResponse: WorkflowResponse = { success: true, imageUrls: [CLOUDINARY_IMG] };

  await page.route("**/api/workflows**", async (route) => {
    generationRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(nextWorkflowResponse) });
  });

  // Keep the success path fully mocked — no real content row is written.
  await page.route("**/rest/v1/content**", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: `e2e-mock-${Date.now()}`, status: "draft", image_urls: [CLOUDINARY_IMG] }),
    });
  });

  await login(page);
  await page.goto("/dashboard/generate");
  await expect(page.getByRole("heading", { name: "What would you like to create?" })).toBeVisible({ timeout: 15_000 });

  // Clean assisted draft so we start from a predictable state, then reveal the
  // professional controls that contain the Generate button.
  await page.evaluate(() => localStorage.removeItem("blink-assisted-creation-draft"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "What would you like to create?" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Customize advanced details" }).first().click();

  const advanced = page.locator("#advanced-creation-controls");
  await expect(advanced).toBeVisible({ timeout: 10_000 });

  const promptBox = advanced.locator("textarea").first();
  await promptBox.fill("A neon cyberpunk cityscape at dusk with reflective streets");

  // Wait for the browser session to resolve the client id (useClient) before
  // generating; the guard silently no-ops until it is present.
  await expect
    .poll(async () => (await page.request.get("/api/credits/balance")).ok(), { timeout: 15_000 })
    .toBe(true);
  await page.waitForTimeout(4000);

  const generateBtn = advanced.getByRole("button", { name: /Generate/ });
  const statusPanel = page.locator('[data-generation-state]');

  // ── Scenario 1: success → charged ────────────────────────────────────────
  nextWorkflowResponse = { success: true, imageUrls: [CLOUDINARY_IMG] };
  await generateBtn.click();
  await expect(statusPanel).toHaveAttribute("data-generation-state", "succeeded", { timeout: 15_000 });
  await expect(statusPanel).toHaveAttribute("data-billing-state", "charged");
  await expect(statusPanel).toContainText("Image ready");
  await expect(statusPanel).toContainText("Credits charged");
  await expect(page.locator(`img[src="${CLOUDINARY_IMG}"]`).first()).toBeVisible();
  expect(generationRequests).toBe(1);

  // ── Scenario 2: failed while charged (distinct from refunded) ─────────────
  nextWorkflowResponse = { success: false, message: "The generator could not complete this request.", refunded: false };
  await generateBtn.click();
  await expect(statusPanel).toHaveAttribute("data-generation-state", "failed", { timeout: 15_000 });
  await expect(statusPanel).toHaveAttribute("data-billing-state", "charged");
  await expect(statusPanel).toContainText("Generation failed");
  await expect(statusPanel).toContainText("Credits charged");
  const retryBtn = statusPanel.getByRole("button", { name: "Retry" });
  await expect(retryBtn).toBeVisible();
  expect(generationRequests).toBe(2);

  // ── Scenario 3: retry → failed but refunded ──────────────────────────────
  nextWorkflowResponse = { success: false, message: "This prompt was blocked by content safety.", refunded: true };
  await retryBtn.click();
  await expect(statusPanel).toHaveAttribute("data-generation-state", "failed", { timeout: 15_000 });
  await expect(statusPanel).toHaveAttribute("data-billing-state", "refunded");
  await expect(statusPanel).toContainText("Credits refunded");
  expect(generationRequests).toBe(3); // retry fired exactly one more request

  // No blocking dialog was ever used for generation state.
  expect(dialogs).toEqual([]);
});
