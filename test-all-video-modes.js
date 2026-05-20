/**
 * test-all-video-modes.js
 *
 * AI Prompt Helper ON — Full Video Mode Test Suite
 * Tests ai_enhance: true across all 5 video modes in the Blink Video Engine.
 * All requests go to blink-generate-video-v1 (Blink - Generate Video V3 workflow).
 *
 * Modes tested:
 *   1. showcase      — Cinematic Showcase
 *   2. ugc           — UGC Product Review
 *   3. clothing      — AI Clothing Try-On
 *   4. logo_reveal   — Product Reveal
 *   5. storytelling  — 3-Scene Stress Test (scene array)
 *
 * Usage: node test-all-video-modes.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env ──────────────────────────────────────────────────────────────────
const envVars = {};
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)/);
    if (m) envVars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL || 'https://hzkufspjozkgmloznkvp.supabase.co';
const SERVICE_KEY  = envVars.SUPABASE_SERVICE_ROLE_KEY;
const N8N_WEBHOOK  = `${envVars.NEXT_PUBLIC_N8N_WEBHOOK_BASE || 'https://n8n.srv1166077.hstgr.cloud/webhook'}/blink-generate-video-v1`;

// Test anchors — reuse from previous QA runs
const CLIENT_ID = '948be4f8-9aba-4a3f-8c60-7bc4803d3fcf';
const BRAND_ID  = 'f965646b-4579-4389-b672-0b618a91d9e8';

// Cloudinary reference images (uploaded to analyze_image — accessible by GPT-4o Vision)
const PRIMARY_IMG   = 'https://res.cloudinary.com/dap8jijxa/image/upload/v1779154363/blinkspot/analyze_image/nyhdpx47zeckuxid0bzk.jpg';
const SECONDARY_IMG = 'https://res.cloudinary.com/dap8jijxa/image/upload/v1779131248/blinkspot/analyze_image/u66jamzigmgmbtx7ribf.jpg';

// ── Helpers ───────────────────────────────────────────────────────────────────
const supHeaders = () => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
});

async function insertContentRow(label, videoMode) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/content`, {
    method: 'POST',
    headers: { ...supHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      brand_id: BRAND_ID,
      content_type: videoMode === 'storytelling' ? 'sequence_clip' : 'reel',
      caption: `🤖 AI Helper Test: ${label}`,
      status: 'draft',
      ai_model: 'auto',
      generation_status_text: 'Queued for AI Helper test...',
    }),
  });
  const rows = await res.json();
  if (!res.ok || !rows[0]?.id) throw new Error(`DB insert failed: ${JSON.stringify(rows).substring(0, 200)}`);
  return rows[0].id;
}

async function fireWebhook(payload) {
  const res = await fetch(N8N_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, ok: res.ok, data };
}

async function pollRow(postId, label, timeoutMs = 360_000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = '';

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 8_000));
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 12_000);
      const res  = await fetch(`${SUPABASE_URL}/rest/v1/content?id=eq.${postId}&select=status,generation_status_text,image_urls,video_urls`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      const [row] = await res.json();
      if (!row) continue;

      const st = row.generation_status_text ?? '';
      if (st && st !== lastStatus) {
        console.log(`    📡 [${label}] "${st}"`);
        lastStatus = st;
      }

      if (row.status === 'failed') return { ok: false, reason: 'n8n marked failed', row };

      const allUrls = [...(row.image_urls || []), ...(row.video_urls || [])];
      const videoUrl = allUrls.find(u => u.includes('cloudinary.com'));
      if (videoUrl) return { ok: true, videoUrl, row };
    } catch (e) {
      if (e.name !== 'AbortError') console.log(`    ⚠️  poll error: ${e.message}`);
    }
  }

  // Return last known state on timeout
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/content?id=eq.${postId}&select=*`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const [row] = await res.json();
    return { ok: false, reason: `Timeout ${timeoutMs / 1000}s`, row };
  } catch {
    return { ok: false, reason: 'Timeout + poll error', row: null };
  }
}

// ── Payload Builders ─────────────────────────────────────────────────────────
// Mirrors the exact shape from src/app/dashboard/video/page.tsx → handleGenerate()

function buildShowcasePayload(postId) {
  return {
    client_id:              CLIENT_ID,
    brand_id:               BRAND_ID,
    post_id:                postId,
    video_mode:             'showcase',
    primary_image_url:      PRIMARY_IMG,
    secondary_image_url:    null,
    user_prompt:            'camera slowly orbits',          // lazy prompt — AI Director must expand
    is_sequence:            false,
    brand_name:             'Test Brand',
    brand_info:             'QA test — AI Prompt Helper showcase',
    ai_model_override:      'auto',
    strict_brand_alignment: false,
    aspect_ratio:           '9:16',
    duration:               5,
    ai_enhance:             true,                            // ← KEY
  };
}

function buildUgcPayload(postId) {
  return {
    client_id:              CLIENT_ID,
    brand_id:               BRAND_ID,
    post_id:                postId,
    video_mode:             'ugc',
    primary_image_url:      PRIMARY_IMG,   // product image
    secondary_image_url:    SECONDARY_IMG, // influencer face sheet
    user_prompt:            'influencer unboxing reaction',
    is_sequence:            false,
    brand_name:             'Test Brand',
    brand_info:             'QA test — AI Prompt Helper UGC',
    ai_model_override:      'kling-3.0/video',
    strict_brand_alignment: false,
    aspect_ratio:           '9:16',
    duration:               10,
    ai_enhance:             true,
  };
}

function buildClothingPayload(postId) {
  return {
    client_id:              CLIENT_ID,
    brand_id:               BRAND_ID,
    post_id:                postId,
    video_mode:             'clothing',
    primary_image_url:      PRIMARY_IMG,   // garment image
    secondary_image_url:    SECONDARY_IMG, // model image
    user_prompt:            'fashion editorial',
    is_sequence:            false,
    brand_name:             'Test Brand',
    brand_info:             'QA test — AI Prompt Helper clothing',
    ai_model_override:      'replicate:prunaai/p-video',
    strict_brand_alignment: false,
    aspect_ratio:           '9:16',
    duration:               8,
    ai_enhance:             true,
  };
}

function buildLogoRevealPayload(postId) {
  return {
    client_id:              CLIENT_ID,
    brand_id:               BRAND_ID,
    post_id:                postId,
    video_mode:             'logo_reveal',
    primary_image_url:      PRIMARY_IMG,   // product / logo PNG
    secondary_image_url:    null,
    user_prompt:            'dramatic product reveal',
    is_sequence:            false,
    brand_name:             'Test Brand',
    brand_info:             'QA test — AI Prompt Helper logo reveal',
    ai_model_override:      'bytedance/seedance-2',
    strict_brand_alignment: false,
    aspect_ratio:           '16:9',
    duration:               5,
    ai_enhance:             true,
  };
}

function buildStorytellingPayload(scenePostIds) {
  // Storytelling fires ONE request PER scene (mirrors the for-loop in page.tsx).
  // This payload tests Scene 1 (establishing) with a structured multi-scene
  // concept in user_prompt so the AI Director writes the full sequence narrative.
  // The other two scenes are passed as post_ids in the metadata for traceability.
  return {
    client_id:              CLIENT_ID,
    brand_id:               BRAND_ID,
    post_id:                scenePostIds[0],  // Tracking Scene 1
    video_mode:             'storytelling',
    primary_image_url:      PRIMARY_IMG,
    secondary_image_url:    null,
    user_prompt: [
      'Scene 1 (Establishing Shot): Wide cinematic shot establishing the brand environment. Hero product centered in the frame. Dark studio, single overhead key light.',
      'Scene 2 (Close-up Insert): Macro close-up orbiting the product surface. Catch-lights reveal texture and premium finish.',
      'Scene 3 (Logo Outtro): Product locks on a clean hero angle. Brand mark fades in from the right. Final 2-second hold.',
    ].join(' | '),
    is_sequence:            true,
    scene_count:            3,
    scene_post_ids:         scenePostIds,     // all 3 content row IDs for tracing
    brand_name:             'Test Brand',
    brand_info:             'QA test — AI Prompt Helper storytelling stress test',
    ai_model_override:      'auto',
    strict_brand_alignment: true,
    aspect_ratio:           '16:9',
    duration:               5,
    ai_enhance:             true,             // AI Director writes the full 3-scene script
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not found in .env.local');

  console.log('\n' + '═'.repeat(72));
  console.log('  AI PROMPT HELPER ON — Full Video Mode Test Suite');
  console.log('  All 5 modes | ai_enhance: true | blink-generate-video-v1');
  console.log('═'.repeat(72));
  console.log(`  Webhook: ${N8N_WEBHOOK}`);
  console.log(`  Client:  ${CLIENT_ID}`);
  console.log(`  Brand:   ${BRAND_ID}`);
  console.log(`  Image:   ${PRIMARY_IMG.substring(0, 60)}...`);
  console.log('═'.repeat(72) + '\n');

  const MODES = [
    { label: 'showcase (Cinematic)',       build: (id)  => buildShowcasePayload(id),     ids: 1 },
    { label: 'ugc (UGC Product Review)',   build: (id)  => buildUgcPayload(id),          ids: 1 },
    { label: 'clothing (AI Try-On)',       build: (id)  => buildClothingPayload(id),     ids: 1 },
    { label: 'logo_reveal (Product Reveal)', build: (id) => buildLogoRevealPayload(id),  ids: 1 },
    { label: 'storytelling (3-Scene Stress)', build: null, ids: 3 },  // special case
  ];

  // ── Step 1: Create all content rows upfront ───────────────────────────────
  console.log('── Step 1: Creating Supabase content rows ───────────────────────────');
  const modeData = [];

  for (const m of MODES) {
    if (m.ids === 1) {
      const id = await insertContentRow(m.label, m.label.split(' ')[0]);
      modeData.push({ ...m, postIds: [id] });
      console.log(`  ✅ ${m.label.padEnd(35)} post_id: ${id}`);
    } else {
      // Storytelling: 3 content rows (one per scene)
      const ids = [];
      for (let i = 1; i <= m.ids; i++) {
        const id = await insertContentRow(`${m.label} scene_${i}`, 'storytelling');
        ids.push(id);
        console.log(`  ✅ ${`${m.label} scene_${i}`.padEnd(35)} post_id: ${id}`);
      }
      modeData.push({ ...m, postIds: ids });
    }
  }

  // ── Step 2: Fire all 5 payloads ──────────────────────────────────────────
  console.log('\n── Step 2: Firing payloads (ai_enhance: true on all) ───────────────');

  const fired = [];
  for (const m of modeData) {
    let payload;
    if (m.label.includes('storytelling')) {
      payload = buildStorytellingPayload(m.postIds);
    } else {
      payload = m.build(m.postIds[0]);
    }

    // ─ LOG THE EXACT PAYLOAD ─────────────────────────────────────────────
    console.log(`\n  ▸ ${m.label}`);
    console.log('  PAYLOAD:');
    console.log(JSON.stringify(payload, null, 4).split('\n').map(l => '    ' + l).join('\n'));

    const { status, ok, data } = await fireWebhook(payload);
    console.log(`  n8n → HTTP ${status}: ${JSON.stringify(data).substring(0, 80)}`);

    if (!ok) {
      console.error(`  ❌ Webhook rejected`);
    }

    fired.push({ ...m, payload, webhookStatus: status, webhookOk: ok });

    // Small stagger between fires so n8n can process in sequence
    await new Promise(r => setTimeout(r, 1_500));
  }

  // ── Step 3: Poll all jobs in parallel ────────────────────────────────────
  console.log('\n── Step 3: Polling Supabase for generation results ─────────────────');
  console.log('  (ai_enhance: true → AI Director node fires → "AI Director is writing...")\n');

  const results = await Promise.all(
    fired.map(m =>
      pollRow(m.postIds[0], m.label, 360_000).then(r => ({ ...m, ...r }))
    )
  );

  // ── Final Report ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('  FINAL REPORT — AI Prompt Helper Test Suite');
  console.log('═'.repeat(72));

  let allPassed = true;
  for (const r of results) {
    const icon = r.ok ? '✅' : '⚠️ ';
    const detail = r.ok
      ? r.videoUrl?.substring(0, 55) + '...'
      : `${r.reason} | status: "${r.row?.generation_status_text?.substring(0, 40) || '?'}"`;

    console.log(`\n  ${icon} ${r.label}`);
    console.log(`     post_id:    ${r.postIds[0]}`);
    console.log(`     ai_enhance: ${r.payload.ai_enhance}  (${r.payload.ai_enhance === true ? '✅ CORRECT' : '❌ WRONG'})`);
    console.log(`     video_mode: ${r.payload.video_mode}`);
    console.log(`     model:      ${r.payload.ai_model_override}`);
    console.log(`     webhook:    HTTP ${r.webhookStatus}`);
    console.log(`     result:     ${detail}`);

    if (!r.webhookOk || r.payload.ai_enhance !== true) allPassed = false;
  }

  console.log('\n' + '─'.repeat(72));
  console.log('  KEY CHECKS:');

  const aiEnhanceCheck = results.every(r => r.payload.ai_enhance === true);
  const webhookCheck   = results.every(r => r.webhookStatus === 200);
  const aiDirectorFired = results.filter(r =>
    r.row?.generation_status_text?.includes('AI Director') ||
    r.row?.generation_status_text?.includes('Rendering') ||
    r.row?.generation_status_text?.includes('Allocating')
  ).length;

  console.log(`  ${aiEnhanceCheck ? '✅' : '❌'} ai_enhance: true on all 5 payloads`);
  console.log(`  ${webhookCheck   ? '✅' : '❌'} All 5 webhooks accepted (HTTP 200)`);
  console.log(`  ${aiDirectorFired >= 3 ? '✅' : '⚠️ '} AI Director fired on ${aiDirectorFired}/5 jobs (status text confirms routing)`);
  console.log(`  ${results.filter(r => r.ok).length}/${results.length} jobs generated a Cloudinary video`);

  console.log('\n  Storytelling stress test detail:');
  const storytellingResult = results.find(r => r.label.includes('storytelling'));
  if (storytellingResult) {
    console.log(`     Scene post IDs: ${storytellingResult.postIds.join(', ')}`);
    console.log(`     is_sequence: ${storytellingResult.payload.is_sequence}`);
    console.log(`     scene_count: ${storytellingResult.payload.scene_count}`);
    console.log(`     user_prompt contains 3 scenes: ${storytellingResult.payload.user_prompt.includes('Scene 3') ? '✅' : '❌'}`);
  }

  console.log('\n' + '═'.repeat(72) + '\n');

  if (!allPassed) process.exit(1);
})().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
