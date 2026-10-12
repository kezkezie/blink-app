import { test, expect, type Page } from "@playwright/test";

/**
 * Voice input shows the words while you speak (Kezie, 2026-10-12), then Whisper's transcript
 * replaces them. A fake microphone and a fake browser recognizer that "says" two phrases; the
 * transcribe route is mocked, so nothing is charged and no audio leaves the machine.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test studio-dictation
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.use({
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio)/, { timeout: 120_000 });
}

test("dictation: live words appear in the box, then the accurate transcript replaces them", async ({ page }) => {
  test.skip(!email || !password, "needs E2E login");
  test.setTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  // A recognizer that hears "make a poster" then "for the weekend sale", one word group at a time.
  await page.addInitScript(() => {
    class FakeRecognizer {
      lang = ""; continuous = false; interimResults = false;
      onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
      private timers: number[] = [];
      start() {
        const say = (at: number, text: string, isFinal: boolean, index: number) => this.timers.push(window.setTimeout(() => {
          const results = Object.assign([] as unknown[], { length: index + 1 });
          results[0] = Object.assign([{ transcript: "make a poster" }], { isFinal: true, 0: { transcript: "make a poster" } });
          results[index] = Object.assign([{ transcript: text }], { isFinal, 0: { transcript: text } });
          this.onresult?.({ resultIndex: index, results });
        }, at));
        say(300, "make a", false, 0);
        say(700, "make a poster", true, 0);
        say(1100, "for the weekend", false, 1);
      }
      stop() { this.timers.forEach(clearTimeout); this.onend?.(); }
      abort() { this.stop(); }
    }
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognizer;
  });
  let sentAudio = 0;
  await page.route("**/api/transcribe", async (route) => {
    sentAudio = route.request().postDataBuffer()?.length ?? 0;
    await new Promise((r) => setTimeout(r, 600));
    await route.fulfill({ json: { text: "Make a poster for the weekend sale at Kyra." } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`${BASE}/studio`);
  const box = page.locator("textarea").first();
  await expect(box).toBeVisible({ timeout: 30_000 });
  await box.click();
  await box.fill("Idea:");
  const mic = page.getByRole("button", { name: "Speak instead of typing" });
  await mic.click();
  await expect(page.getByText(/Listening \d:\d\d/)).toBeVisible({ timeout: 5_000 });
  // The words show up in the box as they're "said", after what was already typed.
  await expect(box).toHaveValue("Idea: make a poster", { timeout: 5_000 });
  await expect(box).toHaveValue("Idea: make a poster for the weekend", { timeout: 5_000 });
  await page.screenshot({ path: "test-results/dictation-live.png" });
  await page.getByRole("button", { name: "Stop and transcribe" }).click();
  await expect(box).toHaveValue("Idea: Make a poster for the weekend sale at Kyra.", { timeout: 10_000 });
  expect(sentAudio).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});
