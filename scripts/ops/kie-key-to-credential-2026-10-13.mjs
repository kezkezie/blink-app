#!/usr/bin/env node
/**
 * Kie key rotation (Kezie, 2026-10-13): the Kie API key was typed into 17 HTTP nodes across 7 n8n
 * workflows. This creates one n8n Header Auth credential with the NEW key and points every Kie
 * node at it (including Video V3, which used the older "BlinkSpot Kie API" credential), removing
 * the typed-in Authorization headers. No key is ever printed.
 *   node --env-file=.env.local --env-file="<Kezie-OS>/.env" scripts/ops/kie-key-to-credential-2026-10-13.mjs [--live]
 * Needs KIE_API_KEY (new) and KIE_API_TOKEN (old, to find it) in the environment.
 */
import fs from "node:fs";

const LIVE = process.argv.includes("--live");
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const NEW = process.env.KIE_API_KEY || "";
const OLD = process.env.KIE_API_TOKEN || "";
const OLD_CRED = "enGA9mzecnybtdag"; // "BlinkSpot Kie API" (old key)
const CRED_NAME = "BlinkSpot Kie API (2026-10-13)";
const KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];
if (!/^[0-9a-f]{32}$/i.test(NEW) || !/^[0-9a-f]{32}$/i.test(OLD)) throw new Error("KIE_API_KEY (new) and KIE_API_TOKEN (old) must both be set");
if (NEW === OLD) throw new Error("the new key is the same as the old one");

let cursor = "", all = [];
do { const r = await (await fetch(`${N8N}/workflows?limit=100${cursor ? `&cursor=${cursor}` : ""}`, { headers: H })).json(); all.push(...(r.data ?? [])); cursor = r.nextCursor; } while (cursor);

const isKieNode = (n) => {
  if (!n.type.endsWith(".httpRequest")) return false;
  const p = JSON.stringify(n.parameters ?? {});
  return p.includes(OLD) || n.credentials?.httpHeaderAuth?.id === OLD_CRED;
};
const targets = all.map((w) => ({ w, nodes: (w.nodes ?? []).filter(isKieNode) })).filter((t) => t.nodes.length);
for (const t of targets) console.log(`${t.w.id} ${t.w.active ? "ACTIVE" : "off"} ${t.w.name}: ${t.nodes.map((n) => n.name).join(", ")}`);
// Anything else still holding the old key (e.g. a Code node) is reported, not touched.
for (const w of all) for (const n of w.nodes ?? []) if (!isKieNode(n) && JSON.stringify(n.parameters ?? {}).includes(OLD)) console.log(`  ! old key in a non-HTTP node: ${w.name} / ${n.name}`);
console.log(`${targets.reduce((s, t) => s + t.nodes.length, 0)} nodes in ${targets.length} workflows`);
if (!LIVE) { console.log("DRY-RUN: add --live to create the credential and update the workflows"); process.exit(0); }

// 1. The credential (reused if a previous run made it).
const list = await (await fetch(`${N8N}/credentials?limit=250`, { headers: H })).json().catch(() => ({}));
let cred = (list.data ?? []).find((c) => c.name === CRED_NAME);
if (!cred) {
  const r = await fetch(`${N8N}/credentials`, { method: "POST", headers: H, body: JSON.stringify({ name: CRED_NAME, type: "httpHeaderAuth", data: { name: "Authorization", value: `Bearer ${NEW}` } }) });
  if (!r.ok) throw new Error(`credential create failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  cred = await r.json();
}
console.log(`credential ${cred.id} "${CRED_NAME}" ready`);

// 2. Every Kie node uses it; typed-in Authorization headers go.
fs.mkdirSync("scripts/ops/backups", { recursive: true });
for (const { w } of targets) {
  const full = await (await fetch(`${N8N}/workflows/${w.id}`, { headers: H })).json();
  const before = JSON.stringify(full);
  let changed = 0;
  for (const n of full.nodes) {
    if (!isKieNode(n)) continue;
    const hp = n.parameters.headerParameters?.parameters;
    if (Array.isArray(hp)) {
      n.parameters.headerParameters.parameters = hp.filter((h) => String(h.name).toLowerCase() !== "authorization");
      if (!n.parameters.headerParameters.parameters.length) { delete n.parameters.headerParameters; n.parameters.sendHeaders = false; }
    }
    n.parameters.authentication = "genericCredentialType";
    n.parameters.genericAuthType = "httpHeaderAuth";
    n.credentials = { ...(n.credentials ?? {}), httpHeaderAuth: { id: cred.id, name: CRED_NAME } };
    changed++;
  }
  if (JSON.stringify(full.nodes).includes(OLD)) throw new Error(`${w.name}: the old key is still in the nodes after patching; nothing written`);
  const backup = `scripts/ops/backups/${w.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backup, before);
  const res = await fetch(`${N8N}/workflows/${w.id}`, { method: "PUT", headers: H, body: JSON.stringify({ name: full.name, nodes: full.nodes, connections: full.connections, settings: Object.fromEntries(Object.entries(full.settings ?? {}).filter(([k]) => KEYS.includes(k))), ...(full.staticData ? { staticData: full.staticData } : {}) }) });
  let after = await (await fetch(`${N8N}/workflows/${w.id}`, { headers: H })).json();
  // n8n keeps a copy of the live (published) version; make sure that one changed too.
  if (after.active && JSON.stringify(after.activeVersion ?? {}).includes(OLD)) {
    await fetch(`${N8N}/workflows/${w.id}/activate`, { method: "POST", headers: H });
    after = await (await fetch(`${N8N}/workflows/${w.id}`, { headers: H })).json();
  }
  const ok = res.ok && !JSON.stringify(after).includes(OLD) && after.nodes.filter(isKieNode).length === 0 && after.active === w.active;
  console.log(`${ok ? "✓" : "✗"} ${w.name}: ${changed} nodes, PUT ${res.status}, active ${after.active}, backup ${backup}`);
}
