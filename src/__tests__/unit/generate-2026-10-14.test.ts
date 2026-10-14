import { describe, expect, it } from "vitest";
import { buildGeneratePrompt, lookDirection, lookForVibes, routerTopic } from "@/lib/generate-prompt";
import { researchBrief, validateResearch, jsonFrom } from "@/lib/brand-research";
import { creditsByBrand } from "@/lib/credits-by-brand";
import { parseConcepts, normalizeConceptsForFormats } from "@/lib/assisted-creation";

/** Generate, 2026-10-14: industry research, Plain, words/logo/products as given, credits by brand. */
const RESEARCH = validateResearch({
  industry: "Crypto wallets",
  peers: [{ name: "Coinbase", why: "calm, trustworthy" }, { name: "Phantom", why: "friendly gradients" }],
  visualLanguage: "One dominant brand colour on a dark base. Big geometric sans headlines. Simplified product UI, never stock coins.",
  formats: [
    { name: "Fee receipt close-up", layout: "Large centred UI card, headline above, logo small in a corner.", imagery: "A transfer confirmation with the fee paid in USDT.", text: "One number-led line.", peer: "Coinbase" },
    { name: "Before/After fee flow", layout: "Split card, old way left, new way right.", imagery: "Two send screens.", text: "6 to 9 words.", peer: "Alchemy" },
  ],
  avoid: ["Rocket and moon hype", "Stock coins and padlocks"],
  sources: ["https://example.com/a", "not a url"],
})!;

describe("industry research", () => {
  it("keeps a usable playbook, drops bad sources, refuses thin ones", () => {
    expect(RESEARCH.formats).toHaveLength(2);
    expect(RESEARCH.sources).toEqual(["https://example.com/a"]);
    expect(validateResearch({ peers: [{ name: "A" }], formats: [], visualLanguage: "x" })).toBeNull();
    expect(jsonFrom('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("goes into the ideas prompt with the peers and formats", () => {
    const brief = researchBrief(RESEARCH);
    expect(brief).toMatch(/Coinbase, Phantom/);
    expect(brief).toMatch(/Fee receipt close-up/);
  });
});

describe("the image prompt", () => {
  const base = { brief: "Announce that fees can be paid in USDT.", colours: ["#6BBD51", "#231F20"], font: "Clash Display", logo: false, products: 0 };

  it("Plain: the words as written, no style, no industry look, no colours", () => {
    const p = buildGeneratePrompt({ ...base, look: "plain", research: RESEARCH, basedOn: "Fee receipt close-up" });
    expect(p.split("\n")[0]).toBe(base.brief);
    expect(p).not.toMatch(/Reference:|industry|palette|Layout to follow/i);
  });

  it("a researched idea follows its format, the industry look and the brand's colours and font", () => {
    const p = buildGeneratePrompt({ ...base, look: "poster", research: RESEARCH, basedOn: "Fee receipt close-up" });
    expect(p).toMatch(/Layout to follow: Large centred UI card/);
    expect(p).toMatch(/best posts in this industry: One dominant brand colour/);
    expect(p).toMatch(/#6BBD51, #231F20/);
    expect(p).toMatch(/typeface like Clash Display/);
    expect(p).toMatch(/Avoid: Rocket and moon hype/);
  });

  it("exact words, the logo as image 1 and products after it", () => {
    const p = buildGeneratePrompt({ ...base, look: "studio", words: "Gas in USDT", logo: true, products: 2 });
    expect(p).toMatch(/Write exactly this text on the image, spelled exactly as given, and no other words: "Gas in USDT"/);
    expect(p).toMatch(/Image 1 is our logo/);
    expect(p).toMatch(/Images 2 to 3 are our products/);
    // The product-shot look normally says "no text, no logos": not when the image carries them.
    expect(p).not.toMatch(/NO TEXT/);
    expect(lookDirection("studio", false)).toMatch(/NO TEXT/);
  });

  it("the router never sees words that make it stamp a logo in by itself", () => {
    expect(routerTopic("Put our logo and brand mark on a mug")).toBe("Put our emblem and emblem on a mug");
  });

  it("the brand's photo vibe picks the starting look", () => {
    expect(lookForVibes(["Dark & moody"])).toBe("cinematic");
    expect(lookForVibes(["Unknown", "Real people"])).toBe("lifestyle");
    expect(lookForVibes([])).toBe("poster");
  });
});

describe("ideas carry their look and format", () => {
  it("kept when valid, dropped when not; ideas aren't cut at 220 any more", () => {
    const idea = "A ".repeat(150) + "end.";
    const raw = { concepts: [1, 2, 3].map((n) => ({ title: `T${n}`, idea, angle: "a", format: "image", look: n === 1 ? "poster" : "nonsense", basedOn: "Fee receipt close-up" })) };
    const parsed = parseConcepts(raw)!;
    expect(parsed[0].look).toBe("poster");
    expect(parsed[1].look).toBeUndefined();
    expect(parsed[0].basedOn).toBe("Fee receipt close-up");
    const normal = normalizeConceptsForFormats(raw, ["image"], "x").concepts;
    expect(normal[0].idea.length).toBeGreaterThan(220);
    expect(normal[0].look).toBe("poster");
  });
});

describe("credits by brand", () => {
  it("charges count, their refunds come off, purchases and welcome credits don't", () => {
    const rows = creditsByBrand([
      { amount: -18, brand_id: "a", operation: "debit", description: "AI Image Generation (18 credits)" },
      { amount: -18, brand_id: "a", operation: "debit", description: "AI Image Generation (18 credits)" },
      { amount: 18, brand_id: "a", operation: "credit", description: "Refund: AI Generation Failed or Timed Out" },
      { amount: -205, brand_id: "b", operation: "debit", description: "Dynamic Video Generation [vid:x]" },
      { amount: -4, brand_id: null, operation: "debit", description: "Ask BlinkSpot (Balanced)" },
      { amount: 1500, brand_id: null, operation: "purchase", description: "Starter plan credits (monthly)" },
      { amount: 100, brand_id: null, operation: "signup_bonus", description: "Welcome credits (one time)" },
    ]);
    expect(rows).toEqual([{ brandId: "b", used: 205 }, { brandId: "a", used: 18 }, { brandId: null, used: 4 }]);
  });
});
