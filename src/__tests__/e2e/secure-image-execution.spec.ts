import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const CONTENT_ID = "33333333-3333-4333-8333-333333333333";

async function login(page: Page) {
  if (!email || !password) throw new Error("E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be configured");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/dashboard(?:\/|$)/, { timeout: 20_000 });
}

test("semantic image execution uses owned content identity and safe retry", async ({ page }) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const unexpectedFailures: string[] = [];
  const payloads: Array<Record<string, unknown>> = [];
  let expectedDeniedSeen = false;
  let xrayCalls = 0;
  let generationCalls = 0;

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/workflows") || request.url().includes("/api/generate")) generationCalls += 1;
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/video/nano-banana") && response.status() >= 400) {
      if (response.status() === 404 && !expectedDeniedSeen) expectedDeniedSeen = true;
      else unexpectedFailures.push(`${response.status()} ${response.request().method()}`);
    }
  });

  await login(page);
  await page.route("**/rest/v1/content*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("id") === `eq.${CONTENT_ID}` && url.searchParams.get("select") === "image_urls") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ image_urls: ["https://cdn.example/owned-fixture.png"] }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto(`/dashboard/content/${CONTENT_ID}/edit`);
  await expect(page.getByRole("heading", { name: "AI Image Studio" })).toBeVisible();
  const contentId = page.url().match(/\/dashboard\/content\/([^/]+)\/edit/)?.[1];
  expect(contentId).toBeTruthy();

  await page.route("**/api/video/nano-banana", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    payloads.push(body);
    if (body.video_mode === "xray_image") {
      xrayCalls += 1;
      if (xrayCalls === 1) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Resource not found" }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schema: {
            scene_description: "An owned product image on a quiet surface",
            lighting_and_weather: "Warm window light",
            objects: [{ id: "obj_1", name: "Product", color: "#AA8844", material: "Glass", type: "object" }],
          },
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });

  await page.getByRole("button", { name: "X-Ray Image" }).click();
  await expect(page.getByText("X-Ray failed: Resource not found", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "X-Ray Image" }).click();
  await expect(page.getByText("Product", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply JSON Edits" }).click();
  await expect.poll(() => payloads.length).toBe(3);

  expect(payloads[0]).toEqual({ mode: "scene_video_generator", video_mode: "xray_image", content_id: contentId });
  expect(payloads[1]).toEqual(payloads[0]);
  expect(payloads[2]).toMatchObject({
    mode: "scene_video_generator",
    video_mode: "json_image_edit",
    content_id: contentId,
    kie_model: "nano-banana-2",
  });
  expect(payloads[2]).not.toHaveProperty("client_id");
  expect(payloads[2]).not.toHaveProperty("post_id");
  expect(payloads[2]).not.toHaveProperty("primary_image_url");
  expect(expectedDeniedSeen).toBe(true);
  expect(unexpectedFailures).toEqual([]);
  expect(consoleErrors.filter((message) => message.includes("nano-banana") || message.includes("SemanticImageEditor"))).toEqual([]);
  expect(generationCalls).toBe(0);
});
