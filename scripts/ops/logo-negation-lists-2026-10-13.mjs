#!/usr/bin/env node
/**
 * 2026-10-13: the image router added the brand's logo to "Remove every word, letter, number and
 * logo from this image" (the Editor's clean plate), because its negation check stopped at the first
 * comma. Mama Njeri Kitchen's name got painted onto a NUF FARMS mushroom; in a test, the "logo"
 * image came back instead of the photo. The same hit people's own edits ("remove the text, price
 * and logo"). Now a mention of the logo is a request unless the nearest word before it in the same
 * sentence negates it ("no", "remove", "without"...), and a later "add / use / keep / with" wins
 * back ("no text, add our logo" still asks). Nothing else in the workflow changes.
 *   node --env-file=.env.local scripts/ops/logo-negation-lists-2026-10-13.mjs [--live]
 */
import fs from "node:fs";

const LIVE = process.argv.includes("--live");
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const ID = "LXINWLmOghHWzRgA";
const NODE = "Build Payload Router";
const KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];

const OLD = `const mentionsLogo = /\\b(logos?|brand ?marks?)\\b/.test(topicLc);
const negatesLogo = /\\b(no|without|not|never|don'?t|do not|remove|exclude|avoid|hide)\\b[^.,;!?\\n]{0,40}\\b(logos?|brand ?marks?)\\b/.test(topicLc);
const wantsLogo = style === 'brand' || (mentionsLogo && !negatesLogo);`;

const NEW = `// 2026-10-13: lists count. "Remove every word, letter, number and logo" is a negation (the old check
// stopped at the first comma and stamped the logo in); "no text, add our logo" still asks for it:
// the nearest negating or asking word before the mention, in its own sentence, decides.
const LOGO_RE = /\\b(logos?|brand ?marks?)\\b/g;
const NEG_RE = /\\b(no|without|not|never|don'?t|do not|remove|removing|erase|delete|exclude|avoid|hide|strip|get rid of|take out)\\b/g;
const ASK_RE = /\\b(add|adding|use|using|include|including|put|place|show|feature|insert|stamp|print|with|keep)\\b/g;
const lastAt = (re, s) => { let m, at = -1; re.lastIndex = 0; while ((m = re.exec(s))) at = m.index; return at; };
let mentionsLogo = false, asksForLogo = false;
for (const m of topicLc.matchAll(LOGO_RE)) {
    mentionsLogo = true;
    const start = Math.max(topicLc.lastIndexOf('.', m.index), topicLc.lastIndexOf('!', m.index), topicLc.lastIndexOf('?', m.index), topicLc.lastIndexOf('\\n', m.index)) + 1;
    const before = topicLc.slice(start, m.index);
    const neg = lastAt(NEG_RE, before), ask = lastAt(ASK_RE, before);
    if (neg < 0 || ask > neg) asksForLogo = true;
}
const negatesLogo = mentionsLogo && !asksForLogo;
const wantsLogo = style === 'brand' || asksForLogo;`;

// The new rule, checked on real phrasings before anything is written.
const decide = new Function("topicLc", "style", `${NEW}\nreturn wantsLogo;`);
const CASES = [
  ["remove every word, letter, number and logo from this image. fill those areas so they match.", false],
  ["no text, add our logo", true],
  ["add our logo to the bottle", true],
  ["no text, no logos", false],
  ["a clean poster with the logo at the top", true],
  ["make it brighter. remove the logo", false],
  ["remove the text, price and logo", false],
  ["logo reveal for our launch", true],
  ["remove the background and put the logo on a white table", true],
  ["erase every piece of writing from this image: all words, letters, numbers, emblems and printed graphic marks.", false],
];
for (const [topic, want] of CASES) {
  const got = decide(topic, "studio");
  console.log(got === want ? "  ✓" : "  ✗", JSON.stringify(topic.slice(0, 70)), "->", got);
  if (got !== want) throw new Error("the new rule gets a case wrong; nothing written");
}
if (decide("anything", "brand") !== true) throw new Error("style 'brand' must always add the logo");

const wf = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
const before = JSON.stringify(wf);
const node = wf.nodes.find((n) => n.name === NODE);
let code = node.parameters.jsCode;
console.log(wf.name, "| active:", wf.active);
if (!code.includes("asksForLogo")) {
  if (!code.includes(OLD)) throw new Error("the old logo check wasn't found as expected; nothing written");
  code = code.replace(OLD, NEW);
  node.parameters.jsCode = code;
}
new Function("$input", "$", "$json", "$node", code); // the whole node must still parse
console.log("  ✓ Build Payload Router parses with the new rule");
if (!LIVE) { console.log("DRY-RUN: add --live to write"); process.exit(0); }

fs.mkdirSync("scripts/ops/backups", { recursive: true });
const backup = `scripts/ops/backups/${ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(backup, before);
const res = await fetch(`${N8N}/workflows/${ID}`, { method: "PUT", headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => KEYS.includes(k))), ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
console.log(`backup ${backup}\nPUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 300));
if (!res.ok) process.exit(1);
let after = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
// n8n runs its stored active version; make sure that is the new one.
if (after.active && !JSON.stringify(after.activeVersion ?? {}).includes("asksForLogo")) {
  const r = await fetch(`${N8N}/workflows/${ID}/activate`, { method: "POST", headers: H });
  console.log("re-activate ->", r.status);
  after = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
}
console.log("active:", after.active, "| saved:", after.nodes.find((n) => n.name === NODE).parameters.jsCode.includes("asksForLogo"), "| running:", JSON.stringify(after.activeVersion ?? {}).includes("asksForLogo"));
