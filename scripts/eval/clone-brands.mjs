#!/usr/bin/env node
/**
 * Clone golden brands onto the eval client so evals never read from or write to
 * a real customer's brand. Approved by Kezie 2026-09-29.
 *
 * DRY RUN by default. `--live` performs the inserts. Idempotent: a brand already
 * cloned (same brand_name on the eval client) is reused, not duplicated.
 * Writes scripts/eval/brands.json: golden key -> eval brand id.
 *
 *   node scripts/eval/clone-brands.mjs          # plan only
 *   node scripts/eval/clone-brands.mjs --live   # clone
 */
import fs from "node:fs";
import { EVAL_CLIENT, GOLDEN_BRANDS } from "./lib/config.mjs";
import { assertAllowlistedClient, isMutationOk } from "../rehearsals/lib/guards.mjs";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE = process.argv.includes("--live");
const OUT = new URL("./brands.json", import.meta.url);

// Fields that define a brand's identity. id/client_id/timestamps are excluded.
const COPY_FIELDS = [
  "source", "logo_url", "primary_color", "secondary_color", "accent_color", "additional_colors",
  "primary_font", "secondary_font", "font_weights", "image_style", "composition_notes",
  "logo_usage_rules", "brand_voice", "tone_keywords", "vocabulary_notes", "preferred_formats",
  "dos", "donts", "brand_guidelines_url", "uploaded_assets", "visual_style_guide",
  "brand_name", "company_name", "industry", "description", "website_url", "social_urls",
];

const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
// Reads are retried: they are side-effect free. Inserts are NOT retried here;
// a lost insert response is resolved on the next run by the name-based reuse check.
const get = async (path) => {
  let last;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const r = await fetch(`${SB}/rest/v1/${path}`, { headers: h, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`GET ${path.split("?")[0]} HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
      await new Promise((res) => setTimeout(res, 3000 * attempt));
    }
  }
  throw last;
};

async function main() {
  if (!SB || !KEY) { console.error("Supabase env not set."); return 2; }
  assertAllowlistedClient(EVAL_CLIENT);
  const onEval = await get(`brand_profiles?client_id=eq.${EVAL_CLIENT}&is_active=eq.true&select=id,brand_name`);
  const map = {};

  for (const g of GOLDEN_BRANDS) {
    if (g.existingId) {
      const found = onEval.find((b) => b.id === g.existingId);
      if (!found) { console.error(`  FAIL ${g.key}: ${g.existingId} not on eval client`); return 1; }
      map[g.key] = g.existingId;
      console.log(`  ok    ${g.key.padEnd(13)} existing on eval client  ${g.existingId}`);
      continue;
    }
    const row = g.empty
      ? { ...g.empty, source: "manual" }
      : Object.fromEntries(Object.entries((await get(`brand_profiles?id=eq.${g.sourceId}&select=${COPY_FIELDS.join(",")}`))[0] ?? {}));
    if (!row.brand_name) { console.error(`  FAIL ${g.key}: source not found`); return 1; }

    const already = onEval.find((b) => b.brand_name === row.brand_name);
    if (already) {
      map[g.key] = already.id;
      console.log(`  reuse ${g.key.padEnd(13)} "${row.brand_name}" already cloned  ${already.id}`);
      continue;
    }
    if (!LIVE) { console.log(`  plan  ${g.key.padEnd(13)} would clone "${row.brand_name}"${g.sourceId ? ` from ${g.sourceId}` : " (empty brand)"}`); continue; }

    const r = await fetch(`${SB}/rest/v1/brand_profiles`, {
      method: "POST", headers: { ...h, Prefer: "return=representation" }, signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ ...row, client_id: EVAL_CLIENT, is_active: true }),
    });
    if (!isMutationOk(r.status)) { console.error(`  FAIL ${g.key}: insert HTTP ${r.status} ${(await r.text()).slice(0, 160)}`); return 1; }
    const created = (await r.json())[0];
    // Proven by re-read, not by the insert's status code.
    const reread = await get(`brand_profiles?id=eq.${created.id}&client_id=eq.${EVAL_CLIENT}&select=id,brand_name`);
    if (reread.length !== 1) { console.error(`  FAIL ${g.key}: clone not found on re-read`); return 1; }
    map[g.key] = created.id;
    console.log(`  clone ${g.key.padEnd(13)} "${row.brand_name}" -> ${created.id}`);
  }

  if (Object.keys(map).length === GOLDEN_BRANDS.length) {
    fs.writeFileSync(OUT, JSON.stringify(map, null, 2) + "\n");
    console.log(`\n  wrote brands.json (${Object.keys(map).length} brands)`);
  } else {
    console.log(`\n  dry run: ${GOLDEN_BRANDS.length - Object.keys(map).length} brand(s) still to clone. Re-run with --live.`);
  }
  return 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error("clone failed:", e.message); process.exit(2); });
