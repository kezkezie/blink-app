import { test, expect, type Page, type Route } from "@playwright/test";

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const LOGO = "https://cdn.example/generated-logo.png";

async function login(page: Page) {
  if (!email || !password) throw new Error("E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be configured");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/dashboard(?:\/|$)/, { timeout: 20_000 });
}

async function activateBrand(page: Page) {
  await page.goto("/dashboard/brand");
  await page.waitForFunction(() => {
    try { return Boolean(JSON.parse(window.localStorage.getItem("blink-active-brand") || "{}")?.state?.activeBrand?.id); } catch { return false; }
  }, undefined, { timeout: 20_000 });
}

// Reveal the advanced studio controls and force the "Brand Integrated" style so the
// no-logo affordance renders even if the brand happens to have a logo.
async function openBrandStyleWithoutLogo(page: Page) {
  await page.getByRole("heading", { name: "What would you like to create?" }).waitFor({ timeout: 20_000 });
  await page.evaluate(() => { window.localStorage.removeItem("blink-assisted-creation-draft"); });
  await page.reload();
  await page.getByRole("button", { name: "Customize advanced details" }).first().click();
  await page.locator("#advanced-creation-controls").waitFor({ timeout: 15_000 });
  // Neutralize any real logo so the generator affordance shows deterministically.
  await page.route("**/rest/v1/brand_profiles**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ logo_url: null }]) });
  });
}

test("generate a brand logo, pick one, and save it (refund-safe, zero dialogs)", async ({ page }) => {
  test.setTimeout(90_000);
  const dialogs: string[] = [];
  page.on("dialog", (d) => { dialogs.push(d.type()); void d.dismiss(); });

  let generateCalls = 0;
  let saveBody: Record<string, unknown> | null = null;
  await page.route("**/api/brand/logo", async (route: Route) => {
    const method = route.request().method();
    if (method === "POST") {
      generateCalls += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ logoUrls: [LOGO], cost: 6 }) });
    }
    if (method === "PATCH") {
      saveBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, logoUrl: LOGO }) });
    }
    return route.fallback();
  });

  await login(page);
  await activateBrand(page);
  await page.goto("/dashboard/generate");
  await openBrandStyleWithoutLogo(page);

  // Select the Brand Integrated style so the no-logo affordance appears.
  const styleSelect = page.locator("#advanced-creation-controls select").first();
  await styleSelect.selectOption("brand");

  // The logo generator affordance is discoverable and priced.
  const genBtn = page.getByRole("button", { name: /Generate a logo \(6 credits\)/ });
  await expect(genBtn).toBeVisible({ timeout: 10_000 });
  await genBtn.click();

  // A candidate appears and is selectable; accept it.
  const option = page.getByRole("radio", { name: "Logo option 1" });
  await expect(option).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(`img[alt="Generated logo option 1"]`)).toBeVisible();
  await page.getByRole("button", { name: "Use this logo" }).click();

  // Saved via PATCH with the chosen URL; affordance closes (brand now has a logo).
  await expect.poll(() => saveBody).not.toBeNull();
  expect(saveBody).toMatchObject({ logoUrl: LOGO });
  await expect(genBtn).toHaveCount(0, { timeout: 10_000 });
  expect(generateCalls).toBe(1);
  expect(dialogs).toEqual([]);
});
