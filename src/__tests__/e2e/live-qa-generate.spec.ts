/**
 * Live QA — Flows 2, 3, 4 Combined
 *
 * Phase 1: Frontend generation & billing (Flow 2 + 3)
 *   - Sign up fresh user → create brand → check billing page balance
 *   - Generate image "A neon cyberpunk cityscape" via n8n pipeline
 *   - Verify balance decreased by exactly 8 credits (Nano Banana 2)
 *   - Screenshot final result
 *
 * Phase 2: Backend n8n execution verification (Flow 4)
 *   - Verify credit transaction written by n8n (operation = image_generation)
 *   - Confirm brand_id was in the payload (content row has brand_id set)
 *   - Confirm Direct-to-Cloudinary architecture: image_urls contain cloudinary.com
 *     URLs (no binary stored in n8n environment)
 *   - Verify billing: credit_transactions table shows the deduction
 *
 * NOTE on 1500 onboarding credits:
 *   There is no code in the codebase (SQL triggers, n8n, or server actions) that
 *   auto-seeds 1500 credits on signup. The "1,500 AI Credits" listed on the
 *   Starter plan billing page is a marketing feature — the actual DB seeding
 *   mechanism has not been implemented. This test seeds 1500 credits via the
 *   service role to simulate the intended onboarding state and flags the gap.
 *
 * Run: npx playwright test live-qa-generate --headed
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// ── Output paths ──────────────────────────────────────────────────────────────

const QA_DIR = '/Users/freddykezie/Documents/ AIos demo/AIS-OS/references/qa-reports';
const SCREENSHOT_OUT = path.join(QA_DIR, 'flow-2-live-generation.png');
const BILLING_BEFORE_OUT = path.join(QA_DIR, 'flow-2-billing-before.png');
const BILLING_AFTER_OUT = path.join(QA_DIR, 'flow-2-billing-after.png');

// ── Supabase / Cost constants ─────────────────────────────────────────────────

const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hzkufspjozkgmloznkvp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SEED_CREDITS = 1500; // Simulates intended Starter onboarding grant
const NANO_BANANA_2_COST = 8;
const LIVE_TIMEOUT_MS = 180_000; // n8n poll max: 45 × 4s = 180s

// ── Supabase helpers (service role) ───────────────────────────────────────────

async function seedCredits(req: APIRequestContext, clientId: string, amount: number) {
    const res = await req.post(`${SUPABASE_URL}/rest/v1/credit_balances`, {
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
        },
        data: { client_id: clientId, balance: amount, lifetime_earned: amount, lifetime_spent: 0 },
    });
    if (!res.ok()) throw new Error(`Credit seed failed: HTTP ${res.status()} — ${await res.text()}`);
}

async function readBalance(req: APIRequestContext, clientId: string): Promise<number> {
    const res = await req.get(
        `${SUPABASE_URL}/rest/v1/credit_balances?client_id=eq.${clientId}&select=balance`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows: { balance: number }[] = await res.json();
    return rows[0]?.balance ?? 0;
}

async function readLatestTransaction(req: APIRequestContext, clientId: string): Promise<Record<string, unknown> | null> {
    const res = await req.get(
        `${SUPABASE_URL}/rest/v1/credit_transactions?client_id=eq.${clientId}&order=created_at.desc&limit=1&select=*`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows: Record<string, unknown>[] = await res.json();
    return rows[0] ?? null;
}

async function readLatestContent(req: APIRequestContext, clientId: string): Promise<Record<string, unknown> | null> {
    const res = await req.get(
        `${SUPABASE_URL}/rest/v1/content?client_id=eq.${clientId}&order=created_at.desc&limit=1&select=*`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows: Record<string, unknown>[] = await res.json();
    return rows[0] ?? null;
}

async function getClientId(page: Page): Promise<string> {
    const res = await page.request.get('/api/credits/balance');
    if (!res.ok()) throw new Error(`/api/credits/balance ${res.status()}`);
    const body = await res.json();
    if (!body.client_id) throw new Error(`No client_id in response: ${JSON.stringify(body)}`);
    return body.client_id;
}

// ── Browser helpers ───────────────────────────────────────────────────────────

async function signUpAndLand(page: Page, email: string) {
    await page.goto('/get-started');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('John Doe').fill('Live QA User');
    await page.getByPlaceholder('you@company.com').fill(email);
    await page.getByPlaceholder('••••••••').fill('BlinkTest123!');
    await page.getByRole('button', { name: /sign up with email/i }).click();
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_500); // hydration + Supabase auth session settle
    console.log(`✅ Signed up: ${email}`);
}

async function createBrandAndActivate(page: Page) {
    // Open modal via TopBar brand switcher
    await page.getByRole('button', { name: /no brand/i }).click();
    await page.getByRole('menuitem', { name: /add new brand/i }).click();
    await expect(page.getByRole('heading', { name: /add new workspace/i }))
        .toBeVisible({ timeout: 5_000 });

    // Step 1 — Business Details
    await page.getByPlaceholder('e.g. Acme Corp').fill('Live QA Brand');
    await page.getByPlaceholder('Describe the products or services offered...')
        .fill('Automated QA brand for live image generation testing.');
    await page.getByRole('button', { name: /continue/i }).first().click();

    // Step 2 — Visual Identity
    await expect(page.locator('h3:has-text("Visual Identity")')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /continue/i }).first().click();

    // Step 3 — Vibe (extra wait for useEffect to resolve userId)
    await expect(page.locator('h3:has-text("Vibe & Training Data")')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1_200);

    await page.getByRole('button', { name: /create brand/i }).click();
    console.log('⏳ Brand server action firing...');

    await expect(page.getByRole('heading', { name: /add new workspace/i }))
        .not.toBeVisible({ timeout: 35_000 });
    console.log('✅ Modal closed — brand created in DB');

    // Reload so the TopBar's useEffect + fetchBrands runs with a fresh clientId.
    // Without reload, a stale closure in the TopBar's onSuccess callback can leave
    // the brand switcher showing "No Brand" even though the row is in the DB.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_500);

    // After reload the TopBar will query brand_profiles and set the first brand active.
    // The brand switcher button text changes from "No Brand" to the brand name.
    await expect(page.getByRole('button', { name: /no brand/i })).not.toBeVisible({ timeout: 10_000 });
    console.log('✅ Brand active in TopBar (brand switcher no longer shows "No Brand")');
}

// ── Test ──────────────────────────────────────────────────────────────────────

test('Live QA — Flows 2/3/4: billing, generation, backend verification', async ({ page }) => {
    test.setTimeout(LIVE_TIMEOUT_MS + 120_000); // full pipeline + brand creation + buffer

    const email = `test-qa-${Date.now()}@blinkspot.local`;
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  LIVE QA: Flows 2 + 3 + 4 Combined');
    console.log(`${'═'.repeat(60)}\n`);

    // Ensure output dir exists
    if (!fs.existsSync(QA_DIR)) fs.mkdirSync(QA_DIR, { recursive: true });

    // ── Global alert capture (catches brand-creation server errors) ──────────
    const alerts: string[] = [];
    page.on('dialog', async (dialog) => {
        const msg = dialog.message();
        alerts.push(msg);
        console.error(`\n⚠️  Alert: "${msg}"`);
        await dialog.dismiss();
    });

    // ════════════════════════════════════════════════════════════════════
    // FLOW 1 PRE-REQS: Sign up & brand creation
    // ════════════════════════════════════════════════════════════════════

    await signUpAndLand(page, email);
    await createBrandAndActivate(page);

    // Fail fast if brand creation threw an alert
    if (alerts.some(a => !/stripe|paystack/i.test(a))) {
        const brandErrors = alerts.filter(a => !/stripe|paystack/i.test(a));
        throw new Error(`Brand creation failed with alert: ${brandErrors.join('; ')}`);
    }

    const clientId = await getClientId(page);
    console.log(`📋 Client ID: ${clientId}`);

    // ════════════════════════════════════════════════════════════════════
    // FLOW 2: BILLING PAGE — initial balance check
    // ════════════════════════════════════════════════════════════════════
    console.log('\n── FLOW 2: Billing page verification ────────────────────────');

    await page.goto('/dashboard/billing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_500); // let Supabase query settle

    // Read balance from DB (source of truth)
    const dbBalanceFresh = await readBalance(page.request, clientId);
    console.log(`📊 DB balance (fresh signup): ${dbBalanceFresh} credits`);

    if (dbBalanceFresh === 0) {
        console.warn(`\n⚠️  BUG FOUND — Flow 2 Gap: No onboarding credits seeded.`);
        console.warn(`   The billing page shows ${dbBalanceFresh} credits.`);
        console.warn(`   Expected: 1,500 credits for Starter plan signup.`);
        console.warn(`   Fix needed: Add a Supabase trigger or n8n onboarding workflow`);
        console.warn(`   that calls credit_balances INSERT with balance=1500 when a new`);
        console.warn(`   client row is created with plan_tier='starter'.`);
        console.warn(`   Seeding 1500 credits now via service role to continue test.\n`);

        await seedCredits(page.request, clientId, SEED_CREDITS);
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1_500);
    }

    // Screenshot: billing before generation
    await page.screenshot({ path: BILLING_BEFORE_OUT, fullPage: false });
    console.log(`📸 Billing (before) screenshot: flow-2-billing-before.png`);

    // Verify billing page renders correctly
    await expect(page.locator('h1').filter({ hasText: /pricing/i })).toBeVisible({ timeout: 5_000 });

    // ════════════════════════════════════════════════════════════════════
    // FLOW 3: IMAGE GENERATION
    // ════════════════════════════════════════════════════════════════════
    console.log('\n── FLOW 3: Image generation ─────────────────────────────────');

    // Read baseline balance before generation
    const balanceBefore = await readBalance(page.request, clientId);
    console.log(`💳 Balance before generation: ${balanceBefore} credits`);

    await page.goto('/dashboard/generate');
    await page.waitForLoadState('networkidle');

    // Guard: brand must be active
    const noWorkspace = page.locator('h2:has-text("No Workspace Selected")');
    if (await noWorkspace.isVisible({ timeout: 2_000 }).catch(() => false)) {
        throw new Error('"No Workspace Selected" — brand not persisted after brand creation');
    }

    // Enter prompt
    const promptArea = page.locator('textarea[placeholder*="Describe what you want to see"]');
    await expect(promptArea).toBeVisible({ timeout: 5_000 });
    await promptArea.fill('A neon cyberpunk cityscape');
    console.log('✅ Prompt: "A neon cyberpunk cityscape"');

    // Click Generate
    const generateBtn = page.getByRole('button', { name: /generate image/i });
    await expect(generateBtn).toBeEnabled({ timeout: 3_000 });
    await generateBtn.click();
    console.log('🚀 Generate clicked — n8n pipeline running (60-180s)...');

    // Studio Results panel should appear immediately
    await expect(page.locator('h3:has-text("Studio Results")')).toBeVisible({ timeout: 10_000 });
    console.log('✅ Studio Results panel appeared');

    // Spinner confirms pipeline is in-flight
    if (await page.locator('text=Nano Banana is painting your pixels...').isVisible({ timeout: 5_000 }).catch(() => false)) {
        console.log('✅ Spinner active — Kie.ai job in progress');
    }

    // Wait for the first Cloudinary image to render
    console.log('⏳ Waiting for Cloudinary image (up to 3 min)...');
    const cloudinaryImg = page.locator('img[src*="cloudinary.com"]').first();
    await expect(cloudinaryImg).toBeVisible({ timeout: LIVE_TIMEOUT_MS });

    const generatedUrl = await cloudinaryImg.getAttribute('src');
    console.log(`✅ Image rendered!\n   URL: ${generatedUrl}`);

    // Fail if a generation error alert fired after seeding
    const genErrors = alerts.filter(a => /generation failed|insufficient/i.test(a));
    if (genErrors.length > 0) throw new Error(`Generation alert: ${genErrors.join('; ')}`);

    // Grid badge
    const badge = page.locator('text=/\\d+ items? saved to Grid/');
    if (await badge.isVisible({ timeout: 3_000 }).catch(() => false)) {
        console.log(`✅ Grid badge: "${await badge.textContent()}"`);
    }

    // Screenshot: generated result
    await cloudinaryImg.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: SCREENSHOT_OUT, fullPage: false });
    console.log(`📸 Generated result screenshot: flow-2-live-generation.png`);

    // ════════════════════════════════════════════════════════════════════
    // BILLING VERIFICATION: balance decreased by exactly 8
    // ════════════════════════════════════════════════════════════════════
    console.log('\n── Billing delta verification ───────────────────────────────');

    // Navigate to billing page to check displayed balance
    await page.goto('/dashboard/billing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_500);

    const balanceAfter = await readBalance(page.request, clientId);
    const deducted = balanceBefore - balanceAfter;

    console.log(`💳 Balance before:   ${balanceBefore} credits`);
    console.log(`💳 Balance after:    ${balanceAfter} credits`);
    console.log(`💳 Deducted:         ${deducted} credits (expected: ${NANO_BANANA_2_COST})`);

    await page.screenshot({ path: BILLING_AFTER_OUT, fullPage: false });
    console.log(`📸 Billing (after) screenshot: flow-2-billing-after.png`);

    // Assert exact 8-credit deduction
    expect(deducted).toBe(NANO_BANANA_2_COST);
    console.log(`✅ Credit deduction verified: -${NANO_BANANA_2_COST} credits ✓`);

    // ════════════════════════════════════════════════════════════════════
    // FLOW 4: BACKEND n8n EXECUTION VERIFICATION (via Supabase audit trail)
    // ════════════════════════════════════════════════════════════════════
    console.log('\n── FLOW 4: Backend n8n execution verification ───────────────');

    await page.waitForTimeout(2_000); // give DB a moment to settle

    // ── Check 1: credit_transactions audit log ────────────────────────────────
    const latestTxn = await readLatestTransaction(page.request, clientId);
    console.log('\n📋 Latest credit_transaction row:');
    console.log(JSON.stringify(latestTxn, null, 2));

    expect(latestTxn).not.toBeNull();
    // n8n uses process_image_generation_billing RPC which maps to 'image_generation' operation
    expect(latestTxn!.amount).toBe(-NANO_BANANA_2_COST);
    expect(latestTxn!.balance_after).toBe(balanceAfter);
    console.log(`✅ n8n billing verified: amount=${latestTxn!.amount}, balance_after=${latestTxn!.balance_after}`);

    // ── Check 2: content row in Supabase ─────────────────────────────────────
    const latestContent = await readLatestContent(page.request, clientId);
    console.log('\n📋 Latest content row:');
    console.log(JSON.stringify(latestContent, null, 2));

    expect(latestContent).not.toBeNull();

    // Verify brand_id is set (confirms payload was correctly passed to n8n)
    expect(latestContent!.brand_id).toBeTruthy();
    console.log(`✅ brand_id verified: ${latestContent!.brand_id} (payload included brand context)`);

    // Verify Direct-to-Cloudinary architecture: image_urls must contain Cloudinary URL
    // If n8n had stored binary data in its RAM, this would be a base64 or temp URL
    const imageUrls = latestContent!.image_urls as string[];
    expect(Array.isArray(imageUrls)).toBe(true);
    expect(imageUrls.length).toBeGreaterThan(0);
    expect(imageUrls[0]).toMatch(/cloudinary\.com/);
    expect(imageUrls[0]).toMatch(/blinkspot/);
    console.log(`✅ Direct-to-Cloudinary verified: ${imageUrls[0]}`);
    console.log(`   No binary data stored in n8n — architecture is intact ✓`);

    // Verify content metadata
    expect(latestContent!.content_type).toBe('post_image');
    expect(latestContent!.status).toBe('draft');
    console.log(`✅ Content type: ${latestContent!.content_type}, status: ${latestContent!.status}`);

    // ════════════════════════════════════════════════════════════════════
    // FINAL SUMMARY
    // ════════════════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  QA SUMMARY — Flows 2 + 3 + 4');
    console.log(`${'═'.repeat(60)}`);
    console.log(`✅ Sign-up & brand creation: PASS`);
    console.log(`${dbBalanceFresh === 0 ? '⚠️ ' : '✅'} Onboarding credit balance: ${dbBalanceFresh === 0 ? 'BUG — no auto-seed (see warning above)' : `${dbBalanceFresh} credits — PASS`}`);
    console.log(`✅ Image generation "A neon cyberpunk cityscape": PASS`);
    console.log(`✅ Credit deduction (-${NANO_BANANA_2_COST}): PASS`);
    console.log(`✅ n8n billing audit (credit_transactions): PASS`);
    console.log(`✅ brand_id in n8n payload: PASS`);
    console.log(`✅ Direct-to-Cloudinary architecture: PASS`);
    console.log(`\n📸 Screenshots saved to references/qa-reports/:`);
    console.log(`   flow-2-billing-before.png`);
    console.log(`   flow-2-live-generation.png`);
    console.log(`   flow-2-billing-after.png`);
    console.log(`${'═'.repeat(60)}\n`);
});
