import { describe, expect, it } from "vitest";
import { DESIGN_SYSTEM, designUserPrompt, mustKeep, validateDesign } from "@/lib/design-pass";
import { buildGeneratePrompt } from "@/lib/generate-prompt";
import { SENSITIVE, softenForAi } from "@/lib/ai-safe-text";

/** The design pass before Best and Fast renders, and softened wording for medical brands (2026-10-14/15). */
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("design pass", () => {
  it("names the three poster zones, so the third isn't left as empty space", () => {
    expect(DESIGN_SYSTEM).toMatch(/ZONE 1/);
    expect(DESIGN_SYSTEM).toMatch(/ZONE 2/);
    expect(DESIGN_SYSTEM).toMatch(/ZONE 3/);
    expect(DESIGN_SYSTEM).toMatch(/never a dead empty third/);
    expect(DESIGN_SYSTEM).toMatch(/never white on off-white/);
  });

  it("sends brand, industry, look and requirements", () => {
    const p = designUserPrompt({ look: "poster", requirements: "Make it pop.", brandName: "Gasless Cash", industry: "Crypto wallets" });
    expect(p).toBe("Brand: Gasless Cash (Crypto wallets)\nLook: poster\nRequirements:\nMake it pop.");
    expect(designUserPrompt({ look: "studio", requirements: "x", brandName: "Acme" })).toMatch(/^Brand: Acme\nLook: studio/);
  });

  it("accepts a real designed prompt and trims the note", () => {
    const d = validateDesign({ prompt: `  ${words(60)}  `, notes: "Three-zone poster:\n headline   top-left" });
    expect(d).toEqual({ prompt: words(60), notes: "Three-zone poster: headline top-left" });
    expect(validateDesign({ prompt: words(60) })?.notes).toBe("");
  });

  it("refuses a short, oversized or missing prompt (Generate then sends the requirements)", () => {
    expect(validateDesign({ prompt: words(20), notes: "x" })).toBeNull();
    expect(validateDesign({ prompt: `${words(60)} ${"a".repeat(3200)}` })).toBeNull();
    expect(validateDesign({ notes: "x" })).toBeNull();
    expect(validateDesign(null)).toBeNull();
    expect(validateDesign("a prompt")).toBeNull();
  });

  it("keeps the exact words and the logo and product roles word for word", () => {
    const req = buildGeneratePrompt({ brief: "Announce USDT gas.", look: "poster", colours: ["#6BBD51"], font: "Clash Display", words: "Pay gas in USDT", logo: true, products: 2 });
    const keep = mustKeep(req).split("\n");
    expect(keep).toHaveLength(3);
    expect(keep[0]).toBe('Write exactly this text on the image, spelled exactly as given, and no other words: "Pay gas in USDT".');
    expect(keep[1]).toMatch(/^Images 2 to 3 are our products/);
    expect(keep[2]).toMatch(/^Image 1 is our logo/);
    expect(mustKeep(buildGeneratePrompt({ brief: "A calm product shot.", look: "studio", logo: false, products: 1 }))).toMatch(/^Image 1 is our product/);
    expect(mustKeep("Just a brief.\nUse the brand's colours.")).toBe("");
  });
});

describe("medical and intimate brands", () => {
  it("swaps the anatomy words image models refuse for clinical ones", () => {
    const blush = "Silicone breast implants with an integrated nipple, for women after mastectomy. Nipple-sparing options.";
    const soft = softenForAi(blush);
    expect(soft).toBe("Silicone reconstruction implant with an integrated natural-looking detail, for women after mastectomy. tissue-sparing options.");
    expect(soft).not.toMatch(/nipple|breast/i);
  });

  it("keeps breast cancer as a name and handles plurals and other body words", () => {
    expect(softenForAi("Breast cancer awareness month")).toBe("Breast cancer awareness month");
    expect(softenForAi("breasts and areolas")).toBe("chest and natural-looking detail");
    expect(softenForAi("genital health, nude tones")).toBe("intimate health, unclothed tones");
    expect(softenForAi("vaginal dryness")).toBe("intimate health dryness");
  });

  it("leaves ordinary text and empty values alone", () => {
    expect(softenForAi("Pay gas in USDT")).toBe("Pay gas in USDT");
    expect(softenForAi(null)).toBeNull();
    expect(softenForAi(undefined)).toBeUndefined();
    expect(softenForAi("")).toBe("");
    expect(SENSITIVE.test("A crypto wallet")).toBe(false);
    expect(SENSITIVE.test("lingerie launch")).toBe(true);
  });
});
