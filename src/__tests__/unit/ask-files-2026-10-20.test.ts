import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: {} }));
import { fileRefs } from "@/lib/assistant/request";
import { docxText } from "@/lib/assistant/files";

/** Ask reads files (2026-10-20): our own storage only, known types only, Word read as text. */
describe("Ask files", () => {
  const base = "https://x.supabase.co/storage/v1/object/public/assets/images/c1";
  it("keeps files from our storage with a known type", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    const refs = fileRefs([
      { url: `${base}/askdoc_1.pdf`, name: "Brand deck.pdf" },
      { url: `${base}/askdoc_2.docx`, name: "Menu <script>.docx" },
      { url: `${base}/askdoc_3.csv`, name: "prices.csv" },
      { url: `${base}/askdoc_4.exe`, name: "x.exe" },
      { url: "https://evil.example/a.pdf", name: "a.pdf" },
      { url: `${base}/../../secret.pdf`, name: "s.pdf" },
    ]);
    expect(refs.map((r) => [r.kind, r.name])).toEqual([["pdf", "Brand deck.pdf"], ["docx", "Menu script.docx"], ["text", "prices.csv"]]);
  });

  it("reads the words in a Word file", () => {
    const xml = `<?xml version="1.0"?><w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Mama Njeri Kitchen</w:t></w:r></w:p><w:p><w:r><w:t>Pilau &amp; beef</w:t></w:r><w:r><w:tab/><w:t>KES 650</w:t></w:r></w:p></w:body></w:document>`;
    const docx = zipSync({ "word/document.xml": strToU8(xml), "[Content_Types].xml": strToU8("<Types/>") });
    expect(docxText(docx)).toBe("Mama Njeri Kitchen\nPilau & beef\tKES 650");
    expect(docxText(strToU8("not a zip"))).toBeNull();
  });
});
