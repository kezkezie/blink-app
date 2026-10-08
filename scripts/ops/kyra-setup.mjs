#!/usr/bin/env node
/**
 * One-off production setup for the KYRA brand build. Dry-run by default: every write prints exactly
 * what it would do; only `--live` writes. Reads are always live.
 *
 *   node --env-file=.env.local scripts/ops/kyra-setup.mjs whoami <email>
 *       -> client id(s) for that login, credit balance, last 5 credit transactions, brands
 *   node --env-file=.env.local scripts/ops/kyra-setup.mjs log-topup <clientId> <amount> [--live]
 *       -> records an already-applied manual top-up in credit_transactions (balance is NOT changed)
 *   node --env-file=.env.local scripts/ops/kyra-setup.mjs brand <clientId> [--live]
 *       -> finds the KYRA brand profile for this client, or creates it (palette, fonts, voice from kyragroup.co.ke)
 *   node --env-file=.env.local scripts/ops/kyra-setup.mjs kling-pro [--live]
 *       -> Generate Video V3: Kling mode 'std' (720p) -> 'pro' (1080p). Backs the workflow up first.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL and N8N_API_KEY (or N8N_TEST_TOKEN).
 */
import fs from "node:fs";

const [cmd, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const LIVE = process.argv.includes("--live");
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1", VIDEO_WORKFLOW = "fy6MbNs4ShWkKk0i", IMAGE_WORKFLOW = "LXINWLmOghHWzRgA";
const sbHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function sb(path, init = {}) {
  const res = await fetch(`${SB}${path}`, { ...init, headers: { ...sbHeaders, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const plan = (what, body) => { console.log(`${LIVE ? "WRITE" : "DRY-RUN (add --live to write)"}: ${what}`); if (body) console.log(JSON.stringify(body, null, 2)); };

const commands = {
  async whoami(email) {
    if (!email) throw new Error("usage: whoami <email>");
    let user = null;
    for (let page = 1; !user && page <= 20; page++) {
      const { users } = await sb(`/auth/v1/admin/users?page=${page}&per_page=200`);
      if (!users.length) break;
      user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    }
    if (!user) throw new Error(`no auth user with email ${email}`);
    const clients = await sb(`/rest/v1/clients?user_id=eq.${user.id}&select=*`);
    console.log(`user ${user.id} (${email}): ${clients.length} client(s)`);
    for (const c of clients) {
      const [bal] = await sb(`/rest/v1/credit_balances?client_id=eq.${c.id}&select=balance,lifetime_earned,lifetime_spent,updated_at`);
      const tx = await sb(`/rest/v1/credit_transactions?client_id=eq.${c.id}&order=created_at.desc&limit=5&select=amount,balance_after,operation,description,created_at`);
      const brands = await sb(`/rest/v1/brand_profiles?client_id=eq.${c.id}&select=id,brand_name,is_active`);
      console.log(`\nclient ${c.id}  ${c.business_name ?? c.name ?? ""}`, "\n  balance:", bal ?? "none", "\n  last tx:", tx, "\n  brands:", brands);
    }
  },

  async "log-topup"(clientId, amount) {
    const n = Number(amount);
    if (!clientId || !Number.isInteger(n) || n <= 0) throw new Error("usage: log-topup <clientId> <positive integer>");
    const [bal] = await sb(`/rest/v1/credit_balances?client_id=eq.${clientId}&select=balance`);
    if (!bal) throw new Error(`no credit_balances row for ${clientId}`);
    const row = { client_id: clientId, amount: n, balance_after: bal.balance, operation: "admin_grant",
      description: `Manual top-up of ${n} credits (applied in Supabase SQL editor 2026-10-08), recorded for KYRA v2 asset generation` };
    plan("insert credit_transactions", row);
    if (LIVE) console.log(await sb("/rest/v1/credit_transactions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) }));
  },

  async brand(clientId) {
    if (!clientId) throw new Error("usage: brand <clientId>");
    const found = await sb(`/rest/v1/brand_profiles?client_id=eq.${clientId}&brand_name=ilike.*kyra*&select=id,brand_name,is_active`);
    if (found.length) { console.log("KYRA brand already exists:", found); return; }
    const row = {
      client_id: clientId, source: "manual", brand_name: "KYRA", company_name: "KYRA Group",
      industry: "Luxury automotive: car imports, vinyl wraps and PPF, premium car wash",
      description: "Nairobi's home of performance imports. KYRA Platinum Imports, KYRA Customs and KYRA Wash, Brookside Drive, Spring Valley, Westlands.",
      website_url: "https://www.kyragroup.co.ke", social_urls: "https://www.instagram.com/kyra.platinum.imports/",
      primary_color: "#E2131F", secondary_color: "#0B0B0C", accent_color: "#FFFFFF",
      additional_colors: ["#121214", "#ECE9E9", "#8A8A8E", "#DCA6AE"],
      primary_font: "Syne", secondary_font: "Plus Jakarta Sans", font_weights: ["800", "400", "600"],
      image_style: "High-end automotive campaign photography. White cars, black studios or seamless white cyclorama, one red accent. Razor sharp, no text in images.",
      composition_notes: "One car per frame, generous negative space, locked or slow camera. Red appears once: calipers, a light line, or the wrap itself.",
      brand_voice: "Confident, precise, aspirational. Short lines. Never shouty.",
      tone_keywords: ["exceptional", "curated", "precise", "white-glove"],
      vocabulary_notes: "Import. Customize. Maintain. KYRΛ is written with Λ for the A in display type.",
      dos: "White, black and red only. Real KYRA services: imports, wraps/PPF, wash.",
      donts: "No other colours, no busy backgrounds, no stock-photo people, no text baked into images.",
      is_active: true,
    };
    plan("insert brand_profiles", row);
    if (LIVE) console.log(await sb("/rest/v1/brand_profiles", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) }));
  },

  async library(clientId, brandId) {
    if (!clientId) throw new Error("usage: library <clientId> [brandId]");
    const rows = await sb(`/rest/v1/content?client_id=eq.${clientId}${brandId ? `&brand_id=eq.${brandId}` : ""}&order=created_at.desc&limit=15&select=*`);
    console.log(`${rows.length} recent content row(s)${brandId ? ` for brand ${brandId}` : ""}`);
    for (const r of rows) console.log(" ", r.created_at, r.id, "| brand", r.brand_id, "|", r.content_type ?? r.type ?? "", "|", r.status ?? "", "|", (r.image_urls?.[0] ?? r.video_url ?? r.media_url ?? "").slice(0, 70));
  },

  async executions(workflow = "image", n = "3") {
    const id = workflow === "video" ? VIDEO_WORKFLOW : workflow === "image" ? IMAGE_WORKFLOW : workflow;
    const h = { "X-N8N-API-KEY": process.env.N8N_API_KEY || process.env.N8N_TEST_TOKEN };
    const list = await (await fetch(`${N8N}/executions?workflowId=${id}&limit=${n}`, { headers: h })).json();
    for (const e of list.data ?? []) {
      const full = await (await fetch(`${N8N}/executions/${e.id}?includeData=true`, { headers: h })).json();
      const run = full.data?.resultData ?? {};
      const nodes = Object.entries(run.runData ?? {});
      const last = nodes.at(-1)?.[0];
      const errNode = nodes.find(([, runs]) => runs.some((r) => r.error))?.[0];
      const err = run.error?.message ?? nodes.flatMap(([, rs]) => rs.map((r) => r.error?.message)).find(Boolean);
      console.log(`${e.id} ${e.status} ${e.startedAt} -> ${e.stoppedAt ?? "running"} | ${nodes.length} nodes ran, last: ${last}${errNode ? ` | ERROR in ${errNode}: ${String(err).slice(0, 300)}` : ""}`);
      const tail = nodes.slice(-4).map(([name, rs]) => `${name}: ${JSON.stringify(rs.at(-1)?.data?.main?.[0]?.[0]?.json ?? {}).slice(0, 260)}`);
      console.log("   " + tail.join("\n   "));
    }
  },

  async "delete-rows"(clientId, ...ids) {
    // Library rows only (scoped to the client); the Cloudinary files are left alone.
    if (!clientId || !ids.length) throw new Error("usage: delete-rows <clientId> <contentId> [...]");
    const rows = await sb(`/rest/v1/content?client_id=eq.${clientId}&id=in.(${ids.join(",")})&select=id,caption,content_type`);
    if (rows.length !== ids.length) throw new Error(`only ${rows.length}/${ids.length} ids belong to this client; nothing deleted`);
    plan(`delete ${rows.length} library row(s)`, rows.map((r) => `${r.id} ${r.caption}`));
    if (LIVE) { await sb(`/rest/v1/content?client_id=eq.${clientId}&id=in.(${ids.join(",")})`, { method: "DELETE" }); console.log("deleted"); }
  },

  async "attach-video"(postId, videoUrl) {
    if (!postId || !/^https:\/\/res\.cloudinary\.com\//.test(videoUrl ?? "")) throw new Error("usage: attach-video <postId> <cloudinary mp4 url>");
    const [row] = await sb(`/rest/v1/content?id=eq.${postId}&select=id,caption,video_urls,generation_state,billing_state`);
    if (!row) throw new Error(`no content row ${postId}`);
    const patch = { video_urls: [videoUrl], generation_state: "succeeded", billing_state: "charged", generation_status_text: "Ready", updated_at: new Date().toISOString() };
    plan(`attach video to ${row.caption} (${postId}); was ${JSON.stringify({ video_urls: row.video_urls, generation_state: row.generation_state })}`, patch);
    if (LIVE) console.log(await sb(`/rest/v1/content?id=eq.${postId}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }).then((r) => r.map((x) => `${x.id} ${x.generation_state} ${x.video_urls?.[0]}`)));
  },

  async "image-4k"() {
    // Only the nano-banana-2 branches set output_format; the two other-model branches stay at 1K.
    await patchWorkflow(IMAGE_WORKFLOW, "Build Payload Router", "resolution: '1K', output_format", "resolution: '4K', output_format", "Nano Banana 2 now renders 4K");
  },

  async "seedance-1080p"() {
    // Only the Seedance 2.5 branch (Kling 3.0 image-to-video returns frozen clips on Kie, 5/5 runs 2026-10-08).
    await patchWorkflow(VIDEO_WORKFLOW, "Build Universal Payload", "resolution: '720p'", "resolution: '1080p'", "Seedance 2.5 now renders 1080p",
      { after: "audio-with-frame is refused upstream before deduction." });
  },

  async "image-jpg"() {
    // 4K PNGs are ~16 MB and Cloudinary rejects anything over 10 MB; a 4K JPG is ~2-4 MB.
    await patchWorkflow(IMAGE_WORKFLOW, "Build Payload Router", "resolution: '4K', output_format: 'png'", "resolution: '4K', output_format: 'jpg'", "Nano Banana 2 now returns 4K JPG");
  },

  async "save-images"(clientId, brandId, manifestPath, captionPrefix = "KYRA") {
    if (!clientId || !brandId || !manifestPath) throw new Error("usage: save-images <clientId> <brandId> <manifest.json>");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const existing = new Set((await sb(`/rest/v1/content?client_id=eq.${clientId}&brand_id=eq.${brandId}&select=image_urls`)).flatMap((r) => r.image_urls ?? []));
    const rows = Object.entries(manifest).filter(([, v]) => v?.url && !existing.has(v.url)).map(([id, v]) => ({
      client_id: clientId, brand_id: brandId, content_type: "post_image", status: "draft",
      caption: `${captionPrefix}: ${id}`, image_urls: [v.url], ai_model: "nano-banana-2",
    }));
    plan(`insert ${rows.length} content row(s) into the ${captionPrefix} library (${existing.size} already there)`, rows.map((r) => r.caption));
    if (LIVE && rows.length) console.log((await sb("/rest/v1/content", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rows) })).map((r) => `${r.id} ${r.caption}`).join("\n"));
  },

  async "video-row"(clientId, brandId, startUrl, caption) {
    if (!clientId || !brandId || !startUrl) throw new Error("usage: video-row <clientId> <brandId> <startImageUrl> [caption]");
    // Same initial envelope as Video Studio (lib/video-job.ts). Without it the workflow's final save
    // filters on generation_state/billing_state NOT IN (...), which NULL never satisfies: 0 rows, silently.
    const row = { client_id: clientId, brand_id: brandId, content_type: "video", status: "draft", caption: caption ?? "KYRA video", image_urls: [startUrl], ai_model: "kling-3.0/video",
      generation_state: "queued", billing_state: "not_charged", retry_state: "none", generation_status_text: "Queued" };
    plan("insert content (video placeholder, the workflow fills it when the clip is ready)", row);
    if (LIVE) { const [r] = await sb("/rest/v1/content", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) }); console.log(`POST_ID=${r.id}`); }
  },

  async "kling-pro"() {
    await patchWorkflow(VIDEO_WORKFLOW, "Build Universal Payload", "mode: 'std'", "mode: 'pro'", "Kling now renders 1080p (pro)");
  },

};

/** n8n's public API rejects unknown settings keys (400 "must NOT have additional properties"). */
const SETTINGS_KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];
const pickSettings = (st = {}) => Object.fromEntries(Object.entries(st).filter(([k]) => SETTINGS_KEYS.includes(k)));

/** Replace every `from` with `to` in one Code node of a live workflow. Dry-run lists each hit; --live backs up, then PUTs. */
async function patchWorkflow(id, nodeName, from, to, done, { after } = {}) {
  const key = process.env.N8N_API_KEY || process.env.N8N_TEST_TOKEN;
  const h = { "X-N8N-API-KEY": key, "Content-Type": "application/json" };
  const r = await fetch(`${N8N}/workflows/${id}`, { headers: h });
  if (!r.ok) throw new Error(`GET workflow ${id} -> ${r.status}`);
  const wf = await r.json();
  const node = wf.nodes?.find((n) => n.name === nodeName);
  if (!node) throw new Error(`${nodeName} not found in ${wf.name}`);
  const field = node.parameters.jsCode !== undefined ? "jsCode" : "functionCode";
  const code = node.parameters[field];
  // `after`: patch only the first `from` that follows this unique anchor (one branch, not every model).
  const start = after ? code.indexOf(after) : 0;
  if (after && (start < 0 || code.indexOf(after, start + 1) >= 0)) throw new Error(`anchor not found exactly once: ${after}`);
  const region = after ? code.slice(start, code.indexOf(from, start) + from.length) : code;
  if (after && code.indexOf(from, start) < 0) { console.log(`${wf.name}: "${from}" not found after anchor`); return; }
  const hits = after ? 1 : code.split(from).length - 1;
  if (!hits || (after && !region.endsWith(from))) { console.log(code.includes(to) ? `${wf.name}: already patched` : `${wf.name}: "${from}" not found; not touching it`); return; }
  let at = after ? start - 1 : -1;
  for (let i = 0; i < hits; i++) { at = code.indexOf(from, at + 1); console.log(`  hit ${i + 1}: ...${code.slice(at - 110, at + 30).replace(/\s+/g, " ")}...`); }
  plan(`${wf.name} / ${nodeName}: ${hits} x ${from} -> ${to}`);
  if (!LIVE) return;
  fs.mkdirSync("scripts/ops/backups", { recursive: true });
  const backup = `scripts/ops/backups/${id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backup, JSON.stringify(wf, null, 2));
  console.log(`backup: ${backup}`);
  node.parameters[field] = after ? code.slice(0, at) + to + code.slice(at + from.length) : code.split(from).join(to);
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: pickSettings(wf.settings), ...(wf.staticData ? { staticData: wf.staticData } : {}) };
  const res = await fetch(`${N8N}/workflows/${id}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  console.log(`PUT -> ${res.status}`, res.ok ? `${done}. Roll back by PUTting the backup.` : (await res.text()).slice(0, 300));
}

if (!commands[cmd]) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split("*/")[0]); process.exit(1); }
commands[cmd](...rest).catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
