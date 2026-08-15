#!/usr/bin/env node
/**
 * Provider capability DRIFT DETECTOR.
 *
 * Compares the machine-readable Replicate model schema against the explicit,
 * human-reviewed entries in `src/lib/video-model-registry.ts`.
 *
 * DESIGN RULE — this script is a detector, never an applier:
 *   - It NEVER writes to the registry, the UI, n8n, or any config.
 *   - It NEVER changes billing or UI behaviour at runtime.
 *   - Runtime behaviour depends only on the reviewed registry, so a provider
 *     silently changing its schema cannot silently change what we sell or charge.
 *   - On drift it exits non-zero and prints exactly what differs, so a human
 *     decides whether to update the registry.
 *
 * Why this exists: on 2026-08-06 Sora's duration capability was transcribed from
 * prose ("typically 4 to 12 seconds") as a continuous range. The real schema is a
 * discrete enum [4, 8, 12]. The UI therefore offered 5 and 10, and every Sora
 * generation returned HTTP 422 after charging the user (found live 2026-08-07).
 * A schema comparison would have caught it before release.
 *
 * Usage:  REPLICATE_API_TOKEN=... node scripts/audit-provider-capabilities.mjs
 * Exit 0 = no drift, 1 = drift found, 2 = could not audit.
 */
import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.REPLICATE_API_TOKEN;
const REGISTRY = path.join(process.cwd(), "src/lib/video-model-registry.ts");

/** Replicate-hosted models we audit, mapped to their registry key. */
const REPLICATE_MODELS = [
  { registryKey: "replicate:openai/sora-2", owner: "openai", name: "sora-2", durationField: "seconds" },
  { registryKey: "replicate:prunaai/p-video", owner: "prunaai", name: "p-video", durationField: "duration" },
];

/**
 * Kie-hosted models (Kling, Seedance, Gemini Omni) are NOT audited here: Kie
 * publishes no documented machine-readable input schema per model. Their
 * capabilities remain human-reviewed from the vendor docs, and Gemini capability
 * verification is explicitly PENDING — it must not be inferred from Replicate.
 */
const UNAUDITABLE = [
  { registryKey: "kling-3.0/video", reason: "Kie: no documented machine-readable input schema" },
  { registryKey: "bytedance/seedance-2", reason: "Kie: no documented machine-readable input schema" },
  { registryKey: "bytedance/seedance-2-fast", reason: "Kie: no documented machine-readable input schema" },
  { registryKey: "gemini-omni-video", reason: "Kie: no documented machine-readable input schema — VERIFICATION PENDING" },
];

function readRegistryEntry(source, key) {
  const block = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":\\s*\\{([\\s\\S]*?)\\n  \\},`).exec(source);
  if (!block) return null;
  const body = block[1];
  const grab = (field) => {
    const m = new RegExp(`${field}:\\s*(\\[[^\\]]*\\]|[A-Za-z_][A-Za-z_0-9]*)`).exec(body);
    return m ? m[1].trim() : null;
  };
  const nums = (raw) => (raw && raw.startsWith("[") ? JSON.parse(raw) : null);
  // Named aspect constants declared in the registry. Kept in sync deliberately:
  // if one is renamed or edited here without the registry, the audit reports
  // drift instead of silently passing.
  const NAMED_ASPECTS = {
    STANDARD_ASPECTS: ["16:9", "9:16", "1:1", "21:9"],
    PRUNA_ASPECTS: ["16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "1:1"],
  };
  const strs = (raw) => {
    if (!raw) return null;
    if (NAMED_ASPECTS[raw]) return NAMED_ASPECTS[raw];
    if (raw.startsWith("[")) return JSON.parse(raw.replace(/'/g, '"'));
    return null;
  };
  // A model may declare its OFFERED durations as a discrete list or as a
  // whole-second range (Pruna). Expanded here so the "every offered duration is
  // renderable" check works identically for both shapes.
  const uiRange = nums(grab("uiDurationRange"));
  const durations = uiRange
    ? Array.from({ length: uiRange[1] - uiRange[0] + 1 }, (_, i) => String(uiRange[0] + i))
    : strs(grab("durations"));
  return {
    durations,
    uiDurationRange: uiRange,
    providerDurationRange: nums(grab("providerDurationRange")),
    providerDurationValues: nums(grab("providerDurationValues")),
    aspectRatios: strs(grab("aspectRatios")),
  };
}

/** Resolve an OpenAPI property that may be an inline enum or an allOf $ref. */
function resolveProperty(schemas, prop) {
  if (!prop) return null;
  if (prop.enum) return { enum: prop.enum, minimum: prop.minimum, maximum: prop.maximum };
  const ref = prop.allOf?.[0]?.$ref;
  if (ref) {
    const target = schemas[ref.split("/").pop()];
    if (target) return { enum: target.enum, minimum: target.minimum, maximum: target.maximum };
  }
  return { enum: null, minimum: prop.minimum, maximum: prop.maximum };
}

async function fetchModel(owner, name) {
  const res = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${owner}/${name}`);
  return res.json();
}

const drift = [];
const evidence = [];

async function main() {
  if (!TOKEN) {
    console.error("REPLICATE_API_TOKEN not set — cannot audit.");
    return 2;
  }
  const source = fs.readFileSync(REGISTRY, "utf8");

  for (const m of REPLICATE_MODELS) {
    const reg = readRegistryEntry(source, m.registryKey);
    if (!reg) {
      drift.push(`${m.registryKey}: not found in the registry`);
      continue;
    }
    const model = await fetchModel(m.owner, m.name);
    const lv = model.latest_version ?? {};
    const schemas = lv.openapi_schema?.components?.schemas ?? {};
    const input = schemas.Input?.properties ?? {};

    evidence.push({
      model: `${model.owner}/${model.name}`,
      version: lv.id,
      schemaCreatedAt: lv.created_at,
      auditedAt: new Date().toISOString(),
    });

    const dur = resolveProperty(schemas, input[m.durationField]);
    const asp = resolveProperty(schemas, input.aspect_ratio);

    console.log(`\n── ${m.registryKey}`);
    console.log(`   schema: model ${model.owner}/${model.name} version ${String(lv.id).slice(0, 16)} created ${lv.created_at}`);
    console.log(`   provider ${m.durationField}: enum=${JSON.stringify(dur?.enum)} min=${dur?.minimum} max=${dur?.maximum}`);
    const uiShape = reg.uiDurationRange
      ? `range ${reg.uiDurationRange[0]}..${reg.uiDurationRange[1]} (${reg.durations?.length ?? 0} whole seconds)`
      : JSON.stringify(reg.durations);
    console.log(`   registry: values=${JSON.stringify(reg.providerDurationValues)} range=${JSON.stringify(reg.providerDurationRange)} UI=${uiShape}`);

    // ── duration shape must match: discrete enum vs continuous range ──
    if (dur?.enum) {
      if (!reg.providerDurationValues) {
        drift.push(`${m.registryKey}: provider publishes a DISCRETE enum ${JSON.stringify(dur.enum)} but the registry declares a range ${JSON.stringify(reg.providerDurationRange)}`);
      } else if (JSON.stringify(reg.providerDurationValues) !== JSON.stringify(dur.enum)) {
        drift.push(`${m.registryKey}: providerDurationValues ${JSON.stringify(reg.providerDurationValues)} != schema enum ${JSON.stringify(dur.enum)}`);
      }
    } else if (dur && (dur.minimum != null || dur.maximum != null)) {
      if (!reg.providerDurationRange) {
        drift.push(`${m.registryKey}: provider publishes a RANGE ${dur.minimum}..${dur.maximum} but the registry declares discrete values ${JSON.stringify(reg.providerDurationValues)}`);
      } else if (reg.providerDurationRange[0] !== dur.minimum || reg.providerDurationRange[1] !== dur.maximum) {
        drift.push(`${m.registryKey}: providerDurationRange ${JSON.stringify(reg.providerDurationRange)} != schema ${dur.minimum}..${dur.maximum}`);
      }
    }

    // ── every OFFERED duration must be renderable ──
    for (const offered of reg.durations ?? []) {
      const n = Number(offered);
      const ok = dur?.enum ? dur.enum.includes(n) : n >= (dur?.minimum ?? -Infinity) && n <= (dur?.maximum ?? Infinity);
      if (!ok) drift.push(`${m.registryKey}: UI offers ${offered}s which the provider REJECTS (schema ${dur?.enum ? JSON.stringify(dur.enum) : `${dur?.minimum}..${dur?.maximum}`})`);
    }

    // ── aspect ratios: only flag values that cannot map to a provider value ──
    if (asp?.enum) {
      console.log(`   provider aspect_ratio enum: ${JSON.stringify(asp.enum)}`);
      const SORA_MAP = { "9:16": "portrait", "3:4": "portrait", "1:1": "square", "16:9": "landscape", "21:9": "landscape", "4:3": "landscape" };
      for (const ar of reg.aspectRatios ?? []) {
        const sent = m.registryKey.includes("sora") ? SORA_MAP[ar] : ar;
        if (sent && !asp.enum.includes(sent)) {
          drift.push(`${m.registryKey}: registry offers aspect ${ar} -> sends "${sent}", not in provider enum ${JSON.stringify(asp.enum)}`);
        }
      }
    }
  }

  console.log("\n── not machine-auditable (human-reviewed only) ──");
  for (const u of UNAUDITABLE) console.log(`   ${u.registryKey}: ${u.reason}`);

  console.log("\n── evidence ──");
  for (const e of evidence) console.log(`   ${e.model} | version ${e.version} | schema created ${e.schemaCreatedAt} | audited ${e.auditedAt}`);

  if (drift.length) {
    console.error(`\nCAPABILITY DRIFT — ${drift.length} finding(s). This script does NOT auto-fix; a human must review and update the registry:`);
    for (const d of drift) console.error(`   ! ${d}`);
    return 1;
  }
  console.log("\nNo drift: the reviewed registry agrees with every audited provider schema.");
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error("audit failed:", e.message);
  process.exit(2);
});
