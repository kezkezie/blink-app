import { test, expect, type Page, type Route } from "@playwright/test";

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

// A tiny 1x1 PNG used as an "inspiration image" upload (no real file needed).
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function login(page: Page) {
  if (!email || !password) throw new Error("E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be configured");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/dashboard(?:\/|$)/, { timeout: 20_000 });
}

async function activateBrand(page: Page): Promise<string> {
  await page.goto("/dashboard/brand");
  await page.waitForFunction(() => {
    try {
      const raw = window.localStorage.getItem("blink-active-brand");
      return Boolean(raw && JSON.parse(raw)?.state?.activeBrand?.id);
    } catch { return false; }
  }, undefined, { timeout: 20_000 });
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("blink-active-brand")!).state.activeBrand.id as string);
}

async function revealStudioControls(page: Page) {
  await page.getByRole("heading", { name: "What would you like to create?" }).waitFor({ timeout: 20_000 });
  await page.evaluate(() => {
    window.localStorage.removeItem("blink-assisted-creation-draft");
    window.localStorage.removeItem("blink-image-active-job");
  });
  await page.reload();
  await page.getByRole("heading", { name: "What would you like to create?" }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Customize advanced details" }).first().click();
  const advanced = page.locator("#advanced-creation-controls");
  await advanced.waitFor({ timeout: 15_000 });
  await advanced.locator("textarea").first().fill("A calm minimalist product scene in warm sunlit tones.");
  await expect.poll(async () => (await page.request.get("/api/credits/balance")).ok(), { timeout: 15_000 }).toBe(true);
}

/** Capture (never trigger) browser dialogs; tests assert none occurred. */
function trackDialogs(page: Page): string[] {
  const dialogs: string[] = [];
  page.on("dialog", (d) => { dialogs.push(d.type()); void d.dismiss(); });
  return dialogs;
}

async function attachInspirationFile(page: Page) {
  // The dropzone's hidden react-dropzone input accepts files without a file dialog.
  await page.locator('#advanced-creation-controls input[type="file"]').first()
    .setInputFiles({ name: "inspiration.png", mimeType: "image/png", buffer: PNG_1x1 });
}

test.describe("Image Studio — inspiration image UX (guarded durable path)", () => {
  test("standard mode explains inspiration input with accessible controls", async ({ page }) => {
    const dialogs = trackDialogs(page);
    await login(page);
    await activateBrand(page);
    await page.goto("/dashboard/generate?durableJobs=1");
    await revealStudioControls(page);

    // Clear, user-facing labelling (replaces the old "Style Moodboard").
    await expect(page.getByText("Add an inspiration image")).toBeVisible();
    await expect(page.getByText(/upload an existing design or choose one from your Content Grid/i)).toBeVisible();
    await expect(page.getByText(/Inspiration images need .*Nano Banana 2.* or .*GPT Image 2 · I2I/i)).toBeVisible();
    // Accessible control names (keyboard-operable, labelled).
    await expect(page.getByRole("button", { name: "Upload an inspiration image" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose an image from your Content Grid" })).toBeVisible();
    expect(dialogs).toEqual([]);
  });

  test("adding an inspiration image with a text-only engine shows non-blocking guidance + an explicit switch", async ({ page }) => {
    const dialogs = trackDialogs(page);
    await login(page);
    await activateBrand(page);
    await page.goto("/dashboard/generate?durableJobs=1");
    await revealStudioControls(page);

    // Select the text-only engine, then attach an inspiration image.
    await page.getByRole("button", { name: "GPT Image 2 · T2I" }).click();
    await attachInspirationFile(page);
    await expect(page.locator('img[alt="Uploaded inspiration image 1"]')).toBeVisible();

    // Non-blocking status guidance appears (NOT a browser dialog) and offers a switch.
    const guidance = page.getByRole("status").filter({ hasText: "GPT Image 2 · T2I is text-only" });
    await expect(guidance).toBeVisible();
    const switchBtn = page.getByRole("button", { name: "Switch to Nano Banana 2" });
    await expect(switchBtn).toBeVisible();
    await switchBtn.click();

    // After switching, the engine is reference-capable so the reactive incompatibility
    // status clears. (The persistent standard-mode guidance bullet stays — it's help text.)
    await expect(guidance).toHaveCount(0);
    // The image was NEVER discarded.
    await expect(page.locator('img[alt="Uploaded inspiration image 1"]')).toBeVisible();
    expect(dialogs).toEqual([]);
  });

  test("the remove control is reachable without hover and clears the image (no dialog)", async ({ page }) => {
    const dialogs = trackDialogs(page);
    await login(page);
    await activateBrand(page);
    await page.goto("/dashboard/generate?durableJobs=1");
    await revealStudioControls(page);
    await attachInspirationFile(page);

    const removeBtn = page.getByRole("button", { name: "Remove uploaded image 1" });
    await expect(removeBtn).toBeVisible(); // visible without hover (a11y)
    await removeBtn.click();
    await expect(page.locator('img[alt="Uploaded inspiration image 1"]')).toHaveCount(0);
    expect(dialogs).toEqual([]);
  });

  test('"Choose from Grid" opens the Content Grid picker (keyboard-accessible)', async ({ page }) => {
    const dialogs = trackDialogs(page);
    await login(page);
    await activateBrand(page);
    await page.goto("/dashboard/generate?durableJobs=1");
    await revealStudioControls(page);

    await page.getByRole("button", { name: "Choose an image from your Content Grid" }).click();
    // A picker dialog/modal surfaces (in-app, not a browser dialog).
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    expect(dialogs).toEqual([]);
  });

  test("compatible submission (reference-capable engine + inspiration) makes exactly one request, zero dialogs", async ({ page }) => {
    const dialogs = trackDialogs(page);
    let placeholderPosts = 0;
    let workflowPosts = 0;
    const JOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    await page.route("**/api/image-jobs**", async (route: Route) => {
      if (route.request().method() === "POST") {
        placeholderPosts += 1;
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: JOB, credit_cost: 8, idempotent: false, attempt: 1 }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: JOB, status: { generationState: "generating", billingState: "charged", retryState: "none", message: null, errorCode: null, attempt: 1 }, image_urls: [] }) });
    });
    await page.route("**/api/workflows**", async (route) => { workflowPosts += 1; await route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });

    await login(page);
    await activateBrand(page);
    await page.goto("/dashboard/generate?durableJobs=1");
    await revealStudioControls(page);

    // Reference-capable engine (nb2 is the default) + an inspiration image = compatible.
    await attachInspirationFile(page);
    await expect(page.getByRole("status").filter({ hasText: "text-only" })).toHaveCount(0); // no incompatibility

    const generate = page.getByRole("button", { name: "Generate Image" });
    const panel = page.locator("[data-generation-state]");
    await expect(async () => {
      await generate.click();
      await expect(panel).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 25_000 });

    await expect(panel).toHaveAttribute("data-generation-state", "generating", { timeout: 12_000 });
    expect(placeholderPosts).toBe(1); // exactly one placeholder
    expect(workflowPosts).toBe(1);    // exactly one workflow submission
    expect(dialogs).toEqual([]);      // zero blocking browser dialogs
  });
});
