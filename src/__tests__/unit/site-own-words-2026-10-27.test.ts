import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { MAX_OWN_WORDS, codeUserPrompt, ownWordsPrompt, type BrandForCode } from "@/lib/sites/code";
import { docKind, docxText } from "@/lib/doc-text";

/**
 * The website studio's "Your own words" (Kezie, 2026-10-27: "a way on how we can be able to post our
 * written personal written content for the website... in combination with the what it's for input").
 */
const brand = {
  name: "Kisumu Crust", brief: "A bakery in Kisumu.", theme: { primary: "#C2410C", secondary: "#1C1917", accent: "#FBBF24", background: "#FFF7ED", headingFont: "Fraunces", bodyFont: "Inter" },
  contact: {}, products: [], images: [], logoUrl: null,
} as unknown as BrandForCode;

describe("the owner's own words", () => {
  it("go to the page writer as written, between the brand facts and the brief", () => {
    const words = "Our story\nWe started baking in my mum's kitchen in 2019.\n\nMenu\nSourdough loaf, KES 450";
    const text = codeUserPrompt({ brand, look: "minimal", brief: "Home page", words });
    expect(text).toContain(`"""\n${words}\n"""`);
    expect(text).toMatch(/Use these words as written: keep their wording, names, prices/);
    expect(text.indexOf("Sourdough loaf, KES 450")).toBeLessThan(text.indexOf("The owner's brief: Home page"));
    expect(codeUserPrompt({ brand, look: "minimal", words: "   " })).not.toContain("The owner's own words");
    expect(ownWordsPrompt("x".repeat(MAX_OWN_WORDS + 50))).toContain("x".repeat(MAX_OWN_WORDS) + '\n"""');
  });

  it("can come from a Word file or a text file, read by type", () => {
    const doc = zipSync({ "word/document.xml": strToU8('<w:document><w:body><w:p><w:r><w:t>Our story</w:t></w:r></w:p><w:p><w:r><w:t>Bread &amp; cake</w:t></w:r></w:p></w:body></w:document>') });
    expect(docxText(doc)).toBe("Our story\nBread & cake");
    expect(docKind("Menu.PDF")).toBe("pdf");
    expect(docKind("story.docx")).toBe("docx");
    expect(docKind("notes.md")).toBe("text");
    expect(docKind("photo.jpg")).toBeNull();
  });
});
