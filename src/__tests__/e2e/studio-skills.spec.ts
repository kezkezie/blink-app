import { test, expect, type Page } from "@playwright/test";

/**
 * Ask skills (2026-10-12): the page lists the built-in playbooks, a pasted skill is saved, Ask loads
 * it when the request fits and follows it (LIVE, about $0.01 of Claude, included in the plan's
 * messages), then the skill is deleted.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test studio-skills
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
}

test("skills: built-ins listed, add one, Ask follows it, delete it", async ({ page }) => {
  test.skip(!email || !password, "needs E2E login");
  test.setTimeout(240_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`${BASE}/studio/account/skills`);
  await expect(page.getByRole("heading", { name: "Ask skills" })).toBeVisible({ timeout: 30_000 });
  for (const name of ["Poster and ad design", "Motion graphics and animated text", "Landing pages that convert"]) await expect(page.getByText(name, { exact: true })).toBeVisible();
  // The built-in list sits below the account's own skills.
  await page.locator(".s-card", { hasText: "Poster and ad design" }).getByRole("button", { name: "Read the instructions" }).click();
  await expect(page.getByText(/Three zones/)).toBeVisible();

  // Clean up a leftover from an earlier run.
  const before = await (await page.request.get(`${BASE}/api/skills`)).json();
  for (const s of before.mine.filter((x: { name: string }) => x.name === "E2E pineapple sign-off")) await page.request.delete(`${BASE}/api/skills?id=${s.id}`);

  await page.getByRole("button", { name: "Write or paste" }).click();
  await page.getByLabel("Skill name").fill("E2E pineapple sign-off");
  await page.getByLabel("When to use it").fill("Use for every caption request for this account.");
  await page.getByLabel("Instructions").fill("Write the caption the user asks for, then end the whole reply with the single word PINEAPPLE in capitals on its own line.");
  await page.getByRole("button", { name: "Add skill" }).click();
  await expect(page.getByText("E2E pineapple sign-off", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "test-results/skills-page.png", fullPage: true });

  const list = await (await page.request.get(`${BASE}/api/skills`)).json();
  const mine = list.mine.find((x: { name: string }) => x.name === "E2E pineapple sign-off");
  try {
    const res = await page.request.post(`${BASE}/api/assistant`, { data: { messages: [{ role: "user", text: "Write a one-line Instagram caption for our weekend special, using my caption skill." }], effort: "medium", page: "/studio" }, timeout: 180_000 });
    const body = await res.json();
    expect(res.status(), JSON.stringify(body)).toBe(200);
    console.log("ASK with skill:", JSON.stringify(body.reply));
    expect(body.reply).toMatch(/PINEAPPLE\s*$/);
  } finally {
    await page.request.delete(`${BASE}/api/skills?id=${mine.id}`);
  }
  await page.reload();
  await expect(page.getByText("E2E pineapple sign-off", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
