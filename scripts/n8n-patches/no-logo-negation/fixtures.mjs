// Runs the REAL Build Payload Router code, original vs patched, with a mocked n8n `$` and `$json`.
import fs from "node:fs"; import assert from "node:assert/strict";
const dir = process.argv[2];
const ORIG = fs.readFileSync(`${dir}/router.js`, "utf8"), NEW = fs.readFileSync(`${dir}/router.patched.js`, "utf8");
const LOGO = "https://res.cloudinary.com/x/logo.png";
const run = (code, input) => {
  const $ = () => ({ first: () => ({ json: input }) });
  const out = new Function("$", "$json", code)($, { brand_name: "Nuf Farms", logo_url: LOGO });
  const s = JSON.stringify(out);
  return { s, logo: s.includes(LOGO), instr: s.includes("Naturally integrate the provided brand logo") };
};
const base = { style: "photo", referenceImageUrls: ["https://res.cloudinary.com/x/product.png"], brandName: "Nuf Farms", numImages: 1, kieModel: "nano-banana-2", aspectRatio: "4:5" };
const cases = [
  ["No text, no lettering, no logos, nothing printed.", false, true],
  ["Clean shot of mushrooms without any logos.", false, true],
  ["Don't put our brand mark on the carton.", false, true],
  ["Product photo, add our logo on the box.", true, false],
  ["No text, add our logo on the box.", true, false],
  ["Mushrooms on slate, soft light.", false, false],
];
let n = 0;
for (const [topic, want, changed] of cases) {
  for (const viaAssembled of [false, true]) for (const mode of ["generate", "product_drop"]) {
    const input = { ...base, mode, topic, ...(viaAssembled ? { assembledPrompt: topic } : {}) };
    const o = run(ORIG, input), p = run(NEW, input);
    assert.equal(p.instr, want, `${topic} [${mode}] instruction`);
    if (mode === "product_drop") assert.equal(p.logo, want, `${topic} [${mode}] logo reference image`);
    if (!changed) assert.equal(p.s, o.s, `${topic}: must be byte-identical to live`);
    n++;
  }
}
const b = { ...base, mode: "product_drop", style: "brand", topic: "no logos please" };
assert.equal(run(NEW, b).logo, true); assert.equal(run(NEW, b).s, run(ORIG, b).s); n++;
console.log(`${n}/${n} fixtures pass (negated mentions off, requests and Brand style unchanged, all else byte-identical)`);
