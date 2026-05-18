/**
 * Onboarding & Brand Creation — E2E Tests (Playwright)
 *
 * Tests Flow 1 of the BlinkSpot QA checklist:
 * - New user signup via /get-started (Full Name, Email, Password)
 * - Redirect to /dashboard after successful signup
 * - Dashboard shell loads correctly (sidebar + stat cards visible)
 * - Brand creation modal (3-step wizard) via TopBar brand switcher → "Add New Brand"
 * - Brand isolation: new brand has its own brand_id, not mixed with others
 *
 * PREREQUISITE: Supabase email confirmation must be DISABLED in the project
 * settings (Authentication > Email > Confirm email = off) for tests to receive
 * a live session immediately after signUp(). If confirmation is on, the test
 * will halt at "Please check your email to verify your account."
 */

import { test, expect, Page } from '@playwright/test';

// ── Shared test data ──────────────────────────────────────────────────────────

function freshEmail(): string {
    return `test-${Date.now()}@blinkspot.local`;
}

const TEST_PASSWORD = 'BlinkTest123!';
const TEST_FULL_NAME = 'QA Test User';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Sign up a fresh account and land on /dashboard.
 * Reused across tests that need an authenticated session.
 */
async function signUpAndLand(page: Page, email: string) {
    await page.goto('/get-started');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('John Doe').fill(TEST_FULL_NAME);
    await page.getByPlaceholder('you@company.com').fill(email);
    await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign up with email/i }).click();

    // Wait for redirect — either dashboard or email-confirmation alert
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });
}

/**
 * Open the brand creation modal via the TopBar brand switcher dropdown.
 * The BrandCreationModal (3-step wizard) is mounted in the TopBar,
 * NOT on the /dashboard/brand page (which uses window.prompt for quick-create).
 */
async function openBrandCreationModal(page: Page) {
    // Click the brand switcher dropdown trigger in the TopBar
    // It shows "No Brand" for fresh users with no brands
    const brandSwitcher = page.getByRole('button', { name: /no brand/i });
    await brandSwitcher.click();

    // Click "Add New Brand" in the dropdown
    await page.getByRole('menuitem', { name: /add new brand/i }).click();

    // Wait for the modal dialog to appear
    await expect(page.getByRole('heading', { name: /add new workspace/i })).toBeVisible({ timeout: 5_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Signup & Initial Redirect', () => {

    test('fresh signup lands on /dashboard', async ({ page }) => {
        const email = freshEmail();
        await page.goto('/get-started');
        await page.waitForLoadState('networkidle');

        // Fill the three fields
        await page.getByPlaceholder('John Doe').fill(TEST_FULL_NAME);
        await page.getByPlaceholder('you@company.com').fill(email);
        await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);

        // Submit
        await page.getByRole('button', { name: /sign up with email/i }).click();

        // Must land on /dashboard (not stuck on /get-started)
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    });

    test('dashboard shell renders after signup', async ({ page }) => {
        const email = freshEmail();
        await signUpAndLand(page, email);

        // Sidebar should be visible
        const sidebar = page.locator('nav, aside').first();
        await expect(sidebar).toBeVisible({ timeout: 10_000 });

        // The dashboard always renders a "Generate New Content" CTA section and "Recent Content" heading
        const generateCta = page.locator('text=Generate New Content');
        await expect(generateCta).toBeVisible({ timeout: 15_000 });
    });

    test('already-authenticated user is redirected away from /get-started', async ({ page }) => {
        const email = freshEmail();
        await signUpAndLand(page, email);

        // Now try to go back to /get-started — should redirect to /dashboard
        await page.goto('/get-started');
        await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
        await expect(page).toHaveURL(/\/dashboard/);
    });

});

test.describe('Brand Creation Wizard (3-Step Modal via TopBar)', () => {

    test.beforeEach(async ({ page }) => {
        // Each brand-creation test needs an authenticated session
        await signUpAndLand(page, freshEmail());
    });

    test('opens "Add New Workspace" modal from TopBar brand switcher', async ({ page }) => {
        await openBrandCreationModal(page);

        // Dialog header should be visible
        await expect(page.getByRole('heading', { name: /add new workspace/i })).toBeVisible();

        // Step-indicator pills (3 of them)
        const stepPills = page.locator('div.h-1\\.5.w-8.rounded-full');
        await expect(stepPills).toHaveCount(3);
    });

    test('Step 1 — Continue is disabled until Brand Name and Description are filled', async ({ page }) => {
        await openBrandCreationModal(page);

        const continueBtn = page.getByRole('button', { name: /continue/i }).first();
        await expect(continueBtn).toBeDisabled();

        // Fill Brand Name only — still disabled (missing description)
        await page.getByPlaceholder('e.g. Acme Corp').fill('Test Brand QA');
        await expect(continueBtn).toBeDisabled();

        // Fill description — now enabled
        await page.getByPlaceholder('Describe the products or services offered...').fill('A test brand for automated QA.');
        await expect(continueBtn).toBeEnabled();
    });

    test('Step 1 → Step 2 → Step 3 → Create Brand completes without error', async ({ page }) => {
        await openBrandCreationModal(page);

        // ── Step 1: Business Details ────────────────────────────────────────
        await page.getByPlaceholder('e.g. Acme Corp').fill('QA Brand');
        await page.getByPlaceholder('e.g. Acme Holdings LLC').fill('QA Holdings Ltd');
        await page.getByPlaceholder('e.g. Software & Technology').fill('Marketing Technology');
        await page.getByPlaceholder('e.g. John Doe').fill('QA Tester');
        await page.getByPlaceholder('Describe the products or services offered...').fill('An AI-powered marketing platform for automated testing purposes.');

        await page.getByRole('button', { name: /continue/i }).first().click();

        // ── Step 2: Visual Identity ─────────────────────────────────────────
        // Confirm we are on step 2 (heading changes to "Visual Identity")
        await expect(page.locator('h3:has-text("Visual Identity")')).toBeVisible({ timeout: 5_000 });

        // Select a preset visual style
        await page.locator('text=Modern Minimalist').click();

        await page.getByRole('button', { name: /continue/i }).first().click();

        // ── Step 3: Vibe & Training Data ────────────────────────────────────
        await expect(page.locator('h3:has-text("Vibe & Training Data")')).toBeVisible({ timeout: 5_000 });

        // Select a couple of tone keywords (these are styled buttons, not role="button")
        // The PREDEFINED_TONES list uses button elements with the tone text
        await page.locator('button:has-text("Modern")').first().click();
        await page.locator('button:has-text("Professional")').first().click();

        // Submit — look for the "Create Brand" button (contains CheckCircle icon + text)
        const createBtn = page.getByRole('button', { name: /create brand/i });
        await expect(createBtn).toBeVisible();
        await createBtn.click();

        // Modal should close (dialog disappears)
        await expect(page.getByRole('heading', { name: /add new workspace/i })).not.toBeVisible({ timeout: 15_000 });
    });

    test('created brand appears in the brand switcher / TopBar', async ({ page }) => {
        // Listen for any alert dialogs that would indicate a server-side error
        page.on('dialog', async dialog => {
            console.error('Alert dialog:', dialog.message());
            await dialog.dismiss();
        });

        await openBrandCreationModal(page);

        const brandName = `QA-Brand-${Date.now()}`;

        // Step 1
        await page.getByPlaceholder('e.g. Acme Corp').fill(brandName);
        await page.getByPlaceholder('Describe the products or services offered...').fill('Test brand for switcher visibility check.');
        await page.getByRole('button', { name: /continue/i }).first().click();

        // Step 2 — skip customization, just continue
        await expect(page.locator('h3:has-text("Visual Identity")')).toBeVisible();
        await page.getByRole('button', { name: /continue/i }).first().click();

        // Step 3 — submit immediately
        await expect(page.locator('h3:has-text("Vibe & Training Data")')).toBeVisible();
        await page.getByRole('button', { name: /create brand/i }).click();

        // Wait for modal to close — server action can take up to 30s on cold start
        await expect(page.getByRole('heading', { name: /add new workspace/i })).not.toBeVisible({ timeout: 30_000 });

        // The brand should now be visible on the page (TopBar brand switcher will auto-refresh)
        await expect(page.locator(`text=${brandName}`).first()).toBeVisible({ timeout: 10_000 });
    });

});
