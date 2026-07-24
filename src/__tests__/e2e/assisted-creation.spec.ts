import { test, expect, type Page } from "@playwright/test";

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

// Format honesty: Image Studio requests image-only concepts, so every mocked
// concept and direction the studio surface receives is an executable image.
const firstConcepts = [
  { id: "concept-1", title: "The Homecoming", idea: "A blanket becomes the quiet reward at the end of a long day.", angle: "Relief, belonging, and emotional warmth", format: "image" },
  { id: "concept-2", title: "Softness Up Close", idea: "Tactile details turn the blanket into a landscape of comfort.", angle: "Sensory desire and premium quality", format: "image" },
  { id: "concept-3", title: "Three Ways to Unwind", idea: "A connected series shows three rituals made better by the blanket.", angle: "Recognition and everyday aspiration", format: "image" },
];

const secondConcepts = [
  { id: "concept-1", title: "The Comfort Signal", idea: "The blanket signals that the busy part of the day is finally over.", angle: "Anticipation and release", format: "image" },
  { id: "concept-2", title: "Passed Down", idea: "Comfort moves between people through one familiar blanket.", angle: "Care, connection, and continuity", format: "image" },
  { id: "concept-3", title: "Made for the Pause", idea: "A visual sequence celebrates small moments of deliberate rest.", angle: "Calm confidence and self-care", format: "image" },
];

const direction = {
  visualDirection: "Warm evening light, tactile close-ups, and a lived-in room that feels calm rather than staged.",
  tone: "Reassuring, intimate, and quietly premium.",
  composition: "Begin with the room, move toward the person, then finish on the blanket texture as the emotional payoff.",
  outputType: "image",
  style: "cinematic",
  summary: "A cinematic homecoming story where wrapping up in the blanket marks the moment the day becomes yours again.",
};

async function login(page: Page) {
  if (!email || !password) throw new Error("E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be configured");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/dashboard(?:\/|$)/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({ timeout: 10_000 });
}

test("assisted creation hands a selected direction into the existing Image Studio", async ({ page }) => {
  test.setTimeout(90_000);

  const consoleErrors: string[] = [];
  const unexpectedFeatureFailures: string[] = [];
  let conceptRequests = 0;
  let expectedRateLimitFailureSeen = false;
  let directionRequests = 0;
  let generationRequests = 0;
  let browserDialogs = 0;
  const assistedRequestBodies: Array<Record<string, unknown>> = [];
  page.on("dialog", (dialog) => { browserDialogs += 1; void dialog.dismiss(); });

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/ai/assisted-creation") && response.status() >= 400) {
      if (response.status() === 429 && !expectedRateLimitFailureSeen) expectedRateLimitFailureSeen = true;
      else unexpectedFeatureFailures.push(`${response.status()} ${response.request().method()}`);
    }
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/workflows") || request.url().includes("/api/generate")) generationRequests += 1;
  });

  await page.route("**/api/ai/assisted-creation", async (route) => {
    const body = route.request().postDataJSON() as { operation?: string } & Record<string, unknown>;
    assistedRequestBodies.push(body);
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (body.operation === "concepts") {
      conceptRequests += 1;
      if (conceptRequests === 1) {
        await route.fulfill({
          status: 429,
          headers: { "Retry-After": "1" },
          contentType: "application/json",
          body: JSON.stringify({
            error: "Too many assisted-creation requests. Please try again later.",
            retryAt: new Date(Date.now() + 1_000).toISOString(),
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ concepts: conceptRequests === 2 ? firstConcepts : secondConcepts }) });
      return;
    }
    directionRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ direction }) });
  });

  await login(page);
  await page.goto("/dashboard/generate");
  await expect(page.getByRole("heading", { name: "What would you like to create?" })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => localStorage.removeItem("blink-assisted-creation-draft"));
  await page.reload();

  const idea = page.getByLabel("Your idea");
  await idea.fill("Create an ad that makes our soft blankets feel like the best part of coming home.");
  const developButton = page.getByRole("button", { name: "Develop my idea" });
  await developButton.click();
  await expect(developButton).toBeDisabled();
  await expect(page.getByText("Too many assisted-creation requests. Please try again later.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();
  const concepts = page.locator('[aria-label="Creative concepts"] > button');
  await expect(concepts).toHaveCount(3);
  await expect(page.getByRole("button", { name: /The Homecoming/ })).toBeVisible();
  // Format honesty: only executable IMAGE concepts appear inside Image Studio.
  await expect(page.locator('[aria-label="Creative concepts"]').getByText(/^(video|carousel)$/)).toHaveCount(0);
  await expect(page.locator('[aria-label="Creative concepts"]').getByText(/^image$/)).toHaveCount(3);

  const requestsAfterConcepts = conceptRequests;
  await page.reload();
  await expect(idea).toHaveValue("Create an ad that makes our soft blankets feel like the best part of coming home.");
  await expect(concepts).toHaveCount(3);
  expect(conceptRequests).toBe(requestsAfterConcepts);

  await page.getByRole("button", { name: /The Homecoming/ }).click();
  await expect(page.getByRole("status")).toContainText("Developing the creative direction");
  await expect(page.getByText("Creative direction", { exact: true })).toBeVisible();

  const summary = page.getByLabel("Editable summary");
  await summary.fill("A warmer homecoming story with the blanket as the final emotional payoff.");
  await expect(summary).toHaveValue("A warmer homecoming story with the blanket as the final emotional payoff.");

  const requestsAfterDirection = directionRequests;
  await page.reload();
  await expect(page.getByRole("button", { name: /The Homecoming/ })).toHaveAttribute("aria-pressed", "true");
  await expect(summary).toHaveValue("A warmer homecoming story with the blanket as the final emotional payoff.");
  expect(directionRequests).toBe(requestsAfterDirection);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.goto("/dashboard/generate");
  await expect(summary).toHaveValue("A warmer homecoming story with the blanket as the final emotional payoff.");

  await page.getByRole("button", { name: "Another take" }).click();
  await expect(concepts).toHaveCount(3);
  await expect(page.getByRole("button", { name: /Passed Down/ })).toBeVisible();
  await page.getByRole("button", { name: /Passed Down/ }).click();
  await expect(page.getByText("Creative direction", { exact: true })).toBeVisible();

  const customizeButtons = page.getByRole("button", { name: "Customize advanced details" });
  await expect(customizeButtons).toHaveCount(2);
  await customizeButtons.last().click();
  const advanced = page.locator("#advanced-creation-controls");
  await expect(advanced).toBeVisible();
  await expect(advanced.getByText("AI Engine", { exact: true })).toBeVisible();
  await advanced.locator("select").selectOption("lifestyle");
  await expect(advanced.locator("select")).toHaveValue("lifestyle");
  const requestsBeforeAdvancedRefresh = conceptRequests + directionRequests;
  await page.reload();
  await expect(advanced).toBeVisible();
  expect(conceptRequests + directionRequests).toBe(requestsBeforeAdvancedRefresh);

  await page.getByRole("button", { name: "Continue with this direction" }).click();
  const studioPrompt = advanced.locator("textarea");
  await expect(studioPrompt).toHaveValue(direction.summary);
  await expect(advanced.locator("select")).toHaveValue("cinematic");
  await expect(advanced.getByRole("button", { name: "Generate Image" })).toBeVisible();

  await page.reload();
  await expect(advanced).toBeVisible();
  await expect(studioPrompt).toHaveValue(direction.summary);
  await expect(advanced.locator("select")).toHaveValue("cinematic");

  await page.evaluate(() => localStorage.setItem("blink-e2e-unrelated-preference", "keep"));

  // Non-blocking Start over: first activation reveals an inline confirmation.
  // Cancel preserves the complete draft; no browser dialog is ever shown.
  await page.getByRole("button", { name: "Start over" }).click();
  const startOverConfirm = page.getByRole("group", { name: "Confirm start over" });
  await expect(startOverConfirm).toBeVisible();
  await startOverConfirm.getByRole("button", { name: "Keep my draft" }).click();
  await expect(startOverConfirm).toHaveCount(0);
  await expect(studioPrompt).toHaveValue(direction.summary); // draft fully preserved
  await expect(advanced).toBeVisible();

  // Confirming clears only the assisted draft.
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(startOverConfirm).toBeVisible();
  await startOverConfirm.getByRole("button", { name: "Clear draft" }).click();
  await expect(idea).toHaveValue("");
  await expect(page.locator('[aria-label="Creative concepts"]')).toHaveCount(0);
  await expect(page.getByText("Creative direction", { exact: true })).toHaveCount(0);
  await expect(advanced).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("blink-e2e-unrelated-preference"))).toBe("keep");
  await page.reload();
  await expect(idea).toHaveValue("");
  await expect(page.locator('[aria-label="Creative concepts"]')).toHaveCount(0);

  expect(expectedRateLimitFailureSeen).toBe(true);
  expect(unexpectedFeatureFailures).toEqual([]);
  expect(consoleErrors.filter((message) => message.includes("assisted-creation") || message.includes("AssistedCreation"))).toEqual([]);
  expect(generationRequests).toBe(0);
  expect(browserDialogs).toBe(0); // Start over never opens a blocking browser dialog
  // Every assisted request declared the Image Studio capability.
  expect(assistedRequestBodies.length).toBeGreaterThan(0);
  for (const body of assistedRequestBodies) {
    expect(body.allowedFormats).toEqual(["image"]);
  }
});

test("a legacy draft with a video concept is quarantined and recoverable", async ({ page }) => {
  test.setTimeout(90_000);

  let workflowRequests = 0;
  let browserDialogs = 0;
  page.on("dialog", (dialog) => { browserDialogs += 1; void dialog.dismiss(); });
  page.on("request", (request) => {
    if (request.url().includes("/api/workflows") || request.url().includes("/api/generate")) workflowRequests += 1;
  });

  let conceptRequests = 0;
  await page.route("**/api/ai/assisted-creation", async (route) => {
    const body = route.request().postDataJSON() as { operation?: string } & Record<string, unknown>;
    expect(body.allowedFormats).toEqual(["image"]);
    if (body.operation === "concepts") {
      conceptRequests += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ concepts: firstConcepts }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ direction }) });
  });

  await login(page);
  await page.goto("/dashboard/generate");
  await expect(page.getByRole("heading", { name: "What would you like to create?" })).toBeVisible({ timeout: 15_000 });

  // Seed a pre-format-honesty draft: a selected VIDEO concept with a video direction.
  await page.evaluate(() => {
    const persistedBrand = window.localStorage.getItem("blink-active-brand");
    const brandId = persistedBrand ? JSON.parse(persistedBrand)?.state?.activeBrand?.id : null;
    if (!brandId) throw new Error("No active brand available for legacy draft seed");
    const legacyConcepts = [
      { id: "concept-1", title: "The Motion Story", idea: "A story told entirely in movement.", angle: "Emotion in motion", format: "video" },
      { id: "concept-2", title: "Softness Up Close", idea: "Tactile details turn the blanket into a landscape of comfort.", angle: "Sensory desire", format: "image" },
      { id: "concept-3", title: "The Connected Series", idea: "Three linked panels reveal the ritual.", angle: "Discovery", format: "carousel" },
    ];
    const legacyDraft = {
      version: 1,
      brandId,
      idea: "Create an ad about our soft blankets in motion.",
      concepts: legacyConcepts,
      selectedConcept: legacyConcepts[0],
      direction: {
        visualDirection: "Sweeping motion through a warm living room.",
        tone: "Emotive and flowing",
        composition: "Track from door to sofa, ending wrapped in the blanket.",
        outputType: "video",
        style: "cinematic",
        summary: "A cinematic motion story about arriving home to comfort.",
      },
      step: "direction",
      advancedRevealed: false,
      handoff: null,
    };
    window.localStorage.setItem("blink-assisted-creation-draft", JSON.stringify({ state: { draft: legacyDraft }, version: 1 }));
  });
  await page.reload();

  // Idea survives; the unsupported selection is quarantined, not silently converted.
  await expect(page.getByLabel("Your idea")).toHaveValue("Create an ad about our soft blankets in motion.");
  const videoCard = page.getByRole("button", { name: /The Motion Story/ });
  await expect(videoCard).toBeDisabled();
  await expect(page.getByText("Not available in Image Studio yet").first()).toBeVisible();
  await expect(page.getByText("Creative direction", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Video and carousel concepts aren't available in Image Studio yet/)).toBeVisible();

  // The legacy recovery's Start over uses the same non-blocking confirmation.
  await page.getByRole("button", { name: "Start over" }).last().click();
  const startOverConfirm = page.getByRole("group", { name: "Confirm start over" });
  await expect(startOverConfirm).toBeVisible();
  await startOverConfirm.getByRole("button", { name: "Keep my draft" }).click();
  await expect(startOverConfirm).toHaveCount(0);
  await expect(page.getByLabel("Your idea")).toHaveValue("Create an ad about our soft blankets in motion.");
  await expect(page.getByText(/Video and carousel concepts aren't available in Image Studio yet/)).toBeVisible();

  // Recovery: regenerate image-only concepts and continue normally.
  await page.getByRole("button", { name: "Create image concepts" }).click();
  const concepts = page.locator('[aria-label="Creative concepts"] > button');
  await expect(concepts).toHaveCount(3);
  await expect(page.locator('[aria-label="Creative concepts"]').getByText(/^image$/)).toHaveCount(3);
  await expect(page.locator('[aria-label="Creative concepts"]').getByText(/^(video|carousel)$/)).toHaveCount(0);
  expect(conceptRequests).toBe(1);

  await page.getByRole("button", { name: /The Homecoming/ }).click();
  await expect(page.getByText("Creative direction", { exact: true })).toBeVisible();

  expect(workflowRequests).toBe(0);
  expect(browserDialogs).toBe(0);
});
