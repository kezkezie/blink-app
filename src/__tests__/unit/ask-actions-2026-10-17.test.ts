import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: {} }));
import { brandPatch } from "@/lib/assistant/actions";

/** Ask BlinkSpot fills the brand for the user (2026-10-17): what it is allowed to write, cleaned. */
describe("brand text into Brand page fields", () => {
  it("maps what the user said onto the brand and its DNA", () => {
    const p = brandPatch({
      name: "Mama Njeri Kitchen", description: "Home-style Kenyan food in Kilimani.", industry: "restaurant and café", audience: "Office workers",
      location: "Kilimani, Nairobi", whatsapp: "+254 712 345 678", email: "hi@njeri.co.ke", tone: ["Warm", "Down-to-earth", "Warm"],
      colors: { primary: "#e4572e", accent: "orange" }, fonts: { heading: "Fraunces" }, website: "njeri.co.ke", socials: ["https://instagram.com/njeri", "not a link"],
      products: [{ name: "Pilau with beef", price: 650, currency: "kes" }, { name: "" }, { name: "Chapati", price: -5 }],
    });
    expect(p.core).toMatchObject({ brand_name: "Mama Njeri Kitchen", company_name: "Mama Njeri Kitchen", industry: "Restaurant & café", primary_color: "#E4572E", primary_font: "Fraunces", website_url: "https://njeri.co.ke", social_urls: "https://instagram.com/njeri", tone_keywords: ["Warm", "Down-to-earth"] });
    expect(p.core.accent_color).toBeUndefined();
    expect(p.dna).toMatchObject({ audience: "Office workers", location: "Kilimani, Nairobi", whatsapp: "+254 712 345 678", email: "hi@njeri.co.ke" });
    expect(p.products).toEqual([{ name: "Pilau with beef", price: 650, currency: "KES", description: null }, { name: "Chapati", price: null, currency: null, description: null }]);
  });

  it("drops what isn't valid and writes nothing for empty input", () => {
    const p = brandPatch({ email: "not-an-email", whatsapp: "call me", website: "javascript:alert(1)", colors: { primary: "#12" } });
    expect(p.core).toEqual({});
    expect(p.dna).toEqual({});
    expect(brandPatch({}).products).toEqual([]);
  });
});
