#!/usr/bin/env node
/**
 * Renders the examples gallery from scripts/examples/spec.mjs and writes
 * src/lib/examples/examples.json (media hosted in Supabase storage under assets/examples/).
 * Resumable: finished items are kept in .tmp-ops/examples-state.json and skipped next run.
 *   node --env-file=.env.local scripts/examples/make-examples.mjs images|videos|voices|logos|manifest [--only id]
 * Spends Kie credits (images, Kling) and Replicate (p-video). Budget approved by Kezie 2026-10-10.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { IMAGES, EXTRA_IMAGES, REMIX, VIDEOS, STORY, LIPSYNC, VOICES, LOGOS } from "./spec.mjs";

const phase = process.argv[2];
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const STATE = ".tmp-ops/examples-state.json";
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
// Merge with what is on disk, so two phases running at once never drop each other's results.
const save = () => {
  fs.mkdirSync(".tmp-ops", { recursive: true });
  const disk = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
  Object.assign(state, { ...disk, ...state });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
};
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KIE = "https://api.kie.ai/api/v1/jobs";
const kieH = { Authorization: `Bearer ${process.env.KIE_API_TOKEN}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const want = (id) => !only || only === id;

async function kieBalance() {
  const r = await fetch("https://api.kie.ai/api/v1/chat/credit", { headers: kieH });
  return (await r.json()).data;
}

async function kieTask(model, input, label, timeoutMs = 15 * 60_000) {
  const res = await fetch(`${KIE}/createTask`, { method: "POST", headers: kieH, body: JSON.stringify({ model, input }) });
  const body = await res.json();
  const taskId = body?.data?.taskId;
  if (!taskId) throw new Error(`${label}: createTask failed ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  console.log(`  ${label}: task ${taskId}`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(5000);
    const r = await fetch(`${KIE}/recordInfo?taskId=${taskId}`, { headers: kieH }).catch(() => null);
    const d = (await r?.json().catch(() => null))?.data;
    if (d?.state === "success") return JSON.parse(d.resultJson || "{}").resultUrls?.[0];
    if (d?.state === "fail") throw new Error(`${label}: failed ${d.failMsg || d.failCode || ""}`);
  }
  throw new Error(`${label}: timed out`);
}

async function replicate(model, input, label) {
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ input }),
  });
  let p = await res.json();
  if (!p.id) throw new Error(`${label}: ${res.status} ${JSON.stringify(p).slice(0, 300)}`);
  console.log(`  ${label}: prediction ${p.id}`);
  while (!["succeeded", "failed", "canceled"].includes(p.status)) {
    await sleep(4000);
    p = await (await fetch(p.urls.get, { headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` } })).json();
  }
  if (p.status !== "succeeded") throw new Error(`${label}: ${p.status} ${p.error || ""}`);
  return Array.isArray(p.output) ? p.output[0] : p.output;
}

async function upload(path, buf, contentType) {
  const { error } = await sb.storage.from("assets").upload(`examples/${path}`, buf, { contentType, upsert: true });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return sb.storage.from("assets").getPublicUrl(`examples/${path}`).data.publicUrl;
}
const download = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());

/** Gallery size (1600px JPEG) plus a 640px thumb; the full-size Kie URL is kept as the model input. */
async function storeImage(id, srcUrl) {
  const raw = await download(srcUrl);
  const big = await sharp(raw).resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
  const thumb = await sharp(raw).resize(640, 640, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
  const meta = await sharp(big).metadata();
  return { url: await upload(`${id}.jpg`, big, "image/jpeg"), thumb: await upload(`${id}-thumb.jpg`, thumb, "image/jpeg"), width: meta.width, height: meta.height };
}

async function runAll(jobs) {
  const results = await Promise.allSettled(jobs.map((j) => j()));
  results.forEach((r) => { if (r.status === "rejected") console.error("  ✗", r.reason?.message ?? r.reason); });
  save();
}

async function imagesPhase() {
  const list = [...IMAGES, ...EXTRA_IMAGES].filter((e) => want(e.id) && !state[e.id]);
  console.log(`images to render: ${list.length}`);
  await runAll(list.map((e) => async () => {
    const src = await kieTask("nano-banana-2", { prompt: e.prompt, image_input: [], aspect_ratio: e.aspect, resolution: "4K", output_format: "jpg" }, e.id, 6 * 60_000);
    state[e.id] = { kind: "image", src, ...(await storeImage(e.id, src)), credits: 18 };
    console.log(`  ✓ ${e.id}`);
    save();
  }));
  if (want(REMIX.id) && !state[REMIX.id] && state[REMIX.source]) {
    const src = await kieTask("nano-banana-2", { prompt: REMIX.prompt, image_input: [state[REMIX.source].url], aspect_ratio: REMIX.aspect, resolution: "4K", output_format: "jpg" }, REMIX.id, 6 * 60_000);
    state[REMIX.id] = { kind: "image", src, ...(await storeImage(REMIX.id, src)), credits: 18 };
    console.log(`  ✓ ${REMIX.id}`);
    save();
  }
}

async function storeVideo(id, srcUrl) {
  const buf = await download(srcUrl);
  return { url: await upload(`${id}.mp4`, buf, "video/mp4"), bytes: buf.length };
}

const pvideo = (prompt, image, extra = {}) => ({ prompt, image, resolution: "720p", fps: 24, prompt_upsampling: true, save_audio: true, ...extra });

/** Step 1 of the app's flow: the still first frame (Nano Banana 2), kept as a hidden image. */
async function firstFrame(f) {
  if (state[f.id]) return state[f.id].url;
  const src = await kieTask("nano-banana-2", { prompt: f.prompt, image_input: [], aspect_ratio: f.aspect, resolution: "4K", output_format: "jpg" }, f.id, 6 * 60_000);
  state[f.id] = { kind: "image", src, ...(await storeImage(f.id, src)), credits: 18 };
  save();
  return state[f.id].url;
}

async function videosPhase() {
  const jobs = [];
  for (const v of VIDEOS.filter((x) => want(x.id) && !state[x.id])) {
    jobs.push(async () => {
      if (v.engine === "seedance") {
        const src = await kieTask("bytedance/seedance-2", { prompt: v.prompt, resolution: "720p", aspect_ratio: v.aspect, duration: v.duration, generate_audio: true, return_last_frame: false, web_search: false, nsfw_checker: true }, v.id);
        state[v.id] = { kind: "video", src, ...(await storeVideo(v.id, src)), credits: 41 * v.duration };
        console.log(`  ✓ ${v.id}`);
        save();
        return;
      }
      const img = v.still ? await firstFrame(v.still) : state[v.image]?.url;
      if (!img) throw new Error(`${v.id}: needs image ${v.image} first`);
      const audio = v.voice ? (state[`${v.id}-voice`]?.url ?? (await tts(`${v.id}-voice`, v.script, v.voice)).url) : null;
      const src = await replicate("prunaai/p-video", pvideo(v.prompt, img, audio ? { audio } : { duration: v.duration }), v.id);
      state[v.id] = { kind: "video", src, ...(await storeVideo(v.id, src)), audio, credits: (v.still ? 18 : 0) + 4 * v.duration + (audio ? 1 : 0) };
      console.log(`  ✓ ${v.id}`);
      save();
    });
  }
  STORY.scenes.forEach((sc, i) => {
    const id = `${STORY.id}-${i + 1}`;
    if ((!want(STORY.id) && !want(id)) || state[id]) return;
    jobs.push(async () => {
      const img = await firstFrame(sc.still);
      const src = await replicate("prunaai/p-video", pvideo(sc.prompt, img, { duration: 5 }), id);
      state[id] = { kind: "video", src, ...(await storeVideo(id, src)), credits: 38 };
      console.log(`  ✓ ${id}`);
      save();
    });
  });
  if (want(LIPSYNC.id) && !state[LIPSYNC.id]) {
    jobs.push(async () => {
      const face = state[LIPSYNC.image]?.url;
      if (!face) throw new Error(`${LIPSYNC.id}: needs ${LIPSYNC.image} first`);
      const audio = state[`${LIPSYNC.id}-voice`]?.url ?? (await tts(`${LIPSYNC.id}-voice`, LIPSYNC.script, LIPSYNC.voice)).url;
      const src = await replicate("prunaai/p-video", pvideo(LIPSYNC.prompt, face, { audio }), LIPSYNC.id);
      state[LIPSYNC.id] = { kind: "video", src, ...(await storeVideo(LIPSYNC.id, src)), audio, credits: 24 };
      console.log(`  ✓ ${LIPSYNC.id}`);
      save();
    });
  }
  console.log(`videos to render: ${jobs.length}`);
  await runAll(jobs);
}

async function tts(id, text, voice) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "tts-1", input: text, voice }),
  });
  if (!res.ok) throw new Error(`tts ${id}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  state[id] = { kind: "voice", url: await upload(`${id}.mp3`, buf, "audio/mpeg"), credits: 1 };
  save();
  return state[id];
}

async function voicesPhase() {
  for (const v of VOICES.filter((x) => want(x.id) && !state[x.id])) { await tts(v.id, v.script, v.voice); console.log(`  ✓ ${v.id}`); }
}

const VECTOR_SYSTEM = `You are a vector illustrator. Reply with ONE complete <svg> element and nothing else.
Use only: svg, g, path, rect, circle, ellipse, line, polyline, polygon, text, tspan, defs, linearGradient, radialGradient, stop.
The background must be transparent: never draw a background rectangle. Always set viewBox. Solid fills, a small palette.
For logos: a simple, bold, memorable mark that works small; wordmarks as <text> with the font-family given.`;

async function logosPhase() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  for (const l of LOGOS.filter((x) => want(x.id) && !state[x.id])) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-opus-5-5", max_tokens: 6000, system: VECTOR_SYSTEM, messages: [{ role: "user", content: `Brand colours: ${l.colors.join(", ")}. Wordmark font-family: "${l.font}". Style: flat. Draw: ${l.prompt}` }] }),
    });
    const data = await res.json();
    const svg = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("").match(/<svg[\s\S]*<\/svg>/i)?.[0];
    if (!svg || /<script|on\w+=|href=|<image|foreignObject/i.test(svg)) { console.error(`  ✗ ${l.id}: no clean svg`); continue; }
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    await page.setContent(`<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${l.font.replace(/ /g, "+")}:wght@400;700;900&display=swap"></head><body style="margin:0;background:transparent"><div id="w" style="width:800px;height:800px;display:grid;place-items:center">${svg}</div></body></html>`);
    await page.evaluate(async (font) => { await document.fonts.load(`700 48px "${font}"`); await document.fonts.ready; }, l.font);
    // Re-frame to what was actually drawn (the model's viewBox can clip a wordmark).
    await page.evaluate(() => {
      const el = document.querySelector("svg"); const b = el.getBBox(); const pad = Math.max(b.width, b.height) * 0.06;
      el.setAttribute("viewBox", `${b.x - pad} ${b.y - pad} ${b.width + 2 * pad} ${b.height + 2 * pad}`);
      el.setAttribute("width", "760"); el.setAttribute("height", "760");
    });
    const png = await page.locator("svg").screenshot({ omitBackground: true });
    const fitted = await page.evaluate(() => document.querySelector("svg").outerHTML);
    await page.close();
    state[l.id] = { kind: "logo", url: await upload(`${l.id}.png`, png, "image/png"), svg: await upload(`${l.id}.svg`, Buffer.from(fitted), "image/svg+xml").catch(() => null), credits: 0, usage: data.usage };
    console.log(`  ✓ ${l.id}`);
    save();
  }
  await browser.close();
}

/** A cache-busting version per render, so a re-rendered file never shows the CDN's old copy. */
const ver = (e) => { let h = 0; for (const c of String(e?.src ?? e?.url ?? "")) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
const versioned = (e) => (e ? Object.fromEntries(Object.entries(e).map(([k, v]) => [k, typeof v === "string" && /^https:\/\/.+\/examples\//.test(v) ? `${v}?v=${ver(e)}` : v])) : e);

function manifestPhase() {
  const s = (id) => versioned(state[id]);
  const out = [];
  const img = (e) => s(e.id) && out.push({ id: e.id, kind: "image", brand: e.brand, title: e.title, style: e.style, short: e.short, prompt: e.prompt, url: s(e.id).url, thumb: s(e.id).thumb, width: s(e.id).width, height: s(e.id).height, settings: { model: "Nano Banana 2 (4K)", aspect: e.aspect, credits: 18 }, use: { href: `/studio/image?mode=generate&prompt=${encodeURIComponent(e.prompt)}` } });
  IMAGES.forEach(img);
  if (s(REMIX.id) && s(REMIX.source)) out.push({ id: REMIX.id, kind: "remix", brand: REMIX.brand, title: REMIX.title, style: "Remix", short: REMIX.short, prompt: REMIX.prompt, url: s(REMIX.id).url, thumb: s(REMIX.id).thumb, before: s(REMIX.source).thumb, settings: { model: "Nano Banana 2 (4K)", aspect: REMIX.aspect, credits: 18 }, use: { href: "/studio/image?mode=remix" } });
  for (const v of VIDEOS) if (s(v.id)) out.push({ id: v.id, kind: "video", mode: v.mode, tab: v.tab, brand: v.brand, title: v.title, short: v.short, prompt: v.prompt, script: v.script, framePrompt: v.still?.prompt, url: s(v.id).url, input: v.still ? s(v.still.id)?.thumb : s(v.image)?.thumb, firstFrame: !!v.still, audio: s(v.id).audio ?? undefined, settings: { model: v.engine === "seedance" ? "Seedance 2 + sound" : "Pruna video", aspect: v.aspect, duration: v.duration, voice: v.voice, credits: s(v.id).credits }, use: { href: `/studio/video?mode=${v.mode}&aspect=${encodeURIComponent(v.aspect)}&brief=${encodeURIComponent(v.prompt)}` } });
  const scenes = STORY.scenes.map((sc, i) => ({ prompt: sc.prompt, framePrompt: sc.still.prompt, frame: s(sc.still.id)?.thumb, url: s(`${STORY.id}-${i + 1}`)?.url })).filter((x) => x.url);
  if (scenes.length === STORY.scenes.length) out.push({ id: STORY.id, kind: "story", mode: "storytelling", brand: STORY.brand, title: STORY.title, short: STORY.short, prompt: STORY.brief, url: scenes[0].url, input: scenes[0].frame, scenes, settings: { model: "Pruna video", aspect: STORY.aspect, duration: 15, credits: 114 }, use: { href: `/studio/video?mode=storytelling&brief=${encodeURIComponent(STORY.brief)}` } });
  if (s(LIPSYNC.id)) out.push({ id: LIPSYNC.id, kind: "video", mode: "lipsync", brand: LIPSYNC.brand, title: LIPSYNC.title, short: LIPSYNC.short, prompt: LIPSYNC.prompt, script: LIPSYNC.script, url: s(LIPSYNC.id).url, input: s(LIPSYNC.image)?.thumb, audio: s(LIPSYNC.id).audio, settings: { model: "Pruna lip-sync", aspect: LIPSYNC.aspect, voice: LIPSYNC.voice, credits: 24 }, use: { href: "/studio/video?mode=lipsync" } });
  for (const v of VOICES) if (s(v.id)) out.push({ id: v.id, kind: "voice", brand: v.brand, title: v.title, short: `Voice "${v.voice}"`, prompt: v.script, url: s(v.id).url, settings: { model: "BlinkSpot voice", voice: v.voice, credits: 1 }, use: { href: "/studio/video?mode=lipsync" } });
  for (const l of LOGOS) if (s(l.id)) out.push({ id: l.id, kind: "logo", brand: l.brand, title: l.title, short: "Drawn as an editable vector, free.", prompt: l.prompt, url: s(l.id).url, svg: s(l.id).svg, settings: { model: "AI vector", font: l.font, colors: l.colors, credits: 0 }, use: { href: "/studio/brand-builder" } });
  fs.mkdirSync("src/lib/examples", { recursive: true });
  fs.writeFileSync("src/lib/examples/examples.json", JSON.stringify(out, null, 1) + "\n");
  console.log(`manifest: ${out.length} examples → src/lib/examples/examples.json`);
}

const before = phase === "manifest" || phase === "logos" || phase === "voices" ? null : await kieBalance();
if (before !== null) console.log(`Kie balance before: ${before}`);
if (phase === "images") await imagesPhase();
else if (phase === "videos") await videosPhase();
else if (phase === "voices") await voicesPhase();
else if (phase === "logos") await logosPhase();
else if (phase === "manifest") manifestPhase();
else { console.error("phase: images|videos|voices|logos|manifest"); process.exit(1); }
if (before !== null) { const after = await kieBalance(); console.log(`Kie balance after: ${after} (spent ${(before - after).toFixed(2)})`); }
