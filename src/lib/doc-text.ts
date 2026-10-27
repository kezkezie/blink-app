import { unzipSync, strFromU8 } from "fflate";

/**
 * Reading the words out of documents, in the browser or on the server (2026-10-27: moved out of
 * lib/assistant/files.ts, which is server-only, for the website studio's "Your own words").
 */

/** The words in a .docx (paragraphs kept, formatting dropped). */
export function docxText(bytes: Uint8Array): string | null {
  try {
    const files = unzipSync(bytes);
    const xml = files["word/document.xml"];
    if (!xml) return null;
    return strFromU8(xml).replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
  } catch { return null; }
}

/** The text of a PDF, pages joined (PDF.js via unpdf, loaded only when a PDF is read). */
export async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number } | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(doc, { mergePages: true });
    return { text: text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), pages: totalPages };
  } catch { return null; }
}

/** The kinds of file "Your own words" reads, by name. */
export function docKind(name: string): "pdf" | "docx" | "text" | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : ["txt", "md", "markdown", "csv"].includes(ext) ? "text" : null;
}
