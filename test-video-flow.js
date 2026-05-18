/**
 * test-video-flow.js
 *
 * Bypasses the browser UI and directly exercises the Video Engine (Flow 4)
 * at the API / n8n layer.
 *
 * Steps:
 *   1. Upload ~/Downloads/3dani.jpg  →  Supabase Storage (assets bucket)
 *   2. Insert a content row          →  get post_id
 *   3. POST to n8n blink-generate-video-v1 webhook  (Cinematic Showcase, ai_enhance:false)
 *   4. Poll content row every 6s for up to 6 minutes for Cloudinary video URL
 *   5. Print full verification report
 *
 * Usage:
 *   node test-video-flow.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Config ─────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no dotenv dependency required)
const envPath = path.join(__dirname, '.env.local');
const envVars = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  });
}

const SUPABASE_URL     = envVars.NEXT_PUBLIC_SUPABASE_URL  || 'https://hzkufspjozkgmloznkvp.supabase.co';
const SERVICE_KEY      = envVars.SUPABASE_SERVICE_ROLE_KEY;
const N8N_BASE         = envVars.NEXT_PUBLIC_N8N_WEBHOOK_BASE || 'https://n8n.srv1166077.hstgr.cloud/webhook';
const N8N_MCP_TOKEN    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1ZmMwMzAyYy03Yzg5LTQ5YjUtYmY3MC0wZTEyMTQ3NjZlNzciLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6IjZkY2ViYTFmLWMxZGUtNGQzNC1hYWUzLTNhYjhmY2U4M2Q2NiIsImlhdCI6MTc3ODg1NjU5MX0.TmNxGuFZfcMW5PVHIMnB5ycZehdpZ3tN6_J8J99RGHc';

// Test anchors (from most-recent Playwright test run)
const CLIENT_ID   = '948be4f8-9aba-4a3f-8c60-7bc4803d3fcf';
const BRAND_ID    = 'f965646b-4579-4389-b672-0b618a91d9e8';
const BRAND_NAME  = 'Video QA Brand';
const BRAND_INFO  = 'QA brand for direct API video engine test.';

const IMAGE_PATH  = path.join(process.env.HOME, 'Downloads', '3dani.jpg');

const POLL_INTERVAL_MS = 6_000;
const POLL_TIMEOUT_MS  = 360_000; // 6 minutes

// ── Helpers ────────────────────────────────────────────────────────────────────

function supFetch(method, path, body, extra = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...extra.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function uploadToStorage(localPath) {
  const bytes = fs.readFileSync(localPath);
  const ext   = path.extname(localPath).slice(1) || 'jpg';
  const dest  = `videos/${CLIENT_ID}/test_primary_${Date.now()}.${ext}`;

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/assets/${dest}`,
    {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': `image/${ext}`,
        'x-upsert': 'true',
      },
      body: bytes,
    }
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Storage upload failed ${res.status}: ${txt}`);
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/assets/${dest}`;
  console.log(`  📤 Uploaded to Storage: ${publicUrl}`);
  return publicUrl;
}

async function insertContentRow() {
  const res = await supFetch('POST', '/rest/v1/content', {
    client_id: CLIENT_ID,
    brand_id: BRAND_ID,
    content_type: 'reel',
    caption: '🎬 AI Draft: Cinematic Showcase [API test]',
    status: 'draft',
    ai_model: 'auto',
    generation_status_text: 'Initializing AI Engine...',
  }, { headers: { Prefer: 'return=representation' } });

  const rows = await res.json();
  if (!res.ok || !Array.isArray(rows) || !rows[0]?.id) {
    throw new Error(`Content insert failed: ${JSON.stringify(rows)}`);
  }
  console.log(`  📝 Content row created: ${rows[0].id}`);
  return rows[0].id;
}

async function pollContentRow(postId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastStatus = '';

  while (Date.now() < deadline) {
    const res = await supFetch('GET', `/rest/v1/content?id=eq.${postId}&select=*`);
    const rows = await res.json();
    const row  = rows[0];

    if (row) {
      const statusText = row.generation_status_text;
      const status     = row.status;

      if (statusText && statusText !== lastStatus) {
        console.log(`  📡 Realtime update: "${statusText}"`);
        lastStatus = statusText;
      }

      if (status === 'failed') throw new Error('n8n marked content row as failed');

      const allUrls = [...(row.image_urls || []), ...(row.video_urls || [])];
      const videoUrl = allUrls.find(u => u.includes('cloudinary.com'));
      if (videoUrl) return { row, videoUrl };
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out after ${POLL_TIMEOUT_MS / 1000}s — no Cloudinary URL in content row`);
}

async function mcpCall(method, params) {
  const res = await fetch(`https://n8n.srv1166077.hstgr.cloud/mcp-server/http`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${N8N_MCP_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
  });
  const text = await res.text();
  const dataLine = text.split('\n').find(l => l.startsWith('data: '));
  if (!dataLine) throw new Error(`MCP no data line. Raw: ${text.substring(0, 400)}`);
  const parsed = JSON.parse(dataLine.replace('data: ', ''));
  if (parsed.error) throw new Error(`MCP error: ${JSON.stringify(parsed.error)}`);
  return parsed.result;
}

// ── Main ───────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n' + '═'.repeat(64));
  console.log('  VIDEO ENGINE DIRECT API TEST — Cinematic Showcase');
  console.log('═'.repeat(64) + '\n');

  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not loaded from .env.local');

  // ── Phase 1: Payload Construction & Fire ──────────────────────────────────
  console.log('── Phase 1: Build & Fire Payload ────────────────────────────');

  if (!fs.existsSync(IMAGE_PATH)) {
    throw new Error(`Test image not found: ${IMAGE_PATH}`);
  }
  console.log(`  ✅ Image found: ${IMAGE_PATH} (${(fs.statSync(IMAGE_PATH).size / 1024).toFixed(1)} KB)`);

  const primaryImageUrl = await uploadToStorage(IMAGE_PATH);
  const postId          = await insertContentRow();

  const payload = {
    client_id:             CLIENT_ID,
    brand_id:              BRAND_ID,
    post_id:               postId,
    video_mode:            'showcase',          // Cinematic Showcase
    primary_image_url:     primaryImageUrl,     // Supabase URL — n8n will now fetch→base64 before GPT-4o
    secondary_image_url:   null,
    user_prompt:           'camera orbits',     // Intentionally lazy prompt — AI Director must expand this
    is_sequence:           false,
    brand_name:            BRAND_NAME,
    brand_info:            BRAND_INFO,
    ai_model_override:     'auto',
    strict_brand_alignment: false,
    aspect_ratio:          '16:9',
    duration:              5,
    ai_enhance:            true,                // ← AI Director ON — testing improved prompt expansion
  };

  console.log('\n  Payload dispatched to n8n:');
  console.log(JSON.stringify(payload, null, 2));

  const webhookUrl = `${N8N_BASE}/blink-generate-video-v1`;
  console.log(`\n  🚀 POST → ${webhookUrl}`);
  const t0 = Date.now();

  const n8nRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const n8nText = await n8nRes.text();
  let n8nData;
  try { n8nData = JSON.parse(n8nText); } catch { n8nData = { raw: n8nText }; }

  console.log(`  n8n responded in ${elapsed}s  (HTTP ${n8nRes.status})`);
  console.log('  n8n response:', JSON.stringify(n8nData, null, 2));

  if (!n8nRes.ok) {
    throw new Error(`n8n webhook rejected payload: HTTP ${n8nRes.status}\n${n8nText}`);
  }

  console.log(`\n  ✅ Webhook accepted — tracking post_id: ${postId}`);

  // ── Phase 2: n8n MCP Backend Trace ────────────────────────────────────────
  console.log('\n── Phase 2: n8n MCP Backend Trace ───────────────────────────');

  try {
    // Give n8n ~3s to start the execution before we query
    await new Promise(r => setTimeout(r, 3_000));

    const searchResult = await mcpCall('tools/call', {
      name: 'search_workflows',
      arguments: { query: 'generate video', limit: 5 },
    });

    let workflows = [];
    try {
      const textContent = searchResult?.content?.[0]?.text;
      workflows = textContent ? JSON.parse(textContent) : [];
    } catch { /* MCP response shape varies */ }

    console.log('  Workflows found:');
    workflows.forEach(wf => console.log(`    • "${wf.name}"  id=${wf.id}  active=${wf.active}`));

    const videoWf = workflows.find(wf => /blink.*video|generate.*video/i.test(wf.name)) || workflows[0];

    if (videoWf) {
      console.log(`\n  Fetching node architecture for: "${videoWf.name}" (${videoWf.id})`);

      const details = await mcpCall('tools/call', {
        name: 'get_workflow_details',
        arguments: { id: videoWf.id },
      });

      let wfDetail = {};
      try {
        const detailText = details?.content?.[0]?.text || '{}';
        wfDetail = JSON.parse(detailText);
      } catch { /* ignore */ }

      const nodeNames = (wfDetail.nodes || []).map(n => n.name);
      console.log('  Nodes:', nodeNames.join(', '));

      // Verify the three architecture requirements
      const checks = {
        'ai_enhance guard ("Is AI Enhance ON?")': nodeNames.some(n => /ai enhance/i.test(n)),
        'AI Director node (ChatGPT Vision)':       nodeNames.some(n => /chatgpt|director|vision/i.test(n)),
        'Direct-to-Cloudinary (no binary dl)':    nodeNames.some(n => /cloudinary/i.test(n)),
        'Billing / deduct credits':               nodeNames.some(n => /deduct|billing/i.test(n)),
        'Webhook entry node':                     nodeNames.some(n => /webhook/i.test(n)),
      };

      console.log('\n  Architecture verification:');
      let allPassed = true;
      for (const [label, passed] of Object.entries(checks)) {
        console.log(`    ${passed ? '✅' : '❌'} ${label}`);
        if (!passed) allPassed = false;
      }

      if (allPassed) {
        console.log('\n  ✅ n8n workflow architecture: ALL CHECKS PASSED');
      } else {
        console.warn('\n  ⚠️  Some architecture checks failed — review node list above');
      }
    } else {
      console.warn('  ⚠️  No video workflow found via MCP — skipping architecture check');
    }
  } catch (mcpErr) {
    console.warn(`  ⚠️  MCP trace failed (non-fatal): ${mcpErr.message}`);
    console.warn('      Continuing to poll Supabase for video result...');
  }

  // ── Phase 3: Poll for Video Result ────────────────────────────────────────
  console.log('\n── Phase 3: Poll Supabase for Cloudinary Video URL ──────────');
  console.log(`  Polling content row ${postId} every 6s (up to 6 min)...`);

  const { row: completedRow, videoUrl } = await pollContentRow(postId);

  // ── Phase 4: Verification Report ──────────────────────────────────────────
  console.log('\n' + '═'.repeat(64));
  console.log('  VERIFICATION REPORT — Flow 4 Direct API Test');
  console.log('═'.repeat(64));

  const checks4 = {
    'ai_enhance: false in payload':                       payload.ai_enhance === false,
    'post_id in content row':                             !!completedRow.id,
    'brand_id in content row':                            !!completedRow.brand_id,
    'Cloudinary video URL present':                       !!videoUrl,
    'Video in blinkspot folder':                          videoUrl?.includes('blinkspot') ?? false,
    'generation_status_text populated (Realtime worked)': !!completedRow.generation_status_text,
    'Content status not failed':                          completedRow.status !== 'failed',
  };

  let allPassed4 = true;
  for (const [label, passed] of Object.entries(checks4)) {
    console.log(`  ${passed ? '✅' : '❌'} ${label}`);
    if (!passed) allPassed4 = false;
  }

  console.log('\n  Cloudinary URL:', videoUrl);
  console.log('  generation_status_text:', completedRow.generation_status_text);
  console.log('  content.status:', completedRow.status);
  console.log('  content.brand_id:', completedRow.brand_id);

  console.log('\n' + '═'.repeat(64));
  if (allPassed4) {
    console.log('  🎉 FLOW 4 — VIDEO ENGINE: ALL CHECKS PASSED');
  } else {
    console.log('  ❌ FLOW 4 — ONE OR MORE CHECKS FAILED (see above)');
    process.exit(1);
  }
  console.log('═'.repeat(64) + '\n');
})().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
