import { JUDGE_MODEL } from "./config.mjs";

/**
 * Multimodal judge. Pass/fail per dimension with a reason, never one blended
 * score. A pairwise comparison against the previous best is the regression
 * signal, because "better or worse than X" is far more stable than absolute scores.
 */

export const DIMENSIONS = ["intent_match", "brand_fit", "text_quality", "focal_point", "ai_defects", "post_worthy"];

function brandBrief(brand) {
  const colors = [brand.primary_color, brand.secondary_color, brand.accent_color, ...(brand.additional_colors ?? [])].filter(Boolean);
  return [
    `Brand name: "${brand.brand_name}"`,
    brand.industry ? `Industry: ${brand.industry}` : null,
    brand.description ? `About: ${String(brand.description).slice(0, 500)}` : null,
    colors.length ? `Palette: ${colors.join(", ")}` : "Palette: none defined",
    brand.brand_voice ? `Voice: ${String(brand.brand_voice).slice(0, 300)}` : null,
    brand.image_style ? `Image style: ${String(brand.image_style).slice(0, 400)}` : null,
  ].filter(Boolean).join("\n");
}

const RUBRIC = `You are a strict senior creative director reviewing ONE social media image a brand is about to post.
Judge each dimension PASS or FAIL with one short, concrete reason. Be honest: most AI images have at least one real flaw.

intent_match  - PASS if the image clearly does what the request asked.
brand_fit     - PASS if colours, mood and subject plausibly belong to THIS brand (use the brand brief). Generic stock imagery that could be any brand is a FAIL.
text_quality  - PASS if there is no text, OR every visible word is correctly spelled, legible and the brand name (if shown) is exactly right. Gibberish, misspelling, warped letters or an invented brand name/URL is a FAIL.
focal_point   - PASS if there is one clear focal point and the eye knows where to go in under 2 seconds.
ai_defects    - PASS if there are NO obvious AI artefacts (malformed hands/faces, melted objects, impossible geometry, duplicated limbs, smeared text, warped product).
post_worthy   - PASS only if a professional social media manager for this brand would post it as-is, without edits.

Respond with JSON only:
{"intent_match":{"pass":bool,"reason":""},"brand_fit":{...},"text_quality":{...},"focal_point":{...},"ai_defects":{...},"post_worthy":{...},"visible_text":"every word you can read in the image, verbatim"}`;

async function chat(messages, { maxTokens = 700 } = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: JUDGE_MODEL, temperature: 0, max_tokens: maxTokens, response_format: { type: "json_object" }, messages }),
      signal: AbortSignal.timeout(90_000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.ok) {
      const j = await res.json();
      return { json: JSON.parse(j.choices[0].message.content), usage: j.usage };
    }
    // 0 = network drop/timeout, 429 = rate limit, 5xx = server: all transient, retry.
    if (res.status !== 0 && res.status < 500 && res.status !== 429) throw new Error(`judge HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error("judge failed after 3 attempts");
}

export async function judgeImage({ imageUrl, brand, intentText }) {
  const { json, usage } = await chat([
    { role: "system", content: RUBRIC },
    { role: "user", content: [
      { type: "text", text: `BRAND BRIEF\n${brandBrief(brand)}\n\nTHE REQUEST THE USER TYPED\n"${intentText}"` },
      { type: "image_url", image_url: { url: imageUrl } },
    ] },
  ]);
  const dims = {};
  for (const d of DIMENSIONS) {
    const v = json[d];
    // A missing or malformed dimension is a FAIL, never a silent pass.
    dims[d] = v && typeof v.pass === "boolean" ? { pass: v.pass, reason: String(v.reason ?? "") } : { pass: false, reason: "judge returned no verdict" };
  }
  return { dims, visibleText: String(json.visible_text ?? ""), usage };
}

/** Pairwise: is NEW better, the same, or worse than the previous best? */
export async function comparePair({ bestUrl, newUrl, brand, intentText }) {
  const { json } = await chat([
    { role: "system", content: `You compare two candidate social images for the same brand and request. Image A is the current best. Image B is the new candidate. Decide which a professional brand manager would rather post. Respond JSON only: {"verdict":"better"|"same"|"worse","reason":""} where the verdict describes B relative to A.` },
    { role: "user", content: [
      { type: "text", text: `BRAND BRIEF\n${brandBrief(brand)}\n\nREQUEST: "${intentText}"\n\nImage A (current best):` },
      { type: "image_url", image_url: { url: bestUrl } },
      { type: "text", text: "Image B (new candidate):" },
      { type: "image_url", image_url: { url: newUrl } },
    ] },
  ], { maxTokens: 200 });
  const verdict = ["better", "same", "worse"].includes(json.verdict) ? json.verdict : "same";
  return { verdict, reason: String(json.reason ?? "") };
}

/** A case passes only if every deterministic check and every judge dimension passes. */
export function caseVerdict({ deterministic, judge }) {
  const detFails = Object.entries(deterministic)
    .filter(([, v]) => v && typeof v === "object" && "pass" in v && v.pass === false)
    .map(([k]) => k);
  const judgeFails = judge ? DIMENSIONS.filter((d) => !judge.dims[d].pass) : ["judge_missing"];
  return {
    deterministicPass: detFails.length === 0,
    judgePass: judgeFails.length === 0,
    pass: detFails.length === 0 && judgeFails.length === 0,
    failures: [...detFails, ...judgeFails],
  };
}
