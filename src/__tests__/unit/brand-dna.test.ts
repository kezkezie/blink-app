import { describe, expect, it } from "vitest";
import { brandBrief, brandStrength, cleanDna } from "@/lib/brand-dna";

describe("brand DNA v2", () => {
  it("keeps only known, well-formed fields from the browser", () => {
    const d = cleanDna({ audience: "  office workers  ", formality: 140, emoji: "tons", whatsapp: "+254 712 345 678", phone: "call me", email: "not-an-email", usps: ["a", "b", "c", "d", 5], hacker: "<script>", role: "agency" });
    expect(d).toEqual({ audience: "office workers", formality: 100, whatsapp: "+254 712 345 678", usps: ["a", "b", "c"], role: "agency" });
  });

  it("scores what's there and lists what's missing, most useful first", () => {
    const empty = brandStrength({ brand_name: "X" }, {}, []);
    expect(empty.score).toBe(0);
    expect(empty.missing[0]).toBe("Say what you do in a sentence");
    const full = brandStrength(
      { description: "We cook East African food and deliver it.", logo_url: "x", primary_color: "#111111", tone_keywords: ["Warm"], website_url: "a.com", uploaded_assets: ["u"] },
      { audience: "offices", location: "Nairobi", usps: ["fresh"], languages: ["English"] },
      [{ name: "Platter" }],
    );
    expect(full.score).toBe(100);
    expect(full.missing).toEqual([]);
  });

  it("writes a brief the AI can use, with the only allowed contacts", () => {
    const b = brandBrief(
      { brand_name: "Mama Njeri", description: "Home food", tone_keywords: ["Warm"], primary_color: "#E8913A" },
      { audience: "Office workers", location: "Nairobi", whatsapp: "+254700000000", languages: ["English", "Swahili"], formality: 20, cta: "Order on WhatsApp" },
      [{ name: "Family platter", price: 1800, currency: "KES" }],
    );
    expect(b).toContain("Who it's for: Office workers");
    expect(b).toContain("Family platter (KES 1800)");
    expect(b).toContain("casual and friendly");
    expect(b).toContain("Contact (the only details allowed): WhatsApp +254700000000");
    expect(brandBrief({ brand_name: "X", description: "y".repeat(5000) }, {}, [], 300).length).toBeLessThanOrEqual(300);
  });
});
