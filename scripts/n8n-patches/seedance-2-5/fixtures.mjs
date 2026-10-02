// Runs the REAL node code (original vs patched) against fixtures with a mocked n8n `$`.
// node fixtures.mjs <dir containing parse_inputs.js, build_payload.js and *.patched.js>
import fs from "node:fs"; import assert from "node:assert/strict";
const dir = process.argv[2];
const load = (f) => fs.readFileSync(`${dir}/${f}`, "utf8");
const run = (code, nodes) => {
  const $ = (name) => ({ first: () => ({ json: nodes[name] }), isExecuted: name in nodes });
  return new Function("$", code)($)[0].json;
};
const pipeline = (parse, build, body) => {
  const p = run(parse, { "Webhook: Generate Video": { body } });
  if (!p.isValid) return { parse: p };
  return { parse: p, build: run(build, { "Parse Inputs & Calculate Cost": p }) };
};
const ORIG = [load("parse_inputs.js"), load("build_payload.js")];
const NEW = [load("parse_inputs.patched.js"), load("build_payload.patched.js")];
const base = { client_id: "c", user_prompt: "slow push-in over button mushroom beds", ai_enhance: false, aspect_ratio: "16:9" };
const IMG1 = "https://res.cloudinary.com/x/a.png", IMG2 = "https://res.cloudinary.com/x/b.png";
let n = 0; const ok = (m) => console.log(`  ok ${++n} ${m}`);

// 1. regression: every existing model produces the identical cost + payload
for (const model of ["bytedance/seedance-2", "bytedance/seedance-2-fast", "kling-3.0/video", "replicate:prunaai/p-video", "auto"]) {
  for (const extra of [{}, { primary_image_url: IMG1, secondary_image_url: IMG2 }]) {
    const body = { ...base, ai_model_override: model, duration: "10", ...extra };
    assert.deepEqual(pipeline(...NEW, body), pipeline(...ORIG, body));
  }
}
ok("seedance-2, seedance-2-fast, kling, pruna, auto: cost and payload byte-identical to live");

// 2. seedance 2.5 text-only
let r = pipeline(...NEW, { ...base, ai_model_override: "bytedance/seedance-2-5", duration: "30" });
assert.equal(r.parse.isValid, true); assert.equal(r.parse.totalCost, 30 * 64);
assert.equal(r.build.payload.model, "bytedance/seedance-2-5"); assert.equal(r.build.payload.input.duration, 30);
assert.equal(r.build.provider, "kie"); assert.equal(r.build.payload.input.first_frame_url, undefined);
ok("2.5 text-only 30s: valid, billed 1920, kie payload, no frames");

// 3. first + last frame are temporal, no reference arrays
r = pipeline(...NEW, { ...base, ai_model_override: "bytedance/seedance-2-5", duration: "10", primary_image_url: IMG1, secondary_image_url: IMG2 });
assert.equal(r.build.payload.input.first_frame_url, IMG1); assert.equal(r.build.payload.input.last_frame_url, IMG2);
assert.equal(r.build.payload.input.reference_image_urls, undefined);
ok("2.5 frames: first_frame_url + last_frame_url, never reference_image_urls");

// 4. last frame alone is never sent (docs: requires first_frame_url)
r = pipeline(...NEW, { ...base, ai_model_override: "bytedance/seedance-2-5", duration: "10", secondary_image_url: IMG2 });
assert.equal(r.build.payload.input.last_frame_url, undefined); assert.equal(r.build.payload.input.first_frame_url, undefined);
ok("2.5 end frame without start frame is not sent");

// 5. bounds refused before deduction
for (const d of ["3", "31", "4.5"]) {
  r = pipeline(...NEW, { ...base, ai_model_override: "bytedance/seedance-2-5", duration: d });
  assert.equal(r.parse.isValid, false, d);
}
r = pipeline(...NEW, { ...base, ai_model_override: "bytedance/seedance-2-5", duration: "10", aspect_ratio: "4:5" });
assert.equal(r.parse.isValid, false);
ok("2.5 rejects 3s, 31s, 4.5s and 4:5 before billing");

// 6. seedance 2 still capped at 15 (the 2.5 rule must not leak into it)
r = pipeline(...NEW, { ...base, ai_model_override: "bytedance/seedance-2", duration: "20" });
assert.equal(r.parse.isValid, false);
ok("seedance-2 still rejects 20s");

// 7. frame + reference audio refused upfront (mutually exclusive at Kie)
r = pipeline(...NEW, { ...base, ai_model_override: "bytedance/seedance-2-5", duration: "10", primary_image_url: IMG1, scene_data: { audio: { audio_url: "https://x/a.mp3" } } });
assert.equal(r.parse.isValid, false);
ok("2.5 start frame + audio track refused before deduction");
console.log(`${n}/${n} fixtures pass`);
