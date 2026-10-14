#!/usr/bin/env node
/**
 * 2026-10-14: Kezie's image failed with "This can happen with safety filters, for example when
 * adding real people" when Kie had said "generate task timeout" (524) on its side. Kie reports the
 * reason in `failMsg`/`failCode`, which Extract Data didn't read, so every failure got the safety
 * message. Now: Kie's reason is kept, and the reply says what happened (too slow on their side,
 * a real safety refusal, or Kie's own words). Credits were and are refunded the same way.
 *   node --env-file=.env.local scripts/ops/image-fail-messages-2026-10-14.mjs [--live]
 */
import fs from "node:fs";

const LIVE = process.argv.includes("--live");
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const ID = "LXINWLmOghHWzRgA";
const KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];

const OLD_REASON = "const kieFailReason = result.data?.failReason || result.data?.message || result.data?.error_message || null;";
const NEW_REASON = "// Kie puts the reason in failMsg / failCode (2026-10-14: read neither, so every failure looked like a safety refusal).\nconst kieFailReason = result.data?.failMsg || result.data?.failReason || result.data?.message || result.data?.error_message || null;\nconst kieFailCode = result.data?.failCode || null;";
const OLD_FIELDS = "    kieFailReason,\n";
const NEW_FIELDS = "    kieFailReason,\n    kieFailCode,\n";

const NEW_RESPOND = `={{ JSON.stringify((() => {
  const ex = $('Extract Data').isExecuted ? $('Extract Data').first().json : {};
  const said = String(ex.kieFailReason || '') + ' ' + String(ex.kieFailCode || '');
  const slow = ex.error_reason === 'timeout' || /timeout|timed out|524|busy|overload|queue|capacity|try again later/i.test(said);
  const unsafe = /sensitive|nsfw|safety|policy|prohibit|flagged|violat|moderat/i.test(said);
  const reason = ex.status === 'success' ? 'save_failed' : slow ? 'timeout' : unsafe ? 'safety' : 'generation_failed';
  const message = reason === 'save_failed'
    ? 'The image was made but could not be saved. Your credits have been refunded. Please try again.'
    : reason === 'timeout'
      ? 'The image service was too slow this time (on its side, not your prompt). Your credits have been refunded. Try again in a minute.'
      : reason === 'safety'
        ? "The image service's safety filter refused this one, which can happen with real people, public figures or some products. Your credits have been refunded. Try rephrasing."
        : 'The image service could not make this one' + (ex.kieFailReason ? ' (it said: ' + String(ex.kieFailReason).slice(0, 120) + ')' : '') + '. Your credits have been refunded. Try again.';
  return { success: false, credits_refunded: true, reason, message };
})()) }}`;

const wf = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
const before = JSON.stringify(wf);
const extract = wf.nodes.find((n) => n.name === "Extract Data");
const respond = wf.nodes.find((n) => n.name === "Respond with Gen Error");
console.log(wf.name, "| active:", wf.active);
if (!extract.parameters.jsCode.includes("kieFailCode")) {
  if (!extract.parameters.jsCode.includes(OLD_REASON) || !extract.parameters.jsCode.includes(OLD_FIELDS)) throw new Error("Extract Data isn't as expected; nothing written");
  extract.parameters.jsCode = extract.parameters.jsCode.replace(OLD_REASON, NEW_REASON).replace(OLD_FIELDS, NEW_FIELDS);
}
new Function("$", "$json", "$input", extract.parameters.jsCode);
const key = Object.keys(respond.parameters).find((k) => typeof respond.parameters[k] === "string" && respond.parameters[k].includes("safety filters"));
if (!key && !JSON.stringify(respond.parameters).includes("too slow this time")) throw new Error("Respond with Gen Error isn't as expected; nothing written");
if (key) respond.parameters[key] = NEW_RESPOND;
// The new reply must still be valid JS inside its ={{ }}.
new Function("$", `return ${NEW_RESPOND.replace(/^=\{\{\s*/, "").replace(/\s*\}\}\s*$/, "")}`);
// And it must say the right thing for the real failure of 2026-10-13 22:15 (Kie: timeout, 524).
const reply = (ex) => JSON.parse(new Function("$", `return ${NEW_RESPOND.replace(/^=\{\{\s*/, "").replace(/\s*\}\}\s*$/, "")}`)(() => ({ isExecuted: true, first: () => ({ json: ex }) })));
for (const [ex, want] of [
  [{ status: "failed", kieFailReason: "generate task timeout", kieFailCode: "524", error_reason: "no_image_returned" }, "timeout"],
  [{ status: "failed", kieFailReason: "Your prompt was flagged as sensitive", error_reason: "no_image_returned" }, "safety"],
  [{ status: "failed", kieFailReason: "image_input could not be downloaded", error_reason: "no_image_returned" }, "generation_failed"],
  [{ status: "success" }, "save_failed"],
]) {
  const r = reply(ex);
  console.log(r.reason === want ? "  ✓" : "  ✗", want, "→", r.message.slice(0, 90));
  if (r.reason !== want) throw new Error("wrong reply; nothing written");
}
if (!LIVE) { console.log("DRY-RUN: add --live to write"); process.exit(0); }

fs.mkdirSync("scripts/ops/backups", { recursive: true });
const backup = `scripts/ops/backups/${ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(backup, before);
const res = await fetch(`${N8N}/workflows/${ID}`, { method: "PUT", headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => KEYS.includes(k))), ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
console.log(`backup ${backup}\nPUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 300));
if (!res.ok) process.exit(1);
let after = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
if (after.active && !JSON.stringify(after.activeVersion ?? {}).includes("too slow this time")) {
  const r = await fetch(`${N8N}/workflows/${ID}/activate`, { method: "POST", headers: H });
  console.log("re-activate ->", r.status);
  after = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
}
console.log("active:", after.active, "| running the new replies:", JSON.stringify(after.activeVersion ?? {}).includes("too slow this time"));
