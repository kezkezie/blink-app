import { describe, expect, it } from "vitest";
import { slugify, validateSections, validateSpec, whatsappLink, type SiteSpec } from "@/lib/sites/spec";

const images = [{ id: "p_1", url: "https://x/a.jpg" }, { id: "p_2", url: "https://x/b.jpg" }, { id: "p_3", url: "https://x/c.jpg" }];
const products = [{ id: "prod-1", name: "Platter", price: 1800, currency: "KES" }];
const base = {
  brand: { name: "Mama Njeri" }, images, products, contact: { whatsapp: "+254700000000" },
  theme: { style: "soft" as const, mode: "light" as const, primary: "#111111", secondary: "#EEEEEE", accent: "#E8913A", background: "#FAF8F4", headingFont: "DM Sans", bodyFont: "Inter" },
};

describe("landing page spec", () => {
  it("keeps only known sections, sized, pointing at the brand's own images and products", () => {
    const out = validateSections([
      { type: "hero", variant: "weird", headline: "A".repeat(200), imageId: "p_1" },
      { type: "hero", headline: "second hero is dropped" },
      { type: "script", html: "<script>alert(1)</script>" },
      { type: "gallery", imageIds: ["p_1", "p_2", "evil", "p_1"] },
      { type: "products", productIds: ["prod-1", "made-up"] },
      { type: "faq", items: [{ q: "Hours?", a: "" }, { q: "Delivery?", a: "Yes, in Westlands." }] },
      { type: "about", title: "Our story", body: "We cook." , imageId: "https://evil.example/x.png" },
    ], images, products);
    expect(out.map((s) => s.type)).toEqual(["hero", "gallery", "products", "faq", "about"]);
    expect(out[0]).toMatchObject({ variant: "split", imageId: "p_1" });
    expect((out[0] as { headline: string }).headline.length).toBe(90);
    expect(out[1]).toMatchObject({ imageIds: ["p_1", "p_2"] });
    expect(out[2]).toMatchObject({ productIds: ["prod-1"] });
    expect((out[3] as { items: unknown[] }).items).toHaveLength(1);
    expect((out[4] as { imageId?: string }).imageId).toBeUndefined();
  });

  it("validateSpec keeps the server's images, products and contact, whatever the browser sends", () => {
    const spec = validateSpec({ sections: [{ type: "hero", headline: "Hi" }], images: [{ id: "x", url: "https://evil" }], contact: { whatsapp: "+1 666" }, theme: { primary: "red", accent: "#123456" } } as unknown as SiteSpec, base);
    expect(spec.images).toBe(images);
    expect(spec.contact).toEqual({ whatsapp: "+254700000000" });
    expect(spec.theme.primary).toBe("#111111");
    expect(spec.theme.accent).toBe("#123456");
    expect(validateSpec({ sections: [] }, base).sections[0]).toMatchObject({ type: "hero", headline: "Mama Njeri" });
  });

  it("makes clean addresses and WhatsApp links", () => {
    expect(slugify("Mama Njeri's Kitchen & Café!")).toBe("mama-njeri-s-kitchen-and-cafe");
    expect(whatsappLink("+254 712 345 678", "Hi, I'd like the Platter")).toBe("https://wa.me/254712345678?text=Hi%2C%20I'd%20like%20the%20Platter");
    expect(whatsappLink("12", "x")).toBeNull();
  });
});

describe("placing the brand's images", () => {
  it("fills the hero, about and a gallery from the AI's ranking, skipping unknown ids", async () => {
    const { placeImages } = await import("@/lib/sites/spec");
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const out = placeImages([
      { type: "hero", variant: "type", headline: "Hi" },
      { type: "about", title: "Us", body: "We cook." },
      { type: "contact", title: "Talk" },
    ], ["evil", "a", "b", "c", "d", "e", "f", "g"], ids);
    expect(out[0]).toMatchObject({ type: "hero", variant: "split", imageId: "a" });
    expect(out[1]).toMatchObject({ type: "about", imageId: "b" });
    expect(out[2]).toMatchObject({ type: "gallery", imageIds: ["c", "d", "e", "f", "g"] });
    expect(out[3].type).toBe("contact");
  });
  it("keeps what the AI already placed and adds no gallery with too few images", async () => {
    const { placeImages } = await import("@/lib/sites/spec");
    const out = placeImages([{ type: "hero", variant: "full", headline: "Hi", imageId: "z" }], ["z", "y"], ["z", "y"]);
    expect(out).toEqual([{ type: "hero", variant: "full", headline: "Hi", imageId: "z" }]);
  });
});
