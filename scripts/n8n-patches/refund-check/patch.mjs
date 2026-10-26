// The two nodes that close the stopped-picture double refund in "Blink - 3.3. Image Generator"
// (Kezie approved 2026-10-26): before n8n refunds a failed picture, it checks the post still exists.
// A stopped post is gone and the app's stop already settled it, so n8n skips its refund.
//   node --env-file=.env.local refund-check.mjs test            -> temporary workflow, run both cases, delete it
//   node --env-file=.env.local refund-check.mjs patch <backup>  -> patch the live workflow (from that backup)
import fs from "node:fs";
import crypto from "node:crypto";
const base = new URL(process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE).origin;
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "content-type": "application/json", accept: "application/json" };
const api = async (method, path, body) => { const r = await fetch(`${base}/api/v1${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, json: (() => { try { return JSON.parse(t); } catch { return t; } })() }; };
const SUPA = "https://hzkufspjozkgmloznkvp.supabase.co";
const CRED = { httpHeaderAuth: { id: "PeNMU0YyS2J8x71a", name: "BlinkSpot Supabase Secret" } };

function newNodes([x, y]) {
  return [
    {
      id: crypto.randomUUID(), name: "Post Still There?", type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [x, y],
      alwaysOutputData: true, onError: "continueRegularOutput", credentials: CRED,
      notes: "Stop (2026-10-26): a stopped post is gone and the app's stop already settled its credits, so the refund below is skipped for it.",
      parameters: {
        method: "GET",
        url: `=${SUPA}/rest/v1/content?select=id&id=eq.{{ $('Parse Inputs & Calculate Cost').first().json.postId || '00000000-0000-0000-0000-000000000000' }}`,
        authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
        sendHeaders: true, headerParameters: { parameters: [{ name: "Accept", value: "application/json" }] },
        options: {},
      },
    },
    {
      id: crypto.randomUUID(), name: "Refund Unless Stopped", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [x + 208, y],
      parameters: {
        conditions: {
          options: {},
          conditions: [{
            id: crypto.randomUUID(),
            // Refund when there was no post (in-request pictures), the post is still there, or the check itself failed.
            leftValue: "={{ !$('Parse Inputs & Calculate Cost').first().json.postId || !!$json.id || !!$json.error }}",
            rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true },
          }],
          combinator: "and",
        },
        options: {},
      },
    },
  ];
}

if (process.argv[2] === "test") {
  const path = `refund-check-test-${Date.now()}`;
  const nodes = [
    { id: crypto.randomUUID(), name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], webhookId: crypto.randomUUID(), parameters: { httpMethod: "POST", path, responseMode: "lastNode", options: {} } },
    { id: crypto.randomUUID(), name: "Parse Inputs & Calculate Cost", type: "n8n-nodes-base.code", typeVersion: 2, position: [208, 0], parameters: { jsCode: "return [{ json: { postId: $input.first().json.body.post_id || null } }];" } },
    ...newNodes([416, 0]),
    { id: crypto.randomUUID(), name: "Refund", type: "n8n-nodes-base.code", typeVersion: 2, position: [832, -100], parameters: { jsCode: "return [{ json: { branch: 'refund' } }];" } },
    { id: crypto.randomUUID(), name: "Skip", type: "n8n-nodes-base.code", typeVersion: 2, position: [832, 100], parameters: { jsCode: "return [{ json: { branch: 'skip' } }];" } },
  ];
  const connections = {
    Webhook: { main: [[{ node: "Parse Inputs & Calculate Cost", type: "main", index: 0 }]] },
    "Parse Inputs & Calculate Cost": { main: [[{ node: "Post Still There?", type: "main", index: 0 }]] },
    "Post Still There?": { main: [[{ node: "Refund Unless Stopped", type: "main", index: 0 }]] },
    "Refund Unless Stopped": { main: [[{ node: "Refund", type: "main", index: 0 }], [{ node: "Skip", type: "main", index: 0 }]] },
  };
  const made = await api("POST", "/workflows", { name: `TEMP refund check test (delete me) ${Date.now()}`, nodes, connections, settings: { executionOrder: "v1" } });
  if (made.status !== 200) { console.log("create failed", made.status, JSON.stringify(made.json).slice(0, 300)); process.exit(1); }
  const id = made.json.id;
  try {
    const act = await api("POST", `/workflows/${id}/activate`);
    console.log("activate", act.status);
    await new Promise((r) => setTimeout(r, 2000));
    // A post that exists (any real one), one that doesn't (stopped), and none at all.
    const { createClient } = await import("/Users/freddykezie/Documents/blink/blink-app/node_modules/@supabase/supabase-js/dist/index.mjs").catch(() => import("@supabase/supabase-js"));
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: real } = await sb.from("content").select("id").limit(1).single();
    for (const [label, post] of [["post exists", real.id], ["post gone (stopped)", crypto.randomUUID()], ["no post", null]]) {
      const r = await fetch(`${base}/webhook/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(post ? { post_id: post } : {}) });
      console.log(label.padEnd(22), "->", r.status, (await r.text()).slice(0, 120));
    }
  } finally {
    await api("POST", `/workflows/${id}/deactivate`);
    const del = await api("DELETE", `/workflows/${id}`);
    console.log("temporary workflow deleted", del.status);
  }
}

if (process.argv[2] === "patch") {
  const w = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
  if (w.nodes.some((n) => n.name === "Post Still There?")) { console.log("already patched"); process.exit(0); }
  const refund = w.nodes.find((n) => n.name === "Refund Credits");
  const [a, b] = newNodes([refund.position[0] - 416, refund.position[1] + 192]);
  w.nodes.push(a, b);
  const c = w.connections;
  // Everything that went into the refund goes through the check first.
  let rewired = 0;
  for (const outs of Object.values(c)) for (const lists of Object.values(outs)) for (const list of lists) for (const o of list ?? []) if (o.node === "Refund Credits") { o.node = "Post Still There?"; rewired++; }
  c["Post Still There?"] = { main: [[{ node: "Refund Unless Stopped", type: "main", index: 0 }]] };
  c["Refund Unless Stopped"] = { main: [[{ node: "Refund Credits", type: "main", index: 0 }], [{ node: "Respond with Gen Error", type: "main", index: 0 }]] };
  if (rewired !== 2) { console.log("expected 2 links into Refund Credits, found", rewired, "- not patching"); process.exit(1); }
  const { executionOrder, callerPolicy, saveDataSuccessExecution, saveDataErrorExecution, saveManualExecutions, saveExecutionProgress, errorWorkflow, timezone } = w.settings ?? {};
  const settings = Object.fromEntries(Object.entries({ executionOrder, callerPolicy, saveDataSuccessExecution, saveDataErrorExecution, saveManualExecutions, saveExecutionProgress, errorWorkflow, timezone }).filter(([, v]) => v !== undefined));
  const put = await api("PUT", `/workflows/${w.id}`, { name: w.name, nodes: w.nodes, connections: c, settings, staticData: w.staticData ?? undefined });
  console.log("put", put.status, typeof put.json === "object" ? `versionId ${put.json.versionId} active ${put.json.active} nodes ${put.json.nodes?.length}` : String(put.json).slice(0, 300));
}
