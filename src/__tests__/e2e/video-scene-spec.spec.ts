import { test, expect, type Page } from "@playwright/test";

/**
 * V2 (SceneSpec v1) + V3 (durable video job envelope) browser acceptance.
 *
 * Proves both seams work in the REAL runtime, not just in library unit tests:
 *
 *   V2 — Video Studio still renders after the SceneSpec edits, and a Storyboard
 *        Sheet saved in the OLD ad-hoc panel shape is adapted to SceneSpec on
 *        read, producing a fully-populated prepared scene.
 *   V3 — generating that scene creates its placeholder through the owned,
 *        DB-idempotent `/api/video-jobs` endpoint carrying the validated
 *        SceneSpec, and n8n receives the id the SERVER returned. Critically, the
 *        old direct browser `content` insert is gone: any non-GET write to the
 *        content table is recorded and asserted to be zero.
 *   V4 — the sequence status panel reports honest progress ("1 of 5 scenes
 *        ready"), and ZERO blocking dialogs occur: every former alert() on the
 *        video surfaces is now a non-blocking toast.
 *   V5 — reloading mid-flight RESTORES the in-flight scene and re-attaches the
 *        observer WITHOUT resubmitting it (a resubmit would create a second job
 *        and risk a second n8n deduction), and the panel updates to ready when
 *        the observed job completes — no further reload needed.
 *
 * Safety: this test performs NO production writes and NO paid work.
 *   - The sheet image, the Supabase Storage upload, the job endpoint, the n8n
 *     gateway, and the job's poll reads are all route-mocked.
 *   - Every other generation entry point is blocked and asserted to receive zero
 *     requests.
 *   - Nothing is generated, charged, or persisted.
 */

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

// A 2x2 PNG so the canvas crop in animateComicPanel has real pixels to work on.
const SHEET_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAwAAADQABv1KxRAAAAABJRU5ErkJggg==",
  "base64"
);
const SHEET_URL = "https://cdn.example.test/storyboard-sheet.png";

/** The ORIGINAL ad-hoc panel shape written by the earlier bounded repair. */
const LEGACY_PANELS = [
  {
    sceneNumber: 1,
    imagePrompt: "LEGACY-IMAGE-1 a warm living room at dusk",
    videoPrompt: "LEGACY-VIDEO-1 slow dolly in as the blanket is unfolded",
    dialogue: "It holds.",
    audioPrompt: "LEGACY-AUDIO-1 low ambient room tone",
    location: "living room",
    aiModel: "kling-3.0/video",
    duration: "10",
  },
  {
    sceneNumber: 2,
    imagePrompt: "LEGACY-IMAGE-2 the window ledge",
    videoPrompt: "LEGACY-VIDEO-2 handheld push toward the ledge",
    audioPrompt: "LEGACY-AUDIO-2 distant traffic",
    location: "third-floor window",
    aiModel: "auto",
    duration: "5",
  },
];

/**
 * Warm what CAN be warmed without a session: `/login`.
 *
 * `/dashboard/video` cannot be pre-warmed this way — middleware redirects an
 * unauthenticated request with a 307 in milliseconds, so Turbopack never
 * compiles the page. The first AUTHENTICATED navigation therefore pays the full
 * compile of the 3,500-line Storytelling component, which has been measured at
 * several minutes on a cold or contended dev server. That is why the first
 * post-login wait below is given a compile-sized timeout rather than a
 * UI-sized one; every other wait stays short because the server is warm by then.
 */
test.beforeAll(async ({ request }) => {
  await request.get("/login", { timeout: 300_000, failOnStatusCode: false }).catch(() => undefined);
});

/** Generous enough to absorb a cold Turbopack compile of the video route. */
const COLD_COMPILE_TIMEOUT_MS = 300_000;

async function login(page: Page) {
  if (!email || !password) throw new Error("E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be configured");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/dashboard(?:\/|$)/, { timeout: 30_000 });
}

test("V2→V5: legacy sheet adapts, scene generates durably, state is visible, no dialogs, and a reload restores without resubmitting", async ({ page }) => {
  // Generous: against a dev server the Video Studio route is compiled on first
  // hit by Turbopack, which can take minutes on a cold/contended server. Every
  // wait below is on an observable condition, not a fixed sleep, so a warm
  // server finishes in seconds.
  test.setTimeout(420_000);

  const consoleErrors: string[] = [];
  const forbiddenCalls: string[] = [];
  const dialogs: string[] = [];
  // V3: bodies sent to the durable job endpoint and the n8n gateway.
  const videoJobPosts: Record<string, unknown>[] = [];
  const nanoBananaPosts: Record<string, unknown>[] = [];
  const DURABLE_JOB_ID = "77777777-7777-4777-8777-777777777777";
  // V5: flipped once the test wants the observed job to complete.
  let jobFinished = false;

  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });

  // ── V3 mocks: the durable job endpoint and the n8n gateway ────────────────
  // These are the ONLY calls the scene-generation path may make; both are
  // mocked so nothing is created, charged, or generated for real.
  await page.route("**/api/video-jobs**", async (route) => {
    if (route.request().method() !== "POST") {
      // V5: the shared observer restores/polls job state through this owned GET.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify({
          id: DURABLE_JOB_ID,
          status: {
            generationState: jobFinished ? "succeeded" : "queued",
            billingState: jobFinished ? "charged" : "not_charged",
            retryState: "none",
            message: null,
            errorCode: null,
            attempt: 1,
          },
          video_urls: jobFinished ? ["https://cdn.example.test/scene-1.mp4"] : [],
          scene_spec: null,
        }),
      });
      return;
    }
    videoJobPosts.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: DURABLE_JOB_ID,
        generation_state: "queued",
        billing_state: "not_charged",
        retry_state: "none",
        attempt: 1,
        idempotent: false,
      }),
    });
  });

  await page.route("**/api/video/nano-banana**", async (route) => {
    nanoBananaPosts.push((route.request().postDataJSON() ?? {}) as Record<string, unknown>);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });

  // Hard stop on anything that would generate, charge, or write a content row.
  for (const pattern of [
    "**/api/workflows**",
    "**/api/video/storyboard**",
    "**/api/video/suggest**",
    "**/api/tts**",
  ]) {
    // Fulfilled with 403 rather than aborted: the call is still blocked and
    // recorded, but an abort would surface as a synthetic "Failed to fetch"
    // console error and pollute the runtime-error assertion below.
    await page.route(pattern, async (route) => {
      forbiddenCalls.push(route.request().url());
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ error: "blocked by V2 acceptance test" }),
      });
    });
  }
  // Any INSERT/PATCH against the content table would be a production write —
  // and after V3 there should be none at all from the browser.
  await page.route("**/rest/v1/content**", async (route) => {
    const method = route.request().method();
    if (method !== "GET" && method !== "HEAD") {
      forbiddenCalls.push(`${method} content`);
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ error: "blocked by acceptance test" }),
      });
      return;
    }
    // The scene poller reads the placeholder by id. Serve a COMPLETED row for
    // the mocked durable job so the poll resolves immediately instead of
    // spinning for 15 minutes; every other content read passes through.
    if (route.request().url().includes(DURABLE_JOB_ID)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          id: DURABLE_JOB_ID,
          status: "draft",
          generation_state: "succeeded",
          billing_state: "charged",
          retry_state: "none",
          video_urls: ["https://cdn.example.test/scene-1.mp4"],
        }),
      });
      return;
    }
    await route.continue();
  });

  // Catch-all for the fixture host so the finished scene's <video> src resolves
  // instead of raising ERR_NAME_NOT_RESOLVED. Registered BEFORE the sheet route
  // so the more specific sheet mock (added later) still wins.
  await page.route("https://cdn.example.test/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "video/mp4",
      headers: { "access-control-allow-origin": "*" },
      body: Buffer.alloc(0),
    });
  });

  // Mocked sheet image, CORS-enabled so the canvas is not tainted by the crop.
  await page.route(SHEET_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" },
      body: SHEET_PNG,
    });
  });

  // Mocked Supabase Storage upload — the panel crop must never reach real storage.
  let storageUploads = 0;
  await page.route("**/storage/v1/object/assets/**", async (route) => {
    if (route.request().method() === "POST") {
      storageUploads += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ Key: "assets/videos/mocked/panel.png" }),
      });
      return;
    }
    await route.continue();
  });

  await login(page);

  // Resolve the active brand the same way the app does, then seed a LEGACY sheet
  // under that brand's keys before the Video Studio mounts.
  await page.goto("/dashboard/video");

  // The mode cards only render once an active brand exists (otherwise the page
  // shows its "No Brand" fallback), so this is the observable signal that the
  // brand store has hydrated — more reliable than polling localStorage blind.
  await expect(page.getByText("Storytelling", { exact: false }).first())
    .toBeVisible({ timeout: COLD_COMPILE_TIMEOUT_MS });

  const brandId = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem("blink-active-brand");
      return raw ? (JSON.parse(raw)?.state?.activeBrand?.id ?? null) : null;
    } catch { return null; }
  });

  expect(brandId, "an active brand is required to key the sheet storage").toBeTruthy();

  await page.evaluate(({ id, url, panels }) => {
    localStorage.setItem(`blink_comic::${id}`, url);
    localStorage.setItem(`blink_comic_panels::${id}`, JSON.stringify(panels));
  }, { id: brandId, url: SHEET_URL, panels: LEGACY_PANELS });

  await page.reload();

  // ── Video Studio renders after the V2 edits ────────────────────────────────
  await page.getByText("Storytelling", { exact: false }).first().click();
  await expect(page.getByRole("button", { name: "4-Shot Sheet" })).toBeVisible({ timeout: 30_000 });

  // ── The legacy sheet was restored (adapted on read) ────────────────────────
  await page.getByRole("button", { name: "4-Shot Sheet" }).click();
  await expect(page.getByAltText("Four-shot storyboard sheet")).toBeVisible({ timeout: 15_000 });

  // ── Prepare a scene from panel 1: the real adaptation path ─────────────────
  // `animateComicPanel` returns silently until the client id has resolved, so
  // click until it takes (a no-op click does nothing and cannot double-prepare).
  const prepare = page.getByRole("button", { name: "Prepare Scene 1" });
  const preparedToast = page.getByText(/is ready with its start frame/i).first();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await preparedToast.isVisible().catch(() => false)) break;
    await prepare.click();
    await page.waitForTimeout(1_000);
  }

  // V4: the success path now shows a non-blocking TOAST (the alert is gone) and
  // switches back to the storyboard view.
  await expect(page.getByText(/is ready with its start frame/i).first())
    .toBeVisible({ timeout: 30_000 });

  // The prepared scene must carry the LEGACY panel's motion prompt — proving the
  // ad-hoc panel was adapted into a SceneSpec and read back through spec fields.
  // React-controlled textareas hold their content in `value`, not DOM text.
  await expect
    .poll(
      async () => page.evaluate(() =>
        Array.from(document.querySelectorAll("textarea")).map((t) => (t as HTMLTextAreaElement).value).join("\n")
      ),
      { timeout: 20_000 }
    )
    .toMatch(/LEGACY-VIDEO-1/);

  // ── V3: generating the scene must go through the DURABLE job endpoint ──────
  // The direct browser `content` insert is gone; the placeholder is created by
  // the owned, DB-idempotent /api/video-jobs endpoint instead.
  // The prepared scene is APPENDED after the four default empty scenes, so it is
  // the last one. (The empty scenes correctly refuse to generate — they have no
  // motion prompt — which is why the first button must not be used here.)
  const lastScenePrompt = await page.evaluate(() => {
    const areas = Array.from(document.querySelectorAll("textarea")) as HTMLTextAreaElement[];
    const filled = areas.filter((t) => t.value.trim().length > 0);
    return filled.length > 0 ? filled[filled.length - 1].value : "";
  });
  expect(lastScenePrompt, "the prepared scene must hold the legacy panel's motion prompt").toContain("LEGACY-VIDEO-1");

  await page.getByRole("button", { name: "Generate Scene Video" }).last().click();

  await expect.poll(() => videoJobPosts.length, { timeout: 60_000 }).toBe(1);

  expect(videoJobPosts.length, "exactly one durable placeholder per attempt").toBe(1);

  const jobBody = videoJobPosts[0];
  expect(jobBody.content_type).toBe("sequence_clip");
  expect(typeof jobBody.idempotency_key).toBe("string");
  // The validated SceneSpec travels with the placeholder, carrying the legacy
  // panel's intent all the way into the durable row.
  const sentSpec = jobBody.scene_spec as Record<string, unknown>;
  expect(sentSpec.schemaVersion).toBe(1);
  expect(String(sentSpec.videoPrompt)).toContain("LEGACY-VIDEO-1");
  // No tenant identity or billing authority is ever sent from the browser.
  expect(Object.keys(jobBody)).not.toContain("client_id");
  expect(Object.keys(jobBody)).not.toContain("credit_cost");

  // n8n is invoked with the placeholder id the SERVER returned.
  await expect.poll(() => nanoBananaPosts.length, { timeout: 60_000 }).toBeGreaterThan(0);
  expect(nanoBananaPosts[0].post_id).toBe(DURABLE_JOB_ID);

  // ── V4: visible sequence state while the scene is still in flight ─────────
  const sequenceStatus = page.getByTestId("sequence-status");
  await expect(sequenceStatus).toBeVisible({ timeout: 60_000 });
  await expect(sequenceStatus).toContainText(/generating/i, { timeout: 60_000 });

  // ── V5: RESTORATION — reload mid-flight and re-attach without resubmitting ─
  const postsBeforeReload = videoJobPosts.length;
  await page.reload();

  // The video page returns to its mode picker after a reload (step state is not
  // persisted — recorded as a known UX limitation), so re-enter Storytelling.
  // The scenes themselves and the in-flight job set ARE persisted.
  // The reload recompiles the route on a dev server, so wait for the mode cards
  // on an observable condition with a compile-sized budget before clicking.
  const storytellingCard = page.getByText("Storytelling", { exact: false }).first();
  await expect(storytellingCard).toBeVisible({ timeout: COLD_COMPILE_TIMEOUT_MS });
  await storytellingCard.click();

  // The storyboard comes back and the in-flight scene is observed again.
  await expect(page.getByTestId("sequence-status")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("sequence-status")).toContainText(/generating/i, { timeout: 60_000 });

  // The headline V5 guarantee: restoration OBSERVES, it never resubmits — a
  // resubmit would create a second job and risk a second n8n deduction.
  expect(
    videoJobPosts.length,
    "restoration must not create another durable job",
  ).toBe(postsBeforeReload);

  // ── V5: the observed job completes and the panel updates without a reload ──
  jobFinished = true;
  await expect(page.getByTestId("sequence-status"))
    .toContainText(/1 of 5 scenes ready/i, { timeout: 90_000 });

  // The V4 headline guarantee: every former alert() is now a non-blocking toast.
  expect(dialogs, `blocking dialogs must be gone, saw: ${dialogs.join(" | ")}`).toEqual([]);

  // ── Safety assertions ──────────────────────────────────────────────────────
  // `forbiddenCalls` records any direct non-GET write to `content`. It must be
  // empty: proving V3 removed the browser-side insert entirely.
  expect(forbiddenCalls, "no direct content write may occur — V3 routes it through /api/video-jobs").toEqual([]);
  expect(storageUploads, "the panel crop uploaded only to the mock").toBeGreaterThan(0);

  // Two console errors are PROVEN pre-existing in this environment, not caused by
  // V2. A probe that only logs in, opens /dashboard/video and reloads — with no
  // SceneSpec seeding and no route mocks at all — reproduces both:
  //   1. "TypeError: Failed to fetch" from SupabaseAuthClient._getUser, an
  //      in-flight auth request cancelled by the reload.
  //   2. The React hydration-mismatch warning, already tracked in Kezie-OS
  //      known-issues as "Dashboard hydration mismatch" (observed 2026-07-12).
  // Everything else must be clean.
  const realErrors = consoleErrors.filter(
    (e) =>
      !/favicon|Download the React DevTools|Image with src/i.test(e) &&
      !/A tree hydrated but some attributes/i.test(e) &&
      !/TypeError: Failed to fetch/i.test(e)
  );
  expect(realErrors, `unexpected runtime errors: ${realErrors.join(" | ")}`).toEqual([]);
});
