import { test, expect, type Page, type Route } from "@playwright/test";

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

const IMG_A = "https://cdn.example/first.jpg";
const IMG_B = "https://cdn.example/second.jpg";

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

async function login(page: Page) {
  if (!email || !password) throw new Error("E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be configured");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/dashboard(?:\/|$)/, { timeout: 20_000 });
}

/**
 * Activate a brand deterministically: navigate to the brand page and wait for the
 * store to PERSIST an active brand id (observable condition, not a fixed delay).
 */
async function activateBrand(page: Page): Promise<string> {
  await page.goto("/dashboard/brand");
  await page.waitForFunction(() => {
    try {
      const raw = window.localStorage.getItem("blink-active-brand");
      return Boolean(raw && JSON.parse(raw)?.state?.activeBrand?.id);
    } catch { return false; }
  }, undefined, { timeout: 20_000 });
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("blink-active-brand")!;
    return JSON.parse(raw).state.activeBrand.id as string;
  });
}

/** Remove ONLY test-owned keys so a scenario starts from known studio state. */
async function clearTestStorage(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem("blink-assisted-creation-draft");
    window.localStorage.removeItem("blink-image-active-job");
  });
}

/** Reveal the advanced controls and fill a prompt, starting from a clean draft. */
async function revealStudioControls(page: Page) {
  await page.getByRole("heading", { name: "What would you like to create?" }).waitFor({ timeout: 20_000 });
  await clearTestStorage(page); // no stale draft / no stale restoration in a fresh-generate flow
  await page.reload(); // reload preserves ?durableJobs=1
  await page.getByRole("heading", { name: "What would you like to create?" }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Customize advanced details" }).first().click();
  const advanced = page.locator("#advanced-creation-controls");
  await advanced.waitFor({ timeout: 15_000 });
  await advanced.locator("textarea").first().fill("A calm minimalist product scene in warm sunlit tones.");
}

/**
 * Start a generation and confirm it actually began. `handleGenerate` no-ops
 * silently until the client id resolves, so a single early click can be lost.
 * Retry the click until the status panel appears — a no-op click creates no
 * placeholder and does not set the submitting guard, so this can never
 * double-submit. Returns the panel locator.
 */
async function startGeneration(page: Page, buttonName: string | RegExp = "Generate Image") {
  const generate = page.getByRole("button", { name: buttonName });
  const panel = page.locator("[data-generation-state]");
  await expect(async () => {
    await generate.click();
    await expect(panel).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 25_000 });
  return panel;
}

/** Wait for the session to be live (observable) before expecting restoration to fire. */
async function waitSessionReady(page: Page) {
  await expect.poll(async () => (await page.request.get("/api/credits/balance")).ok(), { timeout: 15_000 }).toBe(true);
}

/** Capture (never trigger) browser dialogs; tests assert none occurred. */
function trackDialogs(page: Page): string[] {
  const dialogs: string[] = [];
  page.on("dialog", (d) => { dialogs.push(d.type()); void d.dismiss(); });
  return dialogs;
}

const jobRow = (contentId: string, generationState: string, over: Record<string, unknown> = {}) => ({
  id: contentId,
  status: {
    generationState, billingState: "not_charged", retryState: "none",
    message: null, errorCode: null, attempt: 1,
    ...(over.status as object ?? {}),
  },
  image_urls: over.image_urls ?? [],
});

test.describe("Image Studio durable jobs (Increment 3, guarded)", () => {
  test("durable path: queued→generating→saving→succeeded, one placeholder + one submission, correlated + ordered", async ({ page }) => {
    const dialogs = trackDialogs(page);
    let placeholderPosts = 0;
    let workflowPosts = 0;
    let submittedIdempotencyKey: string | undefined;
    let workflowBody: Record<string, unknown> | undefined;
    // Test-controlled durable state: the mock returns whatever the test sets, and
    // the observer picks up each change on its next poll — robust to Strict Mode
    // double-invocation and poll timing.
    let currentState = "queued";
    let currentUrls: string[] = [];
    const JOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    await page.route("**/api/image-jobs**", async (route: Route) => {
      const req = route.request();
      if (req.method() === "POST") {
        placeholderPosts += 1;
        submittedIdempotencyKey = JSON.parse(req.postData() || "{}").idempotency_key;
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: JOB, generation_state: "queued", billing_state: "not_charged", retry_state: "none", attempt: 1, idempotent: false }) });
      }
      const status: Record<string, unknown> = { billingState: currentState === "succeeded" ? "charged" : "not_charged" };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(jobRow(JOB, currentState, { status, image_urls: currentUrls })) });
    });
    await page.route("**/api/workflows**", async (route) => {
      workflowPosts += 1;
      workflowBody = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await login(page);
    await activateBrand(page);
    await page.goto("/dashboard/generate?durableJobs=1");
    await revealStudioControls(page);

    const panel = await startGeneration(page);
    // A rapid duplicate activation must not create a second placeholder — the button
    // disables and the submittingRef/isActive guards block it (asserted via
    // placeholderPosts === 1 below). Short timeout, no force, so it can't destabilize the page.
    await page.getByRole("button", { name: "Generate Image" }).click({ timeout: 1_500 }).catch(() => {});

    // The exact brief queued→generating→saving transients are covered deterministically
    // by the observer unit tests; here we drive them via controlled state and assert
    // each is reflected through the UI, ending on the durable terminal.
    await expect(panel).toBeVisible({ timeout: 20_000 });
    currentState = "generating";
    await expect(panel).toHaveAttribute("data-generation-state", "generating", { timeout: 12_000 });
    currentState = "saving";
    await expect(panel).toHaveAttribute("data-generation-state", "saving", { timeout: 12_000 });
    currentState = "succeeded"; currentUrls = [IMG_A, IMG_B];
    await expect(panel).toHaveAttribute("data-generation-state", "succeeded", { timeout: 12_000 });
    await expect(panel).toHaveAttribute("data-billing-state", "charged");

    await expect(page.locator(`img[src="${IMG_A}"]`)).toBeVisible();
    await expect(page.locator(`img[src="${IMG_B}"]`)).toBeVisible();
    // Ordered: first result URL precedes the second in the DOM.
    const srcs = await page.locator("img").evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).getAttribute("src")));
    expect(srcs.indexOf(IMG_A)).toBeLessThan(srcs.indexOf(IMG_B));

    expect(placeholderPosts).toBe(1);
    expect(workflowPosts).toBe(1);
    // Correlation contract: the workflow submission MUST carry the placeholder identity
    // and the exact idempotency key that created it, so the future n8n status writer
    // can update the right durable row.
    expect(workflowBody?.post_id).toBe(JOB);
    expect(workflowBody?.job_id).toBe(JOB);
    expect(submittedIdempotencyKey).toMatch(IDEMPOTENCY_KEY_RE);
    expect(workflowBody?.idempotency_key).toBe(submittedIdempotencyKey);
    expect(workflowBody?.is_sync).toBe(false);
    expect(dialogs).toEqual([]);
  });

  test("restores an existing durable job after navigation WITHOUT resubmitting", async ({ page }) => {
    const dialogs = trackDialogs(page);
    let placeholderPosts = 0;
    let workflowPosts = 0;
    let getCalls = 0;
    let currentState = "generating";
    let currentUrls: string[] = [];
    const JOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    await page.route("**/api/image-jobs**", async (route: Route) => {
      if (route.request().method() === "POST") { placeholderPosts += 1; return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: JOB }) }); }
      getCalls += 1;
      const status: Record<string, unknown> = { billingState: currentState === "succeeded" ? "charged" : "not_charged" };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(jobRow(JOB, currentState, { status, image_urls: currentUrls })) });
    });
    await page.route("**/api/workflows**", async (route) => { workflowPosts += 1; await route.fulfill({ status: 200, body: "{}" }); });

    await login(page);
    const brandId = await activateBrand(page);
    await clearTestStorage(page);
    // Seed a persisted active job for this brand (as if a prior tab started it).
    await page.evaluate(([b, j]) => window.localStorage.setItem("blink-image-active-job", JSON.stringify({ brandId: b, contentId: j })), [brandId, JOB]);

    await page.goto("/dashboard/generate?durableJobs=1");
    // Studio renders once the active brand hydrates; restoration observes once the
    // session/client id resolves. The panel appearing IS the observable signal — no
    // fixed sleep needed.
    await page.getByRole("heading", { name: "What would you like to create?" }).waitFor({ timeout: 20_000 });
    await waitSessionReady(page);

    const panel = page.locator("[data-generation-state]");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel).toHaveAttribute("data-generation-state", "generating", { timeout: 12_000 });
    currentState = "succeeded"; currentUrls = [IMG_A];
    await expect(panel).toHaveAttribute("data-generation-state", "succeeded", { timeout: 8_000 });
    await expect(page.locator(`img[src="${IMG_A}"]`)).toBeVisible();

    expect(getCalls).toBeGreaterThan(0); // restoration actually observed the job
    expect(placeholderPosts).toBe(0); // observed, never resubmitted
    expect(workflowPosts).toBe(0);
    expect(dialogs).toEqual([]);
  });

  test("failed→refunded is shown honestly, and Retry preserves retry-parent lineage", async ({ page }) => {
    const dialogs = trackDialogs(page);
    const JOB1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const JOB2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const placeholderBodies: Array<Record<string, unknown>> = [];
    let firstJobGetCalls = 0;

    await page.route("**/api/image-jobs**", async (route: Route) => {
      const req = route.request();
      if (req.method() === "POST") {
        placeholderBodies.push(JSON.parse(req.postData() || "{}"));
        const id = placeholderBodies.length === 1 ? JOB1 : JOB2;
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id }) });
      }
      const url = new URL(req.url());
      if (url.searchParams.get("id") === JOB1) {
        firstJobGetCalls += 1;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(jobRow(JOB1, "failed", { status: { billingState: "refunded", retryState: "retry_available", errorCode: "safety_blocked", message: "AI Provider Failed." } })) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(jobRow(JOB2, "generating")) });
    });
    await page.route("**/api/workflows**", async (route) => { await route.fulfill({ status: 200, body: "{}" }); });

    await login(page);
    await activateBrand(page);
    await page.goto("/dashboard/generate?durableJobs=1");
    await revealStudioControls(page);

    const panel = await startGeneration(page);
    await expect(panel).toHaveAttribute("data-generation-state", "failed", { timeout: 15_000 });
    await expect(panel).toHaveAttribute("data-billing-state", "refunded");

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(panel).toHaveAttribute("data-generation-state", "generating", { timeout: 15_000 });

    expect(placeholderBodies).toHaveLength(2);
    expect(placeholderBodies[0]).not.toHaveProperty("retry_of_content_id");
    expect(placeholderBodies[1].retry_of_content_id).toBe(JOB1); // retry-parent lineage preserved
    expect(firstJobGetCalls).toBeGreaterThan(0);
    expect(dialogs).toEqual([]);
  });

  test("restore → durable failed/refunded → Retry preserves lineage to the RESTORED job", async ({ page }) => {
    const dialogs = trackDialogs(page);
    const JOB1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"; // seeded/restored parent
    const JOB2 = "ffffffff-ffff-4fff-8fff-ffffffffffff"; // retry child
    const placeholderBodies: Array<Record<string, unknown>> = [];
    let workflowPosts = 0;

    await page.route("**/api/image-jobs**", async (route: Route) => {
      const req = route.request();
      if (req.method() === "POST") {
        placeholderBodies.push(JSON.parse(req.postData() || "{}"));
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: JOB2 }) });
      }
      const id = new URL(req.url()).searchParams.get("id");
      if (id === JOB1) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(jobRow(JOB1, "failed", { status: { billingState: "refunded", retryState: "retry_available", errorCode: "safety_blocked", message: "AI Provider Failed." } })) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(jobRow(JOB2, "generating")) });
    });
    await page.route("**/api/workflows**", async (route) => { workflowPosts += 1; await route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });

    await login(page);
    const brandId = await activateBrand(page);
    await clearTestStorage(page);
    await page.evaluate(([b, j]) => window.localStorage.setItem("blink-image-active-job", JSON.stringify({ brandId: b, contentId: j })), [brandId, JOB1]);

    await page.goto("/dashboard/generate?durableJobs=1");
    await page.getByRole("heading", { name: "What would you like to create?" }).waitFor({ timeout: 20_000 });
    await waitSessionReady(page);

    const panel = page.locator("[data-generation-state]");
    await expect(panel).toHaveAttribute("data-generation-state", "failed", { timeout: 20_000 });
    await expect(panel).toHaveAttribute("data-billing-state", "refunded");
    expect(placeholderBodies).toHaveLength(0); // restored, never resubmitted
    expect(workflowPosts).toBe(0);

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(panel).toHaveAttribute("data-generation-state", "generating", { timeout: 20_000 });

    expect(placeholderBodies).toHaveLength(1); // exactly one new placeholder
    expect(placeholderBodies[0].retry_of_content_id).toBe(JOB1); // lineage to the RESTORED job survives navigation
    expect(workflowPosts).toBe(1); // exactly one new workflow submission
    expect(dialogs).toEqual([]);
  });

  test("synchronous fallback is used when durable jobs are disabled (no placeholder call)", async ({ page }) => {
    const dialogs = trackDialogs(page);
    let placeholderPosts = 0;
    let workflowPosts = 0;
    await page.route("**/api/image-jobs**", async (route: Route) => { if (route.request().method() === "POST") placeholderPosts += 1; await route.fulfill({ status: 201, body: "{}" }); });
    await page.route("**/api/workflows**", async (route) => { workflowPosts += 1; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, imageUrls: [IMG_A] }) }); });
    // Keep the sync success path fully mocked — no real content row is written.
    await page.route("**/rest/v1/content**", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: `e2e-mock-${Date.now()}`, status: "draft", image_urls: [IMG_A] }) });
    });

    await login(page);
    await activateBrand(page);
    await page.goto("/dashboard/generate"); // no durableJobs param → synchronous fallback
    await revealStudioControls(page);

    const panel = await startGeneration(page);
    await expect(panel).toHaveAttribute("data-generation-state", "succeeded", { timeout: 30_000 });
    expect(placeholderPosts).toBe(0); // durable path never ran
    expect(workflowPosts).toBeGreaterThanOrEqual(1); // synchronous path engaged
    expect(dialogs).toEqual([]);
  });
});
