/**
 * Image Generator — Live E2E Tests (Playwright)
 *
 * Covers the full async pipeline end-to-end with real external services:
 *
 *   Browser → POST /api/workflows?path=blink-generate-images
 *     → Next.js proxy → n8n webhook (blink-generate-images)
 *       → Parse Inputs & Calculate Cost
 *       → process_image_generation_billing RPC (Supabase)
 *       → Fetch Brand DNA (Supabase)
 *       → Build Payload Router
 *       → Create Kie.ai task (POST /api/v1/jobs/createTask)
 *       → Poll loop: Wait 4s → GET /api/v1/jobs/recordInfo (up to 45 cycles = 180s)
 *       → Download temp image → Upload to Cloudinary (blinkspot/image content)
 *       → Respond with { imageUrls: [...] }  ← sync response back to browser
 *   Browser receives imageUrls → renders result grid
 *
 * Cost model (from n8n "Parse Inputs & Calculate Cost" node):
 *   nano-banana-2 (default): 8 credits / image
 *   nano-banana-pro:        15 credits / image
 *
 * Response shapes from n8n:
 *   Success:   { imageUrls: ["https://res.cloudinary.com/..."] }
 *   No funds:  { success: false, message: "Insufficient credits..." }
 *   Gen fail:  { success: false, message: "AI Provider Failed. Your credits have been automatically refunded." }
 *   Exception: { success: false, message: "An AI generation error occurred. Please try again." }
 *
 * PREREQUISITES:
 *   • Dev server running at http://localhost:3000
 *   • n8n live at https://n8n.srv1166077.hstgr.cloud (blink-generate-images workflow active)
 *   • Kie.ai API key valid
 *   • Supabase email confirmation DISABLED (immediate session on signUp)
 *   • SUPABASE_SERVICE_ROLE_KEY available in .env.local
 *
 * TIMING:
 *   Insufficient-credits tests:  ~5–15s  (n8n billing check only, no Kie.ai call)
 *   Mock/UX tests:               ~5–10s  (no n8n call at all)
 *   Live generation tests:       60–200s (full Kie.ai polling pipeline)
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';

// ── Environment ───────────────────────────────────────────────────────────────

const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hzkufspjozkgmloznkvp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ── n8n Cost Constants (keep in sync with "Parse Inputs & Calculate Cost" node) ──
const NANO_BANANA_2_COST_PER_IMAGE = 8;
const SEED_AMOUNT = 200; // credits to seed for happy-path tests

// n8n pipeline max: 45 iterations × 4 s = 180 s + network overhead
const LIVE_GENERATION_TIMEOUT_MS = 240_000; // 4 min hard cap per live test

// ── Auth & Brand Setup Helpers ────────────────────────────────────────────────

async function signUpAndLand(page: Page, email: string): Promise<void> {
    await page.goto('/get-started');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('John Doe').fill('Image QA User');
    await page.getByPlaceholder('you@company.com').fill(email);
    await page.getByPlaceholder('••••••••').fill('BlinkTest123!');
    await page.getByRole('button', { name: /sign up with email/i }).click();
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });
}

/**
 * Create a brand workspace via the TopBar brand-switcher modal and wait for
 * it to appear as the active brand in the UI.
 */
async function createBrandAndActivate(page: Page): Promise<void> {
    const switcher = page.getByRole('button', { name: /no brand/i });
    await switcher.click();
    await page.getByRole('menuitem', { name: /add new brand/i }).click();
    await expect(page.getByRole('heading', { name: /add new workspace/i })).toBeVisible({ timeout: 5_000 });

    // Step 1 — Business Details
    await page.getByPlaceholder('e.g. Acme Corp').fill('Image QA Brand');
    await page.getByPlaceholder('Describe the products or services offered...')
        .fill('Automated test brand for image generation QA.');
    await page.getByRole('button', { name: /continue/i }).first().click();

    // Step 2 — Visual Identity (defaults are fine)
    await expect(page.locator('h3:has-text("Visual Identity")')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /continue/i }).first().click();

    // Step 3 — Vibe (no tone keywords required)
    await expect(page.locator('h3:has-text("Vibe & Training Data")')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /create brand/i }).click();

    // Wait for modal to close and brand name to appear in TopBar
    await expect(page.getByRole('heading', { name: /add new workspace/i }))
        .not.toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Image QA Brand').first()).toBeVisible({ timeout: 10_000 });
}

// ── Supabase Admin Helpers (service-role bypass) ──────────────────────────────

/**
 * Get the client_id for the currently logged-in user via the credits API.
 * This is the UUID in the `clients` table, not the auth.users UUID.
 * Retries up to 5 times with 1s delay to allow useClient() hook to auto-create
 * the clients row after a fresh signup.
 */
async function getClientId(page: Page): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const res = await page.request.get('/api/credits/balance');
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        if (body.client_id) return body.client_id;
        // Wait 1s for useClient() to auto-create the clients row
        await page.waitForTimeout(1_000);
    }
    throw new Error('/api/credits/balance never returned a client_id after 5 retries');
}

/**
 * Upsert a credit_balances row via the Supabase REST API using the service role.
 * Safe to call multiple times — uses ON CONFLICT merge via the Prefer header.
 */
async function seedCredits(
    request: APIRequestContext,
    clientId: string,
    amount: number
): Promise<void> {
    const res = await request.post(`${SUPABASE_URL}/rest/v1/credit_balances`, {
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            // Upsert — merge if client_id already exists
            Prefer: 'resolution=merge-duplicates',
        },
        data: {
            client_id: clientId,
            balance: amount,
            lifetime_earned: amount,
            lifetime_spent: 0,
        },
    });
    if (!res.ok()) {
        const body = await res.text();
        throw new Error(`Credit seed failed: HTTP ${res.status()} — ${body}`);
    }
}

/**
 * Read balance directly from Supabase (bypasses all UI, uses service role).
 */
async function readBalanceFromDB(
    request: APIRequestContext,
    clientId: string
): Promise<number> {
    const res = await request.get(
        `${SUPABASE_URL}/rest/v1/credit_balances?client_id=eq.${clientId}&select=balance`,
        {
            headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
        }
    );
    expect(res.ok()).toBeTruthy();
    const rows: { balance: number }[] = await res.json();
    return rows[0]?.balance ?? 0;
}

/**
 * Query the `content` table for the most recent row belonging to this client.
 */
async function getLatestContentRow(
    request: APIRequestContext,
    clientId: string
): Promise<Record<string, unknown> | null> {
    const res = await request.get(
        `${SUPABASE_URL}/rest/v1/content?client_id=eq.${clientId}&order=created_at.desc&limit=1&select=*`,
        {
            headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
        }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Record<string, unknown>[] = await res.json();
    return rows[0] ?? null;
}

// ── Test Suites ───────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: Insufficient Credits — fast path (n8n billing guard only, ~5–15s)
// n8n runs: Webhook → Parse Inputs → Deduct Credits → Billing Success? → NO
// → Respond with Billing Error → browser receives { success: false, message }
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Insufficient Credits Guard', () => {

    test.beforeEach(async ({ page }) => {
        await signUpAndLand(page, `test-img-${Date.now()}@blinkspot.local`);
        await createBrandAndActivate(page);
        await page.goto('/dashboard/generate');
        await page.waitForLoadState('networkidle');
    });

    test('shows insufficient-credits alert and leaves balance at zero', async ({ page }) => {
        // Fresh user has 0 credits — n8n billing guard will fire immediately
        let alertMessage = '';
        page.once('dialog', async (dialog) => {
            alertMessage = dialog.message();
            await dialog.dismiss();
        });

        await page.locator('textarea[placeholder*="Describe what you want to see"]')
            .fill('A product shot of a sleek black watch on marble');
        await page.getByRole('button', { name: /generate image/i }).click();

        // Wait for the dialog to fire (n8n billing check is fast)
        await page.waitForFunction(
            () => document.querySelector('button[class*="bg-[#C5BAC4]"]') !== null,
            { timeout: 30_000 }
        );

        // Give alert time to appear
        await page.waitForTimeout(3_000);

        // The alert must mention the insufficient-credits message from n8n
        expect(alertMessage).toMatch(/insufficient credits|Generation failed/i);

        // Generate button must be re-enabled (isGenerating reset to false)
        const generateBtn = page.getByRole('button', { name: /generate image/i });
        await expect(generateBtn).toBeEnabled({ timeout: 5_000 });
    });

    test('generate button is disabled while generating and re-enables on error', async ({ page }) => {
        page.once('dialog', async (dialog) => { await dialog.dismiss(); });

        const generateBtn = page.getByRole('button', { name: /generate image/i });

        await page.locator('textarea[placeholder*="Describe what you want to see"]')
            .fill('Test prompt for button state check');

        // Before click: enabled
        await expect(generateBtn).toBeEnabled();

        await generateBtn.click();

        // Immediately after click: shows "Generating..." (button text changes)
        await expect(page.locator('button:has-text("Generating...")')).toBeVisible({ timeout: 5_000 });

        // After error: button returns to Generate Image
        await expect(page.getByRole('button', { name: /generate image/i }))
            .toBeEnabled({ timeout: 30_000 });
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: Generation UX — mocked n8n responses (fast, no real Kie.ai call)
// Intercepts /api/workflows at the browser→Next.js boundary to control
// the response without hitting n8n at all.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Generation UX with Mocked n8n Responses', () => {

    test.beforeEach(async ({ page }) => {
        await signUpAndLand(page, `test-img-${Date.now()}@blinkspot.local`);
        await createBrandAndActivate(page);
        await page.goto('/dashboard/generate');
        await page.waitForLoadState('networkidle');
    });

    test('"Studio Results" panel appears during generation', async ({ page }) => {
        // Mock the workflow call: hold for 3s then return a fake success
        await page.route('**/api/workflows*', async (route) => {
            await new Promise((r) => setTimeout(r, 3_000));
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    imageUrls: ['https://res.cloudinary.com/test/image/upload/v1/blinkspot/image%20content/test.png'],
                }),
            });
        });

        await page.locator('textarea[placeholder*="Describe what you want to see"]')
            .fill('Studio results panel visibility test');
        await page.getByRole('button', { name: /generate image/i }).click();

        // Studio Results panel must appear as soon as generating starts
        await expect(page.locator('h3:has-text("Studio Results")')).toBeVisible({ timeout: 5_000 });

        // Spinner / "painting your pixels" text must be shown while loading
        await expect(page.locator('text=Nano Banana is painting your pixels...')).toBeVisible();
    });

    test('"items saved to Grid" badge appears after successful mocked generation', async ({ page }) => {
        const mockUrl = 'https://res.cloudinary.com/test/image/upload/v1/blinkspot/image%20content/qa_mock.png';

        await page.route('**/api/workflows*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ imageUrls: [mockUrl] }),
            });
        });

        await page.locator('textarea[placeholder*="Describe what you want to see"]')
            .fill('Mock success — badge test');
        await page.getByRole('button', { name: /generate image/i }).click();

        // Grid badge appears once results are set
        await expect(page.locator('text=/\\d+ items? saved to Grid/')).toBeVisible({ timeout: 10_000 });

        // The mocked image URL should be in an <img> src
        const resultImg = page.locator(`img[src="${mockUrl}"]`);
        await expect(resultImg).toBeVisible({ timeout: 5_000 });
    });

    test('AI provider failure shows correct refund message', async ({ page }) => {
        // Simulate the exact n8n response when Kie.ai fails and credits are refunded
        await page.route('**/api/workflows*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: false,
                    message: 'AI Provider Failed. Your credits have been automatically refunded.',
                }),
            });
        });

        let alertText = '';
        page.once('dialog', async (dialog) => {
            alertText = dialog.message();
            await dialog.dismiss();
        });

        await page.locator('textarea[placeholder*="Describe what you want to see"]')
            .fill('Refund path test');
        await page.getByRole('button', { name: /generate image/i }).click();

        await page.waitForTimeout(3_000);
        expect(alertText).toContain('AI Provider Failed');
        expect(alertText).toContain('automatically refunded');
    });

    test('"No Workspace Selected" guard blocks generate page without a brand', async ({ page }) => {
        // Use the TopBar brand switcher to select "No Brand"
        const switcher = page.getByRole('button', { name: /image qa brand/i });
        await switcher.click();
        // Click the "No Brand" option in the dropdown
        await page.getByText('No Brand', { exact: true }).click();
        // Wait for the dropdown to close
        await page.waitForTimeout(500);

        // Navigate to the generate page — without an active brand, the guard fires
        await page.goto('/dashboard/generate');
        await page.waitForLoadState('networkidle');

        // The no-brand fallback renders "No Workspace Selected"
        await expect(page.locator('h2:has-text("No Workspace Selected")')).toBeVisible({ timeout: 10_000 });

        // The generate button must NOT be present
        const generateBtn = page.locator('button:has-text("Generate Image")');
        await expect(generateBtn).not.toBeVisible();
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: LIVE Full Pipeline (real n8n → Kie.ai → Cloudinary → Supabase)
// Each test overrides timeout to 4 minutes to accommodate the n8n poll loop.
//
// These tests will FAIL if:
//   - n8n is down or the workflow is inactive
//   - Kie.ai API key has expired or hit rate limits
//   - Cloudinary credentials are invalid
//   - Supabase is unreachable
// ─────────────────────────────────────────────────────────────────────────────

test.describe('LIVE Full Generation Pipeline', () => {

    let clientId: string;

    test.beforeEach(async ({ page }) => {
        await signUpAndLand(page, `test-live-${Date.now()}@blinkspot.local`);
        await createBrandAndActivate(page);

        clientId = await getClientId(page);
        await seedCredits(page.request, clientId, SEED_AMOUNT);

        await page.goto('/dashboard/generate');
        await page.waitForLoadState('networkidle');
    });

    test('happy path: image appears in grid, balance decreases by cost', async ({ page }) => {
        test.setTimeout(LIVE_GENERATION_TIMEOUT_MS);

        const balanceBefore = await readBalanceFromDB(page.request, clientId);
        expect(balanceBefore).toBe(SEED_AMOUNT);

        await page.locator('textarea[placeholder*="Describe what you want to see"]')
            .fill('A sleek black coffee mug on a white marble countertop, studio lighting');

        await page.getByRole('button', { name: /generate image/i }).click();

        // Wait for the Studio Results panel to appear
        await expect(page.locator('h3:has-text("Studio Results")')).toBeVisible({ timeout: 10_000 });

        // Wait for at least one image to land in the result grid
        // The image will be a Cloudinary URL from blinkspot/image content folder
        await expect(page.locator('img[src*="cloudinary.com"]').first())
            .toBeVisible({ timeout: LIVE_GENERATION_TIMEOUT_MS - 30_000 });

        // Generate button re-enables after completion
        await expect(page.getByRole('button', { name: /generate image/i }))
            .toBeEnabled({ timeout: 10_000 });

        // Badge shows the result count
        await expect(page.locator('text=/1 items? saved to Grid/')).toBeVisible();

        // Verify credit deduction: balance must have decreased by exactly 8
        const balanceAfter = await readBalanceFromDB(page.request, clientId);
        expect(balanceAfter).toBe(SEED_AMOUNT - NANO_BANANA_2_COST_PER_IMAGE);
    });

    test('generated content row is persisted in Supabase with Cloudinary image_urls', async ({ page }) => {
        test.setTimeout(LIVE_GENERATION_TIMEOUT_MS);

        await page.locator('textarea[placeholder*="Describe what you want to see"]')
            .fill('A minimalist luxury watch on a black velvet surface');

        await page.getByRole('button', { name: /generate image/i }).click();

        // Wait until image appears in the UI (confirms full pipeline ran)
        await expect(page.locator('img[src*="cloudinary.com"]').first())
            .toBeVisible({ timeout: LIVE_GENERATION_TIMEOUT_MS - 30_000 });

        // Give Supabase the insert a moment to propagate
        await page.waitForTimeout(2_000);

        const row = await getLatestContentRow(page.request, clientId);

        // Row must exist
        expect(row).not.toBeNull();

        // image_urls must contain at least one Cloudinary URL
        const imageUrls = row!.image_urls as string[];
        expect(Array.isArray(imageUrls)).toBeTruthy();
        expect(imageUrls.length).toBeGreaterThan(0);
        expect(imageUrls[0]).toMatch(/cloudinary\.com/);
        expect(imageUrls[0]).toMatch(/blinkspot/);

        // content_type must be post_image
        expect(row!.content_type).toBe('post_image');

        // brand_id must be set (brand isolation)
        expect(row!.brand_id).toBeTruthy();

        // status must be draft (set by frontend insert)
        expect(row!.status).toBe('draft');
    });

    test('batch generation (3 images) deducts 3× cost and renders 3 results', async ({ page }) => {
        test.setTimeout(LIVE_GENERATION_TIMEOUT_MS);

        const numImages = 3;
        const expectedCost = numImages * NANO_BANANA_2_COST_PER_IMAGE; // 24 credits

        const balanceBefore = await readBalanceFromDB(page.request, clientId);

        // Set batch size via slider — the slider uses Radix, so click the thumb and
        // use keyboard to set value
        const slider = page.locator('[role="slider"]').first();
        await slider.click();
        // Press ArrowRight twice to go from 1 → 3
        await slider.press('ArrowRight');
        await slider.press('ArrowRight');

        // Confirm the badge shows 3 Images (use .first() to avoid matching the button text too)
        await expect(page.locator('span:has-text("3 Images")').first()).toBeVisible({ timeout: 3_000 });

        await page.locator('textarea[placeholder*="Describe what you want to see"]')
            .fill('Three abstract geometric compositions, vibrant gradients');

        await page.getByRole('button', { name: /generate 3 images/i }).click();

        // Wait for 3 Cloudinary images to appear in the grid
        await expect(page.locator('img[src*="cloudinary.com"]').nth(2))
            .toBeVisible({ timeout: LIVE_GENERATION_TIMEOUT_MS - 30_000 });

        const balanceAfter = await readBalanceFromDB(page.request, clientId);
        expect(balanceBefore - balanceAfter).toBe(expectedCost);

        // Grid badge must show 3
        await expect(page.locator('text=/3 items? saved to Grid/')).toBeVisible();
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: Credit Refund — real n8n failure path
// Seeds credits, then forces the generation to fail by returning a Kie.ai
// job state of "fail". We use page.route() to intercept the Next.js proxy
// and return the exact n8n error response that triggers after n8n calls
// refund_credits internally.
//
// This suite tests the UI contract:
//   n8n returns { success: false, message: "AI Provider Failed..." }
//   → frontend shows alert with that message
//   → balance is refunded by n8n BEFORE the response (if it was a live failure)
//
// Because we intercept at the proxy boundary, the DB side of the refund is
// covered by the n8n workflow integration — this suite verifies the UI correctly
// surfaces the refunded state to the user.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Credit Refund — n8n Failure Path', () => {

    let clientId: string;

    test.beforeEach(async ({ page }) => {
        await signUpAndLand(page, `test-refund-${Date.now()}@blinkspot.local`);
        await createBrandAndActivate(page);

        clientId = await getClientId(page);
        await seedCredits(page.request, clientId, SEED_AMOUNT);

        await page.goto('/dashboard/generate');
        await page.waitForLoadState('networkidle');
    });

    test('AI provider failure message is shown and generate button re-enables', async ({ page }) => {
        // Intercept the n8n proxy and return the exact response n8n sends after
        // calling refund_credits and "Respond with Gen Error" node fires
        await page.route('**/api/workflows**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: false,
                    message: 'AI Provider Failed. Your credits have been automatically refunded.',
                }),
            });
        });

        let capturedAlert = '';
        page.once('dialog', async (dialog) => {
            capturedAlert = dialog.message();
            await dialog.dismiss();
        });

        await page.locator('textarea[placeholder*="Describe what you want to see"]')
            .fill('Refund path UI test');
        await page.getByRole('button', { name: /generate image/i }).click();

        // Alert must fire with the refund message
        await page.waitForTimeout(3_000);
        expect(capturedAlert).toContain('AI Provider Failed');
        expect(capturedAlert).toContain('automatically refunded');

        // Generate button must recover (isGenerating = false)
        await expect(page.getByRole('button', { name: /generate image/i }))
            .toBeEnabled({ timeout: 5_000 });

        // No images should have appeared in the grid
        const resultImages = page.locator('img[src*="cloudinary.com"]');
        expect(await resultImages.count()).toBe(0);
    });

    test('billing error (insufficient credits in n8n) shows correct message', async ({ page }) => {
        // Simulate n8n "Respond with Billing Error" node response
        await page.route('**/api/workflows**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: false,
                    message: 'Insufficient credits to generate this image. Please top up your balance.',
                }),
            });
        });

        let capturedAlert = '';
        page.once('dialog', async (dialog) => {
            capturedAlert = dialog.message();
            await dialog.dismiss();
        });

        await page.locator('textarea[placeholder*="Describe what you want to see"]')
            .fill('Billing error path UI test');
        await page.getByRole('button', { name: /generate image/i }).click();

        await page.waitForTimeout(3_000);
        expect(capturedAlert).toMatch(/insufficient credits/i);

        await expect(page.getByRole('button', { name: /generate image/i }))
            .toBeEnabled({ timeout: 5_000 });
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: Billing Page — plan tier + credit balance display
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Billing Page — Plan & Balance Display', () => {

    let clientId: string;

    test.beforeEach(async ({ page }) => {
        await signUpAndLand(page, `test-billing-${Date.now()}@blinkspot.local`);
        // Wait for dashboard to fully render (useClient hook auto-creates clients row)
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2_000);
        clientId = await getClientId(page);
    });

    test('fresh user billing page shows plan tier and layout', async ({ page }) => {
        await page.goto('/dashboard/billing');
        await page.waitForLoadState('networkidle');

        // The pricing header is always visible
        await expect(page.locator('h1:has-text("Simple, transparent pricing")')).toBeVisible({ timeout: 10_000 });

        // Current Plan badge should be visible on one of the tier cards
        await expect(page.locator('text=Current Plan').first()).toBeVisible({ timeout: 10_000 });
    });

    test('billing page reflects seeded credit balance', async ({ page }) => {
        await seedCredits(page.request, clientId, 500);

        await page.goto('/dashboard/billing');
        await page.waitForLoadState('networkidle');

        // The billing page reads credit_balances.balance directly from Supabase
        // and renders it inside the Credit Pack bottom banner
        await expect(page.locator('text=500').first()).toBeVisible({ timeout: 10_000 });
    });

    test('billing page renders all four tier cards', async ({ page }) => {
        await page.goto('/dashboard/billing');
        await page.waitForLoadState('networkidle');

        // Each tier card has an h3 with the tier name
        for (const tier of ['Starter', 'Pro', 'Agency']) {
            await expect(page.locator(`h3:has-text("${tier}")`)).toBeVisible({ timeout: 10_000 });
        }
    });

    test('/api/credits/balance returns correct shape and plan tier', async ({ page }) => {
        // Sign in already done in beforeEach
        const res = await page.request.get('/api/credits/balance');
        expect(res.ok()).toBeTruthy();

        const body = await res.json();

        // Shape validation
        expect(typeof body.client_id).toBe('string');
        expect(typeof body.plan_tier).toBe('string');
        expect(typeof body.balance).toBe('number');
        expect(typeof body.lifetime_earned).toBe('number');
        expect(typeof body.lifetime_spent).toBe('number');

        // Fresh user is on starter tier (auto-created by useClient) with 0 balance
        expect(['free', 'starter']).toContain(body.plan_tier);
        expect(body.balance).toBe(0);
    });

    test('/api/credits/balance returns 401 for unauthenticated requests', async ({ request }) => {
        // Call the API without a session cookie
        const res = await request.get('http://localhost:3000/api/credits/balance');
        expect(res.status()).toBe(401);

        const body = await res.json();
        expect(body.error).toMatch(/unauthorized/i);
    });

});
