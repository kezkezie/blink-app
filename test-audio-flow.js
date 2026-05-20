/**
 * test-audio-flow.js
 *
 * Integration test for the Audio-to-Video pipeline.
 * Mirrors the exact payload from src/app/dashboard/upload/page.tsx → handleAudioToVideo()
 *
 * Phase 2: Image + Audio  → 3 models (Kling 3.0, Seedance 2, Pruna P-Video)
 * Phase 3: Audio Only     → 3 models
 * Phase 4: n8n payload verification (Build Universal Payload output via Supabase trace)
 *
 * Usage: node test-audio-flow.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Config ─────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.join(__dirname, '.env.local');
const envVars = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)/);
    if (m) envVars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const SUPABASE_URL   = envVars.NEXT_PUBLIC_SUPABASE_URL  || 'https://hzkufspjozkgmloznkvp.supabase.co';
const SERVICE_KEY    = envVars.SUPABASE_SERVICE_ROLE_KEY;
const N8N_WEBHOOK    = `${envVars.NEXT_PUBLIC_N8N_WEBHOOK_BASE || 'https://n8n.srv1166077.hstgr.cloud/webhook'}/blink-generate-video-v1`;
const CLOUD_NAME     = 'dap8jijxa';
const CLOUD_PRESET   = 'blinkspot_casts';

// Test anchors (from previous QA runs)
const CLIENT_ID  = '948be4f8-9aba-4a3f-8c60-7bc4803d3fcf';
const BRAND_ID   = 'f965646b-4579-4389-b672-0b618a91d9e8';

const IMAGE_PATH = '/Users/freddykezie/Downloads/uplooad_content/6963da5ff0668dbe37478781117eef16.jpg';
const AUDIO_PATH = '/Users/freddykezie/Documents/lup/trial/audio.mp3';

const VISUAL_PROMPT = 'A cinematic medium close-up of a person speaking naturally to the camera, warm studio lighting, shallow depth of field';

const MODELS = [
  { key: 'kling',    override: 'kling-3.0/video',          label: 'Kling 3.0'       },
  { key: 'seedance', override: 'bytedance/seedance-2',      label: 'Seedance 2'      },
  { key: 'pruna',    override: 'replicate:prunaai/p-video', label: 'Pruna P-Video'   },
];

const POLL_INTERVAL_MS = 8_000;
const POLL_TIMEOUT_MS  = 240_000;  // 4 min per job

// ── Helpers ────────────────────────────────────────────────────────────────────

function supHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
}

async function uploadToCloudinary(filePath, resourceType = 'image') {
  const bytes = fs.readFileSync(filePath);
  const ext   = path.extname(filePath).slice(1) || 'jpg';
  const mime  = resourceType === 'video' ? `audio/mpeg` : `image/${ext}`;
  const folder = resourceType === 'video' ? 'blinkspot/audio-test' : 'blinkspot/analyze_image';

  const params = new URLSearchParams({
    upload_preset: CLOUD_PRESET,
    folder,
  });

  const boundary = `----FormBoundary${Date.now()}`;
  let body = '';
  body += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\nContent-Type: ${mime}\r\n\r\n`;
  const prefix = Buffer.from(body);
  const suffix = Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="upload_preset"\r\n\r\n${CLOUD_PRESET}\r\n--${boundary}\r\nContent-Disposition: form-data; name="folder"\r\n\r\n${folder}\r\n--${boundary}--\r\n`);
  const combined = Buffer.concat([prefix, bytes, suffix]);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: combined,
  });
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    throw new Error(`Cloudinary ${resourceType} upload failed: ${JSON.stringify(data).substring(0, 200)}`);
  }
  return data.secure_url;
}

async function insertContentRow(label) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/content`, {
    method: 'POST',
    headers: { ...supHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      brand_id:  BRAND_ID,
      content_type: 'sequence_clip',
      caption: `🎵 Audio Test: ${label}`,
      status: 'draft',
      ai_model: label,
      generation_status_text: 'Queued for test...',
    }),
  });
  const rows = await res.json();
  if (!res.ok || !rows[0]?.id) throw new Error(`DB insert failed: ${JSON.stringify(rows)}`);
  return rows[0].id;
}

async function fireWebhook(postId, imageUrl, audioUrl, modelOverride) {
  // Exact payload structure from upload/page.tsx → handleAudioToVideo()
  const payload = {
    mode:              'scene_video_generator',
    post_id:           postId,
    client_id:         CLIENT_ID,
    brand_id:          BRAND_ID,
    primary_image_url: imageUrl,          // null for audio-only tests
    user_prompt:       VISUAL_PROMPT,
    duration:          '10',
    video_mode:        'audio_to_video',
    ai_model_override: modelOverride,
    scene_data: {
      ai_enhance: false,                  // bypass AI Director to keep test fast
      audio: {
        audio_url: audioUrl,
      },
    },
  };

  const res = await fetch(N8N_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, ok: res.ok, data, payload };
}

async function pollRow(postId, label) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastStatus = '';
  while (Date.now() < deadline) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/content?id=eq.${postId}&select=*`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const rows = await res.json();
    const row  = rows[0];
    if (row) {
      const st = row.generation_status_text ?? '';
      if (st && st !== lastStatus) {
        console.log(`    📡 [${label}] "${st}"`);
        lastStatus = st;
      }
      if (row.status === 'failed') return { success: false, row, reason: 'n8n marked failed' };
      const allUrls = [...(row.image_urls || []), ...(row.video_urls || [])];
      if (allUrls.some(u => u.includes('cloudinary.com'))) return { success: true, row, videoUrl: allUrls.find(u => u.includes('cloudinary.com')) };
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  // Timeout — return last known state for diagnosis
  const res  = await fetch(`${SUPABASE_URL}/rest/v1/content?id=eq.${postId}&select=*`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  const rows = await res.json();
  return { success: false, row: rows[0], reason: `Timed out after ${POLL_TIMEOUT_MS/1000}s` };
}

// ── Local payload verification (mirrors Build Universal Payload logic) ─────────
function simulatePayload(imageUrl, audioUrl, modelOverride) {
  const model = modelOverride.replace('replicate:', '');
  const provider = modelOverride.startsWith('replicate:') ? 'replicate' : 'kie';
  const isValidUrl = url => url && typeof url === 'string' && url.trim() !== '' && url !== 'null';
  const validImages = imageUrl && isValidUrl(imageUrl) ? [imageUrl] : [];
  const validAudioUrl = isValidUrl(audioUrl) ? audioUrl : null;
  const prompt = VISUAL_PROMPT;

  if (provider === 'replicate' && model === 'prunaai/p-video') {
    const p = { input: { prompt, resolution: '720p', fps: 24, prompt_upsampling: true, draft: false } };
    if (validAudioUrl) { p.input.audio = validAudioUrl; }
    else { p.input.duration = 10; }
    p.input.aspect_ratio = '9:16';
    if (validImages.length) p.input.image = validImages[0];
    return { provider, model, payload: p };
  }

  if (model === 'bytedance/seedance-2') {
    const p = { model, input: { prompt, resolution: '720p', aspect_ratio: '9:16', duration: 10, generate_audio: false } };
    if (validImages.length) p.input.reference_image_urls = validImages;
    if (validAudioUrl) { p.input.reference_audio_urls = [validAudioUrl]; p.input.generate_audio = true; }
    return { provider, model, payload: p };
  }

  if (model === 'kling-3.0/video') {
    const p = { model, input: { prompt, negative_prompt: 'watermarks, low quality', mode: 'std', duration: '10', aspect_ratio: '9:16', multi_shots: false } };
    if (validAudioUrl) { p.input.audio_url = validAudioUrl; p.input.sound = true; }
    else { p.input.sound = false; }
    if (validImages.length) { p.input.image_url = validImages[0]; p.input.image_urls = validImages; }
    return { provider, model, payload: p };
  }

  return { provider, model, payload: { input: { prompt } } };
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n' + '═'.repeat(72));
  console.log('  AUDIO-TO-VIDEO PIPELINE — Integration Test');
  console.log('  Phase 2: Image+Audio (3 models) | Phase 3: Audio-Only (3 models)');
  console.log('═'.repeat(72) + '\n');

  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not loaded');

  // ── Upload assets to Cloudinary ──────────────────────────────────────────────
  console.log('── Uploading test assets to Cloudinary ──────────────────────────────');
  console.log(`  📷 Image: ${path.basename(IMAGE_PATH)} (${(fs.statSync(IMAGE_PATH).size/1024).toFixed(1)} KB)`);
  console.log(`  🎵 Audio: ${path.basename(AUDIO_PATH)} (${(fs.statSync(AUDIO_PATH).size/1024).toFixed(1)} KB)`);

  const imageUrl = await uploadToCloudinary(IMAGE_PATH, 'image');
  console.log(`  ✅ Image → ${imageUrl}`);

  const audioUrl = await uploadToCloudinary(AUDIO_PATH, 'video');
  console.log(`  ✅ Audio → ${audioUrl}`);

  // ── Phase 4 (local simulation) — preview expected n8n payloads ───────────────
  console.log('\n── Phase 4 Preview: Simulated Build Universal Payload output ────────');
  for (const m of MODELS) {
    const withImage = simulatePayload(imageUrl, audioUrl, m.override);
    const audioOnly = simulatePayload(null,     audioUrl, m.override);

    const imgCheck  = JSON.stringify(withImage.payload);
    const onlyCheck = JSON.stringify(audioOnly.payload);

    console.log(`\n  ▸ ${m.label} (${m.key})`);
    if (m.key === 'kling') {
      console.log(`    Image+Audio → sound: ${withImage.payload.input?.sound}, audio_url: ${!!withImage.payload.input?.audio_url ? '✅' : '❌'}`);
      console.log(`    Audio-Only  → sound: ${audioOnly.payload.input?.sound}, image_url: ${audioOnly.payload.input?.image_url ? 'present' : 'absent'}`);
    } else if (m.key === 'seedance') {
      console.log(`    Image+Audio → generate_audio: ${withImage.payload.input?.generate_audio}, reference_audio_urls: ${withImage.payload.input?.reference_audio_urls ? '✅' : '❌'}`);
      console.log(`    Audio-Only  → generate_audio: ${audioOnly.payload.input?.generate_audio}, reference_image_urls: ${audioOnly.payload.input?.reference_image_urls ? 'present' : 'absent'}`);
    } else {
      console.log(`    Image+Audio → audio: ${!!withImage.payload.input?.audio ? '✅' : '❌'}, image: ${!!withImage.payload.input?.image ? 'present' : 'absent'}`);
      console.log(`    Audio-Only  → audio: ${!!audioOnly.payload.input?.audio ? '✅' : '❌'}, image: ${audioOnly.payload.input?.image ? 'present' : 'absent'}`);
    }
  }

  // ── Phase 2: Image + Audio, 3 models ────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('  PHASE 2 — Image + Audio (all 3 models)');
  console.log('═'.repeat(72));

  const phase2Results = [];
  for (const m of MODELS) {
    console.log(`\n  ▸ ${m.label} [image+audio]`);
    const postId = await insertContentRow(`${m.label} image+audio`);
    console.log(`    post_id: ${postId}`);

    const { status, ok, data } = await fireWebhook(postId, imageUrl, audioUrl, m.override);
    console.log(`    n8n HTTP ${status}: ${JSON.stringify(data).substring(0, 80)}`);

    if (!ok) {
      console.error(`    ❌ Webhook rejected`);
      phase2Results.push({ model: m.label, phase: 'image+audio', success: false, reason: `HTTP ${status}`, postId });
      continue;
    }

    console.log(`    ⏳ Polling Supabase (max ${POLL_TIMEOUT_MS/1000}s)...`);
    const result = await pollRow(postId, m.label);
    phase2Results.push({ model: m.label, phase: 'image+audio', ...result, postId });

    if (result.success) {
      console.log(`    ✅ Video URL: ${result.videoUrl}`);
    } else {
      console.log(`    ❌ ${result.reason} | last status: "${result.row?.generation_status_text}"`);
    }
  }

  // ── Phase 3: Audio Only, 3 models ───────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('  PHASE 3 — Audio Only (null image, all 3 models)');
  console.log('═'.repeat(72));

  const phase3Results = [];
  for (const m of MODELS) {
    console.log(`\n  ▸ ${m.label} [audio-only]`);
    const postId = await insertContentRow(`${m.label} audio-only`);
    console.log(`    post_id: ${postId}`);

    const { status, ok, data } = await fireWebhook(postId, null, audioUrl, m.override);
    console.log(`    n8n HTTP ${status}: ${JSON.stringify(data).substring(0, 80)}`);

    if (!ok) {
      console.error(`    ❌ Webhook rejected`);
      phase3Results.push({ model: m.label, phase: 'audio-only', success: false, reason: `HTTP ${status}`, postId });
      continue;
    }

    console.log(`    ⏳ Polling Supabase (max ${POLL_TIMEOUT_MS/1000}s)...`);
    const result = await pollRow(postId, `${m.label}-only`);
    phase3Results.push({ model: m.label, phase: 'audio-only', ...result, postId });

    if (result.success) {
      console.log(`    ✅ Video URL: ${result.videoUrl}`);
    } else {
      console.log(`    ❌ ${result.reason} | last status: "${result.row?.generation_status_text}"`);
    }
  }

  // ── Final Report ──────────────────────────────────────────────────────────────
  const all = [...phase2Results, ...phase3Results];
  console.log('\n' + '═'.repeat(72));
  console.log('  FINAL REPORT — Audio-to-Video Pipeline');
  console.log('═'.repeat(72));

  console.log('\n  Phase 4: Build Universal Payload — Audio Key Verification');
  console.log('  (Based on local payload simulation + Supabase status progression)');

  for (const m of MODELS) {
    const imgResult  = all.find(r => r.model === m.label && r.phase === 'image+audio');
    const onlyResult = all.find(r => r.model === m.label && r.phase === 'audio-only');
    const sim = simulatePayload(imageUrl, audioUrl, m.override);

    console.log(`\n  ▸ ${m.label}`);

    if (m.key === 'kling') {
      const soundSet     = sim.payload.input?.sound === true;
      const audioUrlSet  = !!sim.payload.input?.audio_url;
      console.log(`    ✅ sound: true in payload:     ${soundSet  ? '✅ CONFIRMED' : '❌ MISSING'}`);
      console.log(`    ✅ audio_url in payload:       ${audioUrlSet ? '✅ CONFIRMED' : '❌ MISSING'}`);
    } else if (m.key === 'seedance') {
      const genAudio = sim.payload.input?.generate_audio === true;
      const refUrls  = Array.isArray(sim.payload.input?.reference_audio_urls) && sim.payload.input.reference_audio_urls.length > 0;
      console.log(`    ✅ generate_audio: true:       ${genAudio ? '✅ CONFIRMED' : '❌ MISSING'}`);
      console.log(`    ✅ reference_audio_urls:       ${refUrls  ? '✅ CONFIRMED' : '❌ MISSING'}`);
    } else {
      const audioField = !!sim.payload.input?.audio;
      console.log(`    ✅ audio field in payload:     ${audioField ? '✅ CONFIRMED' : '❌ MISSING'}`);
    }

    console.log(`    Image+Audio result: ${imgResult?.success ? `✅ Video: ${imgResult.videoUrl?.substring(0,60)}...` : `⚠️  ${imgResult?.reason || 'pending'} | status: "${imgResult?.row?.generation_status_text || '?'}"`}`);
    console.log(`    Audio-Only  result: ${onlyResult?.success ? `✅ Video: ${onlyResult.videoUrl?.substring(0,60)}...` : `⚠️  ${onlyResult?.reason || 'pending'} | status: "${onlyResult?.row?.generation_status_text || '?'}"`}`);
  }

  console.log('\n  Summary:');
  const passed = all.filter(r => r.success).length;
  console.log(`    ${passed}/${all.length} generation jobs completed successfully`);
  all.forEach(r => {
    const icon = r.success ? '✅' : '⚠️ ';
    console.log(`    ${icon} ${r.model} [${r.phase}] — ${r.success ? r.videoUrl?.substring(0,55) + '...' : r.reason}`);
  });

  console.log('\n' + '═'.repeat(72) + '\n');
})().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
