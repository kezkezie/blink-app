import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Password reset (2026-10-20). Throwaway account: the login page links to "Forgot your password?",
 * which answers the same for any email; a recovery link (made with the admin API, as the email
 * would carry it) opens /auth/confirm on a fresh browser, sets a new password, and the new password
 * signs in. Deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test password-reset --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("forgot password, then a reset link from another device, then sign in with the new one", async ({ page, browser }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(180_000);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-reset-${stamp}@blinkspot-test.dev`;
  const { data: u } = await sb.auth.admin.createUser({ email, password: `Old-${stamp}-pass`, email_confirm: true, user_metadata: { onboarding_completed: true } });
  try {
    await page.goto(`${BASE}/login`);
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await page.waitForURL(/\/forgot-password/);
    await page.getByLabel("Email").fill(`nobody-${stamp}@blinkspot-test.dev`);
    await page.getByRole("button", { name: /Send the link/ }).click();
    await expect(page.getByRole("status")).toContainText("If nobody-");

    // The link as the email carries it, opened in another browser (no session, no stored code).
    const { data: link, error } = await sb.auth.admin.generateLink({ type: "recovery", email });
    expect(error).toBeNull();
    const other = await browser.newContext();
    const phone = await other.newPage();
    await phone.goto(`${BASE}/auth/confirm?token_hash=${link.properties!.hashed_token}&type=recovery&next=/reset-password`);
    await phone.waitForURL(/\/reset-password/);
    const fresh = `New-${stamp}-pass!`;
    await phone.getByLabel("New password", { exact: true }).fill(fresh);
    await phone.getByLabel("New password again").fill(fresh);
    await phone.getByRole("button", { name: /Save and sign in/ }).click();
    await phone.waitForURL(/\/studio/, { timeout: 30_000 });
    await other.close();

    const check = await browser.newContext();
    const p = await check.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[type="email"]', email);
    await p.fill('input[type="password"]', fresh);
    await p.click('button[type="submit"]');
    await p.waitForURL(/\/(studio|welcome)/, { timeout: 60_000 });
    await check.close();
    // A used link doesn't work twice.
    const again = await browser.newContext(); const a = await again.newPage();
    await a.goto(`${BASE}/auth/confirm?token_hash=${link.properties!.hashed_token}&type=recovery&next=/reset-password`);
    await expect(a.getByText("This link has expired or was already used.")).toBeVisible({ timeout: 15_000 });
    await again.close();
  } finally {
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
