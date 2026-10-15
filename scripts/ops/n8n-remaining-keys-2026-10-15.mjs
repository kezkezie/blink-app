#!/usr/bin/env node
/**
 * 2026-10-15, approved by Kezie ("move the remaining three hardcoded keys into n8n credentials"):
 *  - Brand Visual Suggester (uzmQ00O8amPDDbhu): its error handler's Code node fetched the failed run
 *    with an n8n API key written into the code. A new HTTP Request node "Fetch Failed Execution"
 *    now fetches it with the credential "BlinkSpot n8n API (2026-10-15)" (the key in .env.local),
 *    and the Code node reads that result. Same refund logic; a failed fetch still refunds nothing
 *    and reports why, as before.
 *  - Auto-Poster (uylJ85qQfTZzTLJ3) "Post via Blotato": Authorization header → "BlinkSpot Blotato API (2026-10-15)".
 *  - youtube video automation test (lw4TzJMJetC4VOND) "create video1", "HTTP Request2": x-api-key →
 *    "json2video API (2026-10-15)".
 * Header credentials keep the exact header name and value the node had. Nothing is called on
 * Blotato (that would post to social media).
 *   node --env-file=.env.local scripts/ops/n8n-remaining-keys-2026-10-15.mjs [--live]
 */
import fs from "node:fs";

const LIVE = process.argv.includes("--live");
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];
const SECRET = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+|Bearer\s+(?!\{\{)[A-Za-z0-9_\-.]{20,}|r8_[A-Za-z0-9]{20,}|sk-(proj-)?[A-Za-z0-9_-]{20,}/;
const VISUAL = "uzmQ00O8amPDDbhu", POSTER = "uylJ85qQfTZzTLJ3", YT = "lw4TzJMJetC4VOND";

const get = async (id) => (await fetch(`${N8N}/workflows/${id}`, { headers: H })).json();
const wfs = { [VISUAL]: await get(VISUAL), [POSTER]: await get(POSTER), [YT]: await get(YT) };
const before = Object.fromEntries(Object.entries(wfs).map(([id, w]) => [id, JSON.stringify(w)]));
const node = (wf, name) => wf.nodes.find((n) => n.name === name) ?? (() => { throw new Error(`${wf.name}: ${name} missing; nothing written`); })();
const header = (n, name) => (n.parameters.headerParameters?.parameters ?? []).find((p) => p.name.toLowerCase() === name.toLowerCase());

// 1. Visual Suggester error handler.
const vs = wfs[VISUAL];
const extract = node(vs, "Extract Error Context");
const trigger = node(vs, "Error Trigger");
const FETCH = "Fetch Failed Execution";
const NEW_CODE = `// The failed run's data comes from "${FETCH}" (n8n API credential; 2026-10-15 the key was written in this code).
const trigger = $('Error Trigger').first().json;
const executionId = trigger?.execution?.id;
let clientId = '00000000-0000-0000-0000-000000000000';
let errorMsg = 'Unknown';
try { errorMsg = trigger?.execution?.error?.message || trigger?.execution?.lastNodeExecuted || 'Unknown'; } catch(e) {}
const execData = $json;
if (executionId && execData && !execData.error) {
  const runData = execData?.data?.resultData?.runData || {};
  for (const name of ['Parse Input', 'Parse Inputs', 'Parse Inputs & Calculate Cost']) {
    const node = runData[name];
    if (node?.[0]?.data?.main?.[0]?.[0]?.json) { clientId = String(node[0].data.main[0][0].json.clientId || clientId); break; }
  }
  if (clientId === '00000000-0000-0000-0000-000000000000') {
    for (const name of Object.keys(runData).filter(n => n.toLowerCase().includes('webhook'))) {
      const node = runData[name];
      if (node?.[0]?.data?.main?.[0]?.[0]?.json) { const body = node[0].data.main[0][0].json?.body || node[0].data.main[0][0].json; clientId = String(body.client_id || body.clientId || clientId); break; }
    }
  }
} else if (execData?.error) {
  errorMsg = \`fetch failed: \${execData.error.message || execData.error}\`;
}
return [{ json: { clientId, canRefund: clientId !== '00000000-0000-0000-0000-000000000000', errorMessage: errorMsg } }];`;
const alreadyMoved = vs.nodes.some((n) => n.name === FETCH);
if (!alreadyMoved) {
  if (!SECRET.test(extract.parameters.jsCode) || !extract.parameters.jsCode.includes("/api/v1/executions/")) throw new Error("Extract Error Context isn't as expected; nothing written");
  if (JSON.stringify(vs.connections["Error Trigger"]?.main) !== JSON.stringify([[{ node: "Extract Error Context", type: "main", index: 0 }]])) throw new Error("Error Trigger wiring isn't as expected; nothing written");
}
new Function("$", "$json", `return (async () => { ${NEW_CODE} })`);
// The new code must find the client from a failed run the way the old one did.
const sample = { data: { resultData: { runData: { "Parse Inputs & Calculate Cost": [{ data: { main: [[{ json: { clientId: "c-1" } }]] } }] } } } };
const runCode = (json) => new Function("$", "$json", `return (async () => { ${NEW_CODE} })()`)(() => ({ first: () => ({ json: { execution: { id: "9", error: { message: "boom" } } } }) }), json);
const okRun = (await runCode(sample))[0].json, badRun = (await runCode({ error: { message: "401" } }))[0].json;
if (okRun.clientId !== "c-1" || !okRun.canRefund || badRun.canRefund || !badRun.errorMessage.includes("401")) throw new Error("new error-handler code gives the wrong answer; nothing written");
console.log("✓ Visual Suggester: new handler finds the client and reports a failed fetch");

// 2 + 3. Header keys.
const blotato = node(wfs[POSTER], "Post via Blotato");
const yt1 = node(wfs[YT], "create video1"), yt2 = node(wfs[YT], "HTTP Request2");
const bAuth = header(blotato, "Authorization"), y1 = header(yt1, "x-api-key"), y2 = header(yt2, "x-api-key");
for (const [label, h] of [["Blotato Authorization", bAuth], ["json2video x-api-key (create video1)", y1], ["json2video x-api-key (HTTP Request2)", y2]]) {
  console.log(`${label}: ${h ? (String(h.value).startsWith("=") ? "an expression (not a literal key)" : "literal key present") : "already gone"}`);
}
if (y1 && y2 && y1.value !== y2.value) throw new Error("the two json2video keys differ; nothing written");
// The n8n key for the credential must work for reading executions.
const probe = await fetch(`${N8N}/executions?limit=1`, { headers: { "X-N8N-API-KEY": process.env.N8N_API_KEY } });
if (!probe.ok) throw new Error(`n8n key from .env.local answers ${probe.status}; nothing written`);
console.log("✓ n8n key for the credential reads executions");

if (!LIVE) { console.log("DRY-RUN: add --live to write"); process.exit(0); }

async function credential(name, headerName, value) {
  const res = await fetch(`${N8N}/credentials`, { method: "POST", headers: H, body: JSON.stringify({ name, type: "httpHeaderAuth", data: { name: headerName, value } }) });
  if (!res.ok) throw new Error(`credential ${name} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  const c = await res.json();
  console.log("credential created:", c.name, c.id);
  return { id: c.id, name: c.name };
}
const useCred = (n, cred, headerName) => {
  n.parameters.authentication = "genericCredentialType";
  n.parameters.genericAuthType = "httpHeaderAuth";
  n.credentials = { ...(n.credentials ?? {}), httpHeaderAuth: cred };
  n.parameters.headerParameters.parameters = n.parameters.headerParameters.parameters.filter((p) => p.name.toLowerCase() !== headerName.toLowerCase());
  if (!n.parameters.headerParameters.parameters.length) { n.parameters.sendHeaders = false; delete n.parameters.headerParameters; }
};

if (!alreadyMoved) {
  const cred = await credential("BlinkSpot n8n API (2026-10-15)", "X-N8N-API-KEY", process.env.N8N_API_KEY);
  vs.nodes.push({
    id: crypto.randomUUID(), name: FETCH, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2,
    position: [trigger.position[0] + 220, trigger.position[1]],
    onError: "continueRegularOutput",
    parameters: {
      url: "={{ 'https://n8n.srv1166077.hstgr.cloud/api/v1/executions/' + $json.execution.id + '?includeData=true' }}",
      authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", options: {},
    },
    credentials: { httpHeaderAuth: cred },
  });
  extract.position = [extract.position[0] + 220, extract.position[1]];
  extract.parameters.jsCode = NEW_CODE;
  vs.connections["Error Trigger"] = { main: [[{ node: FETCH, type: "main", index: 0 }]] };
  vs.connections[FETCH] = { main: [[{ node: "Extract Error Context", type: "main", index: 0 }]] };
}
if (bAuth && !String(bAuth.value).startsWith("=")) useCred(blotato, await credential("BlinkSpot Blotato API (2026-10-15)", bAuth.name, bAuth.value), "Authorization");
if (y1 && !String(y1.value).startsWith("=")) {
  const cred = await credential("json2video API (2026-10-15)", y1.name, y1.value);
  useCred(yt1, cred, "x-api-key");
  if (y2) useCred(yt2, cred, "x-api-key");
}
for (const [id, wf] of Object.entries(wfs)) {
  const s = JSON.stringify(wf.nodes.map((n) => n.parameters));
  if (SECRET.test(s) || /"x-api-key","value":"[^=]/i.test(s)) throw new Error(`${wf.name} still holds a key; nothing written for it or after it`);
  fs.mkdirSync("scripts/ops/backups", { recursive: true });
  const backup = `scripts/ops/backups/${id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backup, before[id]);
  const res = await fetch(`${N8N}/workflows/${id}`, { method: "PUT", headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => KEYS.includes(k))), ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
  console.log(`${wf.name}: backup ${backup} | PUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 300));
  if (!res.ok) process.exit(1);
  let after = await get(id);
  const clean = (w) => !SECRET.test(JSON.stringify((w.activeVersion?.nodes ?? w.nodes).map((n) => n.parameters)));
  if (after.active && !clean(after)) {
    const r = await fetch(`${N8N}/workflows/${id}/activate`, { method: "POST", headers: H });
    console.log("  re-activate ->", r.status);
    after = await get(id);
  }
  console.log(`  active: ${after.active} | live version clean: ${clean(after)}`);
}
