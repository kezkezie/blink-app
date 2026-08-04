import { test, expect, type Page, type Route } from "@playwright/test";

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const IMAGE_CONCEPTS = [
  { id: "concept-1", title: "Warm Reflections", idea: "Echo the image's amber light across a calm hero shot.", angle: "Mood and warmth", format: "image" },
  { id: "concept-2", title: "Texture Forward", idea: "Lift the materials and composition into a tactile close-up.", angle: "Sensory detail", format: "image" },
  { id: "concept-3", title: "Clean Restage", idea: "Rebuild the palette on a minimalist studio backdrop.", angle: "Premium clarity", format: "image" },
];

async function login(page: Page) {
  if (!email || !password) throw new Error("E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be configured");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/dashboard(?:\/|$)/, { timeout: 20_000 });
}

test("inspiration image → 3 concepts on 'What would you like to create?' (one request, zero dialogs)", async ({ page }) => {
  test.setTimeout(90_000);
  const dialogs: string[] = [];
  page.on("dialog", (d) => { dialogs.push(d.type()); void d.dismiss(); });

  let conceptRequests = 0;
  const bodies: Array<Record<string, unknown>> = [];

  // Mock the concepts endpoint (no real AI / billing — that is unit-tested).
  await page.route("**/api/ai/assisted-creation", async (route: Route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    if (body.operation === "concepts") conceptRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ concepts: IMAGE_CONCEPTS }) });
  });
  // Mock the Supabase storage upload so the file → public URL resolves offline.
  await page.route("**/storage/v1/object/assets/**", async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "assets/uploaded" }) });
  });

  await login(page);
  await page.goto("/dashboard/generate");
  await expect(page.getByRole("heading", { name: "What would you like to create?" })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => localStorage.removeItem("blink-assisted-creation-draft"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "What would you like to create?" })).toBeVisible({ timeout: 15_000 });
  // Session/client id ready (upload needs it).
  await expect.poll(async () => (await page.request.get("/api/credits/balance")).ok(), { timeout: 15_000 }).toBe(true);

  // The inspiration affordance is discoverable and priced.
  await expect(page.getByText(/BlinkSpot reads it and gives you 3 concepts/i)).toBeVisible();
  await expect(page.getByText(/uses 1 credit/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload image" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose from Grid" })).toBeVisible();

  // Attach an inspiration image via the hidden file input. clientId resolves via a
  // client-side Supabase query just after mount, so retry the attach until it lands
  // (a no-op attach before clientId is ready uploads nothing and shows no preview).
  const fileInput = page.locator('input[type="file"]').first();
  const ready = page.getByText("Inspiration image ready");
  await expect(async () => {
    await fileInput.setInputFiles({ name: "inspo.png", mimeType: "image/png", buffer: PNG_1x1 });
    await expect(ready).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 25_000 });
  await expect(page.getByText(/uses 1 credit/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove inspiration image" })).toBeVisible(); // reachable without hover

  // Generate concepts from the image.
  await page.getByRole("button", { name: "Create concepts from image" }).click();
  const concepts = page.locator('[aria-label="Creative concepts"] > button');
  await expect(concepts).toHaveCount(3, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Warm Reflections/ })).toBeVisible();

  // Exactly one concepts request, and it carried the owned inspiration image URL.
  expect(conceptRequests).toBe(1);
  const conceptBody = bodies.find((b) => b.operation === "concepts")!;
  expect(typeof conceptBody.inspirationImageUrl).toBe("string");
  expect(String(conceptBody.inspirationImageUrl)).toContain("/storage/v1/object/public/assets/images/");
  expect(dialogs).toEqual([]);
});
