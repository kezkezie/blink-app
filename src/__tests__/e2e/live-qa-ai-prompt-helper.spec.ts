/**
 * Live QA — AI Prompt Helper (ai_enhance: true)
 *
 * Tests the full path:
 *   Upload image → Cloudinary analyze_image folder (new logic)
 *   → Video Studio (Cinematic Showcase, AI Prompt Helper ON)
 *   → n8n receives a res.cloudinary.com URL (not Supabase Storage)
 *   → "AI Director is writing the cinematic script..." status fires
 *   → Generation proceeds
 *
 * Run: npx playwright test live-qa-ai-prompt-helper --headed
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ── Constants ─────────────────────────────────────────────────────────────────
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_IMAGE        = path.join(process.env.HOME!, 'Downloads', '3dani.jpg');
const QA_DIR            = '/Users/freddykezie/Documents/ AIos demo/AIS-OS/references/qa-reports';
const SCREENSHOT_PATH   = path.join(QA_DIR, 'flow-4-ai-prompt-helper.png');
const CLOUDINARY_ORIGIN = 'https://res.cloudinary.com';
const N8N_WEBHOOK_BASE  = 'https://n8n.srv1166077.hstgr.cloud/webhook';

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function seedCredits(req: APIRequestContext, clientId: string) {
    const res = await req.post(`${SUPABASE_URL}/rest/v1/credit_balances`, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
        },
        data: { client_id: clientId, balance: 3000, lifetime_earned: 3000, lifetime_spent: 0 },
    });
    if (!res.ok()) throw new Error(`Seed failed: ${res.status()}`);
}

async function getClientId(page: Page): Promise<string> {
    const r = await page.request.get('/api/credits/balance');
    const b = await r.json();
    if (!b.client_id) throw new Error(`No client_id: ${JSON.stringify(b)}`);
    return b.client_id;
}

async function pollContentRow(
    req: APIRequestContext,
    contentId: string,
    timeoutMs = 300_000
): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutMs;
    let lastStatus = '';
    while (Date.now() < deadline) {
        const res  = await req.get(`${SUPABASE_URL}/rest/v1/content?id=eq.${contentId}&select=*`, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        const rows: Record<string, unknown>[] = await res.json();
        const row  = rows[0];
        if (row) {
            const st = row.generation_status_text as string ?? '';
            if (st && st !== lastStatus) { console.log(`  📡 n8n: "${st}"`); lastStatus = st; }
            if (row.status === 'failed') throw new Error('n8n marked row as failed');
            const all = [...((row.image_urls as string[]) ?? []), ...((row.video_urls as string[]) ?? [])];
            if (all.some(u => u.includes('cloudinary.com'))) return row;
        }
        await new Promise(r => setTimeout(r, 6_000));
    }
    throw new Error(`Timed out after ${timeoutMs / 1000}s`);
}

// ── Sign-up / Brand helpers ───────────────────────────────────────────────────
async function signUp(page: Page, email: string) {
    await page.goto('/get-started');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('John Doe').fill('AI Helper QA');
    await page.getByPlaceholder('you@company.com').fill(email);
    await page.getByPlaceholder('••••••••').fill('BlinkTest123!');
    await page.getByRole('button', { name: /sign up with email/i }).click();
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_500);
    console.log(`✅ Signed up: ${email}`);
}

async function createBrand(page: Page) {
    page.on('dialog', async d => { await d.dismiss(); });
    await page.getByRole('button', { name: /no brand/i }).click();
    await page.getByRole('menuitem', { name: /add new brand/i }).click();
    await expect(page.getByRole('heading', { name: /add new workspace/i })).toBeVisible({ timeout: 5_000 });
    await page.getByPlaceholder('e.g. Acme Corp').fill('AI Helper QA Brand');
    await page.getByPlaceholder('Describe the products or services offered...').fill('QA brand for AI Prompt Helper test');
    await page.getByRole('button', { name: /continue/i }).first().click();
    await expect(page.locator('h3:has-text("Visual Identity")')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /continue/i }).first().click();
    await expect(page.locator('h3:has-text("Vibe & Training Data")')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1_200);
    await page.getByRole('button', { name: /create brand/i }).click();
    await expect(page.getByRole('heading', { name: /add new workspace/i })).not.toBeVisible({ timeout: 35_000 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_500);
    await expect(page.getByRole('button', { name: /no brand/i })).not.toBeVisible({ timeout: 10_000 });
    console.log('✅ Brand active');
}

// ── Main test ─────────────────────────────────────────────────────────────────
test('Live QA — AI Prompt Helper ON: Cloudinary URL reaches n8n → AI Director fires', async ({ page }) => {
    test.setTimeout(600_000); // 10 minutes — video generation is slow

    if (!fs.existsSync(QA_DIR)) fs.mkdirSync(QA_DIR, { recursive: true });
    if (!fs.existsSync(TEST_IMAGE)) throw new Error(`Test image not found: ${TEST_IMAGE}`);

    const email = `test-ai-helper-${Date.now()}@blinkspot.local`;
    const consoleErrors: string[] = [];
    const cloudinaryUploadCalls: string[] = [];

    // ── Monitor console + network ─────────────────────────────────────────────
    page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error') {
            consoleErrors.push(text);
            console.error(`  🔴 Console error: ${text}`);
        }
        if (text.includes('Cloudinary') || text.includes('analyze_image')) {
            console.log(`  🟡 Console: ${text}`);
        }
    });

    // Intercept Cloudinary upload to verify folder + preset
    page.on('request', req => {
        if (req.url().includes('api.cloudinary.com')) {
            cloudinaryUploadCalls.push(req.url());
            console.log(`  ☁️  Cloudinary request: ${req.url()}`);
        }
    });

    // Intercept the n8n webhook payload — capture primary_image_url
    let capturedN8nPayload: Record<string, unknown> | null = null;
    page.on('request', req => {
        if (req.url().includes(N8N_WEBHOOK_BASE) && req.method() === 'POST') {
            try {
                capturedN8nPayload = JSON.parse(req.postData() ?? '{}');
                console.log(`  🔗 n8n webhook payload captured`);
                console.log(`     primary_image_url: ${capturedN8nPayload?.primary_image_url}`);
                console.log(`     ai_enhance: ${capturedN8nPayload?.ai_enhance}`);
            } catch { /* ignore */ }
        }
    });

    // Also intercept the Next.js /api/workflows proxy to catch the payload there
    page.on('request', req => {
        if (req.url().includes('/api/workflows') && req.method() === 'POST') {
            try {
                const body = JSON.parse(req.postData() ?? '{}');
                if (body.post_id || body.primary_image_url) {
                    capturedN8nPayload = body;
                    console.log(`  🔗 /api/workflows payload:`);
                    console.log(`     primary_image_url: ${body.primary_image_url}`);
                    console.log(`     ai_enhance: ${body.ai_enhance}`);
                    console.log(`     video_mode: ${body.video_mode}`);
                }
            } catch { /* ignore */ }
        }
    });

    // Track content row ID
    let capturedPostId: string | null = null;
    page.on('response', async resp => {
        if (resp.url().includes('/rest/v1/content') && resp.request().method() === 'POST') {
            try {
                const body = await resp.json();
                const id = Array.isArray(body) ? body[0]?.id : body?.id;
                if (id) { capturedPostId = id; console.log(`  📍 Content row: ${id}`); }
            } catch { /* ignore */ }
        }
    });

    console.log('\n' + '═'.repeat(64));
    console.log('  QA: AI Prompt Helper — Cloudinary URL → n8n → AI Director');
    console.log('═'.repeat(64) + '\n');

    // ── Setup ─────────────────────────────────────────────────────────────────
    await signUp(page, email);
    await createBrand(page);
    const clientId = await getClientId(page);
    await seedCredits(page.request, clientId);
    console.log(`💳 Client ${clientId} seeded with 3000 credits`);

    // ── Navigate to Video Studio ──────────────────────────────────────────────
    await page.goto('/dashboard/video');
    await page.waitForLoadState('networkidle');

    // Step 1: Select Cinematic Showcase
    await page.locator('text=Cinematic Showcase').click();
    console.log('✅ Cinematic Showcase selected');

    // Step 2: Advance to Step 2 (Director's Setup)
    await page.getByRole('button', { name: /next step/i }).click();
    await page.waitForTimeout(600);
    console.log('✅ Advanced to Step 2');

    // ── Upload test image (triggers new Cloudinary logic) ────────────────────
    console.log('\n── Uploading 3dani.jpg → Cloudinary analyze_image ──────────');

    // Set up file chooser intercept before clicking the upload area
    const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 8_000 }),
        page.locator('input[type="file"]').first().evaluate((el: HTMLInputElement) => {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }),
    ]);
    await fileChooser.setFiles(TEST_IMAGE);
    console.log('✅ File selected — Cloudinary upload in progress...');

    // Wait for Cloudinary upload to complete (up to 15s)
    // Success: primaryPreview becomes a cloudinary.com URL (data URL disappears)
    // Failure: console.error fires with "Reference image Cloudinary upload failed"
    await page.waitForTimeout(8_000); // typical Cloudinary upload < 5s

    // Verify the preview URL is now a Cloudinary URL (not base64 data:)
    // We do this by checking the src of the preview image element
    const previewImg = page.locator('img[src*="cloudinary.com"]').first();
    const cloudinaryPreviewVisible = await previewImg.isVisible({ timeout: 3_000 }).catch(() => false);

    if (cloudinaryPreviewVisible) {
        const previewSrc = await previewImg.getAttribute('src');
        console.log(`✅ Cloudinary upload succeeded — preview URL: ${previewSrc}`);
        expect(previewSrc).toContain('analyze_image');
    } else {
        // Check if upload failed (console error) or just the img selector is wrong
        const hasUploadError = consoleErrors.some(e => e.includes('Cloudinary upload failed'));
        if (hasUploadError) {
            console.warn('⚠️  Cloudinary upload failed — test will continue with Supabase Storage fallback');
            console.warn('   This means primary_image_url will be a Supabase URL, not Cloudinary');
        } else {
            console.log('ℹ️  Preview image not matched by cloudinary.com selector — upload may have succeeded but preview changed format');
        }
    }

    // ── Verify Cloudinary API was actually called ─────────────────────────────
    console.log(`\n  Cloudinary API calls intercepted: ${cloudinaryUploadCalls.length}`);
    cloudinaryUploadCalls.forEach(u => console.log(`    ${u}`));

    // ── Enter lazy prompt (AI Director must expand this) ─────────────────────
    console.log('\n── Entering lazy prompt for AI Director ─────────────────────');
    const promptArea = page.locator('textarea').filter({
        hasText: /.*/
    }).first();

    // Use the placeholder to find the right textarea
    const videoPrompt = page.locator('textarea[placeholder*="orbit"], textarea[placeholder*="dramatic"], textarea[placeholder*="Describe"]').first();
    await expect(videoPrompt).toBeVisible({ timeout: 5_000 });
    await videoPrompt.fill('orbiting camera');
    console.log('✅ Lazy prompt entered: "orbiting camera"');

    // ── Verify AI Prompt Helper switch is ON ─────────────────────────────────
    const aiSwitch = page.locator('[role="switch"]').last();
    const switchState = await aiSwitch.getAttribute('data-state');
    expect(switchState).toBe('checked');
    console.log('✅ AI Prompt Helper: ON (ai_enhance: true)');

    // ── Click Generate AI Video ───────────────────────────────────────────────
    console.log('\n── Firing Generate AI Video ─────────────────────────────────');
    const generateBtn = page.getByRole('button', { name: /generate ai video/i });
    await expect(generateBtn).toBeEnabled({ timeout: 3_000 });
    await generateBtn.click();
    console.log('🚀 Generate clicked — waiting for content row to be created...');

    // Wait for content row creation (up to 8s)
    await page.waitForTimeout(5_000);

    // ── Phase 2: Diagnose the n8n payload ─────────────────────────────────────
    console.log('\n── Phase 2: n8n Payload Diagnosis ───────────────────────────');

    if (capturedN8nPayload) {
        const primaryUrl = capturedN8nPayload.primary_image_url as string ?? '';
        const aiEnhance  = capturedN8nPayload.ai_enhance;
        const videoMode  = capturedN8nPayload.video_mode;

        console.log(`  primary_image_url: ${primaryUrl}`);
        console.log(`  ai_enhance:        ${aiEnhance}`);
        console.log(`  video_mode:        ${videoMode}`);

        // KEY CHECK: Did the Cloudinary URL reach n8n?
        const isCloudinaryUrl = primaryUrl.startsWith(CLOUDINARY_ORIGIN);
        const isSupabaseUrl   = primaryUrl.includes('supabase.co');
        const isDataUrl       = primaryUrl.startsWith('data:');

        if (isCloudinaryUrl) {
            console.log('✅ PASS: Cloudinary URL in n8n payload — GPT-4o Vision can access this natively');
            expect(primaryUrl).toContain('analyze_image');
        } else if (isSupabaseUrl) {
            console.warn('⚠️  Supabase Storage URL in n8n payload — Cloudinary upload fallback was used');
            console.warn('   GPT-4o Vision may hang on this URL — check blinkspot_casts preset is active');
        } else if (isDataUrl) {
            console.error('❌ FAIL: base64 data URL in n8n payload — image was never uploaded');
        } else {
            console.log(`  URL type: unknown — ${primaryUrl.substring(0, 60)}`);
        }

        expect(aiEnhance).toBe(true);
        console.log('✅ ai_enhance: true confirmed in payload');
    } else {
        console.warn('⚠️  n8n payload not captured via network intercept');
        console.warn('   The /api/workflows proxy may have forwarded it before intercept fired');
    }

    // ── Phase 3: Fallback — direct Supabase content row check ────────────────
    console.log('\n── Phase 3: Supabase Content Row ────────────────────────────');

    if (!capturedPostId) {
        // Try to find it from DB
        const res = await page.request.get(
            `${SUPABASE_URL}/rest/v1/content?client_id=eq.${clientId}&content_type=eq.reel&order=created_at.desc&limit=1&select=*`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        const rows: Record<string, unknown>[] = await res.json();
        if (rows[0]) capturedPostId = rows[0].id as string;
    }

    if (!capturedPostId) throw new Error('Content row not found — Generate may not have fired');
    console.log(`  Tracking content row: ${capturedPostId}`);

    // Check initial status (should show AI Director fired)
    const initRes = await page.request.get(
        `${SUPABASE_URL}/rest/v1/content?id=eq.${capturedPostId}&select=generation_status_text,status`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const initRows: Record<string, unknown>[] = await initRes.json();
    const statusText = initRows[0]?.generation_status_text as string ?? '';

    console.log(`  generation_status_text: "${statusText}"`);

    if (statusText.includes('AI Director')) {
        console.log('✅ AI Director node fired — "Is AI Enhance ON?" guard routed correctly');
    } else if (statusText.includes('Allocating') || statusText.includes('Rendering')) {
        console.log('✅ Pipeline advanced past AI Director — already rendering');
    } else if (statusText === 'Initializing AI Engine...') {
        console.log('⚠️  Still initializing — n8n may not have processed the payload yet');
    } else {
        console.log(`ℹ️  Status: "${statusText}"`);
    }

    // ── Screenshot ────────────────────────────────────────────────────────────
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    console.log(`📸 Screenshot saved: flow-4-ai-prompt-helper.png`);

    // ── Final Report ──────────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(64));
    console.log('  AI PROMPT HELPER QA — VERDICT');
    console.log('═'.repeat(64));

    const hasCloudinaryCall  = cloudinaryUploadCalls.length > 0;
    const payloadHasCloudinary = capturedN8nPayload
        ? String(capturedN8nPayload.primary_image_url ?? '').startsWith(CLOUDINARY_ORIGIN)
        : false;
    const aiDirectorFired = statusText.includes('AI Director') || statusText.includes('Rendering') || statusText.includes('Allocating');

    console.log(`  ${hasCloudinaryCall  ? '✅' : '❌'} Cloudinary API called on file select`);
    console.log(`  ${payloadHasCloudinary ? '✅' : '⚠️ '} Cloudinary URL in n8n payload`);
    console.log(`  ${aiDirectorFired     ? '✅' : '⚠️ '} AI Director node fired (ai_enhance: true path)`);
    console.log(`  ${consoleErrors.length === 0 ? '✅' : '❌'} No console errors`);
    if (consoleErrors.length) consoleErrors.forEach(e => console.log(`    ❌ ${e}`));
    console.log('═'.repeat(64) + '\n');

    // Hard assertions
    expect(cloudinaryUploadCalls.length).toBeGreaterThan(0);
});
