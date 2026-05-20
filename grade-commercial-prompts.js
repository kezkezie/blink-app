/**
 * grade-commercial-prompts.js
 *
 * Phase 1: Replicate the upgraded Route Director Prompt node logic locally,
 *          call GPT-4o for each of the 4 core video modes with empty user prompts
 *          (zero-input brand fallback), and grade the output against a commercial rubric.
 *
 * Phase 2: If all 4 modes pass (score >= 4/5), automatically fire the
 *          4 payloads to the live blink-generate-video-v1 webhook for real video rendering.
 *
 * Usage: node grade-commercial-prompts.js
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env ──────────────────────────────────────────────────────────────────
const envVars = {};
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)/);
    if (m) envVars[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

const OPENAI_KEY   = envVars.OPENAI_API_KEY;
const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL || 'https://hzkufspjozkgmloznkvp.supabase.co';
const SERVICE_KEY  = envVars.SUPABASE_SERVICE_ROLE_KEY;
const N8N_WEBHOOK  = `${envVars.NEXT_PUBLIC_N8N_WEBHOOK_BASE || 'https://n8n.srv1166077.hstgr.cloud/webhook'}/blink-generate-video-v1`;

const CLIENT_ID    = '948be4f8-9aba-4a3f-8c60-7bc4803d3fcf';
const BRAND_ID     = 'f965646b-4579-4389-b672-0b618a91d9e8';
const BRAND_NAME   = 'BlinkSpot';
const BRAND_INFO   = 'Premium AI SaaS for social media content creation';
const TEST_IMAGE   = 'https://res.cloudinary.com/dap8jijxa/image/upload/v1779154363/blinkspot/analyze_image/nyhdpx47zeckuxid0bzk.jpg';

const PASS_THRESHOLD = 4; // out of 5 — minimum score to trigger video render

// ── Grading Rubric ────────────────────────────────────────────────────────────
const RUBRICS = {
  showcase: [
    { label: 'Camera movement (pan / orbit / arc / sweep)',     re: /\b(pan|orbit|arc|sweep|dolly|push.in|pull.back|crane|360|circular|revolv)/i },
    { label: 'Macro / 8K / extreme detail descriptor',         re: /\b(macro|8[kK]|ultra.sharp|extreme.detail|close.up|texture|surface)/i },
    { label: 'Professional lighting (studio / rim / catch)',    re: /\b(lighting|rim.light|catch.light|studio|softbox|spotlight|key.light|backlit)/i },
    { label: 'Commercial quality language (Apple/Nike tier)',   re: /\b(commercial|premium|aspiration|luxury|product|brand|hero.shot|beauty.shot|high.end)/i },
    { label: 'Cinematography terms (lens / f-stop / mm)',       re: /\b(lens|\d{2}mm|f-stop|f\/\d|focal|aperture|shallow.depth|bokeh|cinemat)/i },
  ],
  ugc: [
    { label: 'Attention hook / scroll-stop opener',             re: /\b(hook|attention|scroll|stop|first.second|opening|reaction|unboxing|bold|dramatic)/i },
    { label: 'AI influencer / speaker / presenter',             re: /\b(influencer|presenter|speaker|person|creator|avatar|talking|camera|direct)/i },
    { label: 'Hand gestures / expressive movement',             re: /\b(hand|gesture|expressive|natural|candid|authentic|body.language|pointing|hold)/i },
    { label: 'Social / viral / TikTok / Reels aesthetic',       re: /\b(tiktok|reels|social|viral|content|short.form|vertical|9.16)/i },
    { label: 'Handheld / real-world / natural setting',         re: /\b(handheld|natural|real.world|authentic|candid|spontaneous|everyday|kitchen|desk|outdoor)/i },
  ],
  clothing: [
    { label: 'Fabric physics / drape / movement / texture',     re: /\b(fabric|drape|flow|ripple|movement|texture|weave|material|stitch|physics|wind)/i },
    { label: 'AI model / fashion editorial / poses',            re: /\b(model|editorial|fashion|pose|stance|silhouette|runway|couture|vogue|balenciaga)/i },
    { label: 'High-fashion lighting (dramatic / editorial)',     re: /\b(lighting|editorial|shadow|contrast|key.light|studio|single.source|dramatic)/i },
    { label: 'Camera movement (runway track / slow tilt)',       re: /\b(tracking|runway|tilt|pan|close.up|wide|establishing|camera)/i },
    { label: 'Slow motion / detail insert / fabric reveal',     re: /\b(slow.motion|slow.mo|detail|insert|reveal|macro|extreme.close|garment)/i },
  ],
  logo_reveal: [
    { label: '3D motion graphics / VFX / particle effect',      re: /\b(3[dD]|vfx|particle|motion.graphic|materializ|crystalliz|assemble|render)/i },
    { label: 'Dramatic reveal / emerging from dark / light',    re: /\b(reveal|emerge|darkness|light.beam|shadow|spotlight|dissipat|fog|smoke|glowing)/i },
    { label: 'Sophisticated VFX transition (chromatic / flare)',re: /\b(chromatic|aberration|lens.flare|bloom|flicker|glow|spark|energy|transition)/i },
    { label: 'Monumental scale / power / brand presence',       re: /\b(monumental|scale|powerful|impactful|bold|dramatic|epic|cinematic.scale|low.angle)/i },
    { label: 'Final lock-up / hero hold (2+ seconds)',          re: /\b(lock.up|final.shot|hero.shot|hold|rest|settle|frozen|still|last.frame)/i },
  ],
};

// ── Build system instruction (mirrors Route Director Prompt node exactly) ─────
function buildSystemInstruction(videoMode, aspectRatio, duration, targetModel) {
  const hasImages = true; // test image provided

  // Video mode brief — upgraded commercial-grade versions
  const modeMap = {
    showcase: `\n*** PRODUCTION BRIEF: CINEMATIC PRODUCT SHOWCASE — COMMERCIAL GRADE ***
This is a premium advertising shoot. The PRODUCT is the absolute star. Force these elements:
- CAMERA WORK: Dynamic, sweeping arc shots and 180° orbital pans that fully reveal every angle of the hero product. Use push-in reveals from black, and pull-back reveals showing the full context.
- 8K MACRO DETAIL: Mandatory macro close-up inserts showcasing the product's premium surface quality — texture, material finish, engraving, stitching, or reflective surfaces in extreme detail.
- LIGHTING: Premium 3-point studio lighting with dramatic catch-lights that sweep and shift as the camera moves. Use rim lighting to separate the product from the background with a halo effect.
- COMMERCIAL B-ROLL: Include beauty shot aesthetics — think Apple, Nike, or Rolex commercial quality. The product must feel desirable, aspirational, and tactile.
- MOVEMENT: The product stays PERFECTLY STATIC. Only the camera and lighting move. End on a definitive locked hero angle with a slow, confident final hold.`,

    ugc: `\n*** PRODUCTION BRIEF: VIRAL UGC / SOCIAL MEDIA REVIEW ***
This is a high-converting, viral social media video. Force these elements:
- HOOK: Start with an attention-grabbing first 2 seconds — a bold statement, a dramatic unboxing reveal, or an expressive reaction shot that stops the scroll.
- AI INFLUENCER: Feature an AI influencer or avatar talking DIRECTLY to camera in a natural, conversational, and highly expressive way. The presenter should use natural hand gestures, expressive facial reactions, and feel completely authentic.
- SOCIAL AESTHETIC: Handheld, slightly imperfect framing to feel authentic. Real-world setting — kitchen counter, desk setup, bedroom shelf, or outdoor location. Natural, golden-hour, or ring-light illumination.
- VIRAL ENERGY: Fast-paced but not chaotic. Include reaction beats, product close-ups intercut with the presenter, and end with a clear call-to-action or product demonstration.
- PLATFORM: Optimized for TikTok/Reels 9:16 format. Subject must stay in the center third of the vertical frame.`,

    clothing: `\n*** PRODUCTION BRIEF: HIGH-FASHION EDITORIAL ***
This is a premium fashion editorial shoot. Force these elements:
- FABRIC PHYSICS: The garment must exhibit realistic, physics-accurate movement — flowing, draping, rippling in a light breeze or during movement. Fabric texture and weave must be hyper-detailed.
- AI MODEL POSING: Feature a professional AI model with high-fashion poses — confident, editorial stances that showcase the garment's silhouette, cut, and drape from multiple angles.
- CAMERA ANGLES: Use dynamic runway-style tracking shots following the model, close-up detail inserts on fabric texture and construction, and wide establishing shots showing the full look.
- LIGHTING: Dramatic editorial lighting — a single powerful key light creating bold shadows, or a clean overcast studio white that emphasizes fabric color. Think Vogue, Balenciaga, or Bottega Veneta aesthetic.
- MOVEMENT: The model walks, turns, and poses naturally. Slow-motion fabric movement sequences should be intercut with standard-speed confidence walks.`,

    logo_reveal: `\n*** PRODUCTION BRIEF: PREMIUM PRODUCT / LOGO REVEAL ***
This is a high-end brand launch moment. Force these elements:
- 3D MOTION GRAPHICS: The product or logo should emerge through sophisticated 3D VFX — crystallizing from particles, materializing from light beams, assembling from component pieces, or rising dramatically from darkness.
- VFX TRANSITIONS: Use cinematic VFX transitions — volumetric fog dissipating to reveal the product, chromatic aberration effects, lens flare reveals, or light bloom effects timed to an implied beat.
- LIGHTING DRAMA: Start in total or near-total darkness. A single, powerful spotlight or light beam progressively illuminates the product, creating a dramatic chiaroscuro effect that builds tension before the full reveal.
- SCALE & IMPACT: Make the product feel monumental — use low-angle shots looking up at the product to give it a sense of power and scale.
- FINAL LOCK-UP: End on a definitive, perfectly-lit, perfectly-composed hero shot of the logo or product with at least a 2-3 second hold. The final frame should feel like a world-class advertisement.`,
  };

  const videoModeBrief = modeMap[videoMode] || `\n*** PRODUCTION BRIEF: COMMERCIAL VIDEO ***\nCreate a compelling, high-quality commercial video sequence with premium aesthetics.`;

  const durationNote = duration <= 5
    ? `\nDURATION: ${duration}s — Write ONE powerful continuous shot or at most 2 quick cuts. Every word counts.`
    : duration <= 8
    ? `\nDURATION: ${duration}s — You may include 2-3 shots or camera movements.`
    : `\nDURATION: ${duration}s — Write a full multi-shot sequence with temporal markers.`;

  const brandContext = `\nBRAND IDENTITY TO ENFORCE:\n- Brand Name: '${BRAND_NAME}'\n- Brand Vibe/Info: '${BRAND_INFO}'\nCRITICAL INSTRUCTION: You MUST adopt the exact tone, aesthetic, and personality of this brand.`;

  const klingRulebook = `\n*** KLING 3.0 MASTER RULEBOOK ***\n1. MULTI-SHOT: "Shot 1, medium close-up... Shot 2, macro shot..."\n2. TEMPORAL MARKERS: "At the 2nd second... At the 4th second..."\n3. ELEMENT CONSISTENCY: Describe subject features identically across shots.\n4. MOTION EASING: "gently accelerates", "eases into a hero hold".`;

  const framingInstruction = aspectRatio === '9:16'
    ? 'CAMERA FRAMING (9:16 VERTICAL): Keep primary subject dead-center vertically. Prioritize vertical movements.'
    : 'CAMERA FRAMING (16:9 LANDSCAPE): Use the full width — sweeping arc shots, lateral pans, horizontal reveals.';

  return `You are the world's best commercial video director and AI prompt engineer. Your prompts win Cannes Lions.
${videoModeBrief}
${durationNote}
${brandContext}
CRITICAL COMPLIANCE: Write ONLY brand-safe, family-friendly prompts.
${klingRulebook}

CORE TASK: Write a single, production-ready video prompt. Output ONLY the final prompt text — no labels, no preamble.

*** PROMPT ENHANCEMENT DIRECTIVE ***
1. LAZY CONCEPT UPGRADE: The input is empty — invent a full commercial-grade prompt using the Production Brief above. Elevate it to the quality of a $500K ad campaign.
2. ${framingInstruction}
3. VISUAL FIDELITY: Match exact colors, textures, materials visible in the reference image.
4. CINEMATOGRAPHY LANGUAGE: Use professional terms — specific lens focal lengths (24mm, 50mm, 85mm), f-stop values, lighting rig names.`;
}

// ── Grade a generated prompt ──────────────────────────────────────────────────
function gradePrompt(mode, text) {
  const criteria = RUBRICS[mode];
  const results  = criteria.map(c => ({ ...c, pass: c.re.test(text) }));
  const score    = results.filter(r => r.pass).length;
  return { score, total: criteria.length, results };
}

// ── Call GPT-4o ───────────────────────────────────────────────────────────────
async function callGPT4o(systemInstruction, userConcept, imageUrl) {
  const userContent = [
    { type: 'text', text: `USER'S CONCEPT: ${userConcept}` },
    ...(imageUrl ? [{ type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }] : []),
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user',   content: userContent },
      ],
      max_tokens: 800,
      temperature: 0.7,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`OpenAI error: ${data.error.message}`);
  return {
    text:   data.choices[0].message.content.trim(),
    tokens: data.usage,
  };
}

// ── Create content row for webhook ───────────────────────────────────────────
async function insertRow(label, videoMode, model) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/content`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify({
      client_id: CLIENT_ID, brand_id: BRAND_ID,
      content_type: 'reel', caption: `🎬 Commercial Grade: ${label}`,
      status: 'draft', ai_model: model,
      generation_status_text: 'Initializing AI Engine...',
    }),
  });
  const rows = await res.json();
  if (!res.ok || !rows[0]?.id) throw new Error(`DB insert failed: ${JSON.stringify(rows).substring(0, 100)}`);
  return rows[0].id;
}

// ── Fire n8n webhook ──────────────────────────────────────────────────────────
async function fireWebhook(postId, videoMode, model, imageUrl) {
  const payload = {
    client_id:              CLIENT_ID,
    brand_id:               BRAND_ID,
    post_id:                postId,
    video_mode:             videoMode,
    primary_image_url:      imageUrl,
    secondary_image_url:    null,
    user_prompt:            '',              // empty → triggers Zero-Input Brand Fallback
    is_sequence:            false,
    brand_name:             BRAND_NAME,
    brand_info:             BRAND_INFO,
    ai_model_override:      model,
    strict_brand_alignment: true,
    aspect_ratio:           videoMode === 'ugc' ? '9:16' : '16:9',
    duration:               5,
    ai_enhance:             true,           // AI Director ON
  };

  const res = await fetch(N8N_WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, ok: res.ok, payload };
}

// ── Test definitions ──────────────────────────────────────────────────────────
const TESTS = [
  { mode: 'showcase',    label: 'Cinematic Showcase',   model: 'auto',                      ar: '16:9', dur: 5 },
  { mode: 'ugc',         label: 'UGC Product Review',   model: 'kling-3.0/video',           ar: '9:16', dur: 10 },
  { mode: 'clothing',    label: 'Fashion Editorial',    model: 'replicate:prunaai/p-video', ar: '9:16', dur: 8 },
  { mode: 'logo_reveal', label: 'Logo/Product Reveal',  model: 'bytedance/seedance-2',      ar: '16:9', dur: 5 },
];

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not found in .env.local');

  console.log('\n' + '═'.repeat(72));
  console.log('  COMMERCIAL PROMPT GRADING TEST');
  console.log('  Empty user prompts → Zero-Input Brand Fallback → GPT-4o');
  console.log(`  Brand: ${BRAND_NAME} | "${BRAND_INFO}"`);
  console.log('═'.repeat(72));

  const gradingResults = [];
  let allPass = true;

  for (const t of TESTS) {
    console.log(`\n${'─'.repeat(72)}`);
    console.log(`  MODE: ${t.mode.toUpperCase()} — ${t.label} | Model: ${t.model} | ${t.ar} ${t.dur}s`);
    console.log(`${'─'.repeat(72)}`);

    const userConcept = `I have no specific concept and no reference images. You must invent a highly engaging, commercial-grade video sequence from scratch that perfectly embodies the provided Brand Name and Brand Info.`;
    const sysInstruction = buildSystemInstruction(t.mode, t.ar, t.dur, t.model);

    // Zero-input brand fallback test: no image passed (matches the brand-only fallback path)
    // The actual webhook WILL pass an image — n8n handles it fine with the deployed key
    process.stdout.write('  Calling GPT-4o (no image — pure brand fallback)...');
    const t0 = Date.now();
    const { text: generatedPrompt, tokens } = await callGPT4o(sysInstruction, userConcept, null);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(` ${elapsed}s | ${tokens.completion_tokens} tokens`);

    console.log('\n  ── Generated Prompt ──');
    console.log(`  ${generatedPrompt.split('\n').join('\n  ')}`);

    const { score, total, results } = gradePrompt(t.mode, generatedPrompt);
    const passed = score >= PASS_THRESHOLD;
    if (!passed) allPass = false;

    console.log(`\n  ── Grading Rubric (${score}/${total}) ${passed ? '✅ PASS' : '❌ FAIL — below threshold'} ──`);
    results.forEach(r => console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}`));

    gradingResults.push({ ...t, generatedPrompt, score, total, passed });

    await new Promise(r => setTimeout(r, 1000)); // small gap between GPT calls
  }

  // ── Phase 1 Summary ────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('  PHASE 1 GRADING SUMMARY');
  console.log('═'.repeat(72));
  let overallScore = 0;
  for (const r of gradingResults) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.label.padEnd(25)} Score: ${r.score}/${r.total}`);
    overallScore += r.score;
  }
  const maxScore = TESTS.length * 5;
  console.log(`\n  Overall: ${overallScore}/${maxScore} (${Math.round(overallScore/maxScore*100)}%)`);

  if (!allPass) {
    console.log(`\n  ⚠️  One or more modes scored below ${PASS_THRESHOLD}/5. Skipping video render.`);
    process.exit(1);
  }

  // ── Phase 2: Fire the 4 Webhooks ───────────────────────────────────────────
  console.log('\n  All modes passed. Proceeding to Phase 2 — Live Video Render...');
  console.log('\n' + '═'.repeat(72));
  console.log('  PHASE 2: FIRING LIVE WEBHOOKS (ai_enhance: true, empty prompt)');
  console.log('═'.repeat(72));

  for (const t of TESTS) {
    const postId = await insertRow(t.label, t.mode, t.model);
    const { status, ok, payload } = await fireWebhook(postId, t.mode, t.model, TEST_IMAGE);

    console.log(`\n  ▸ ${t.label}`);
    console.log(`    post_id:    ${postId}`);
    console.log(`    video_mode: ${payload.video_mode}`);
    console.log(`    model:      ${payload.ai_model_override}`);
    console.log(`    ai_enhance: ${payload.ai_enhance}  | user_prompt: "${payload.user_prompt}" (empty → brand fallback)`);
    console.log(`    n8n:        HTTP ${status} ${ok ? '✅' : '❌'}`);

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n' + '═'.repeat(72));
  console.log('  ALL 4 COMMERCIAL VIDEOS QUEUED — AI Director will expand each');
  console.log('  brand-level concept into a full Cannes-grade prompt before render.');
  console.log('═'.repeat(72) + '\n');
})().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
