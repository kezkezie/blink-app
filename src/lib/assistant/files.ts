import { unzipSync, strFromU8 } from "fflate";
import { safeFetchBytes } from "@/lib/safe-fetch";
import type { AgentMessage } from "./agent";
import type { AskFile } from "./request";

/**
 * Files in Ask BlinkSpot (2026-10-20): a brand deck, a menu, a price list, a brief. PDFs go to
 * Claude as documents (it reads the text and the pages); Word files are unzipped and read as text;
 * text, CSV and JSON are read as they are. Only the two latest messages with files carry them;
 * older ones are named so the chat doesn't resend everything. Server only.
 */
const MAX_TEXT = 120_000;
const MAX_PDF = 15_000_000;

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

async function block(f: AskFile): Promise<object | null> {
  if (f.kind === "pdf") {
    const got = await safeFetchBytes(f.url, { maxBytes: MAX_PDF, timeoutMs: 20_000 });
    if (!got.ok || String.fromCharCode(...got.bytes.slice(0, 4)) !== "%PDF") return null;
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(got.bytes).toString("base64") }, title: f.name };
  }
  const got = await safeFetchBytes(f.url, { maxBytes: f.kind === "docx" ? 10_000_000 : 2_000_000, timeoutMs: 15_000 });
  if (!got.ok) return null;
  const text = f.kind === "docx" ? docxText(got.bytes) : new TextDecoder().decode(got.bytes);
  if (!text?.trim()) return null;
  return { type: "text", text: `<file name="${f.name}">\n${text.slice(0, MAX_TEXT)}${text.length > MAX_TEXT ? "\n[cut: the file is longer]" : ""}\n</file>` };
}

export async function withFiles(messages: AgentMessage[], files: AskFile[][], clientId: string, keepLast = 2): Promise<AgentMessage[]> {
  const mine = (f: AskFile) => new URL(f.url).pathname.startsWith(`/storage/v1/object/public/assets/images/${clientId}/`);
  const out = [...messages];
  let shown = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    const docs = (files[i] ?? []).filter(mine);
    if (!docs.length || out[i].role !== "user") continue;
    const names = docs.map((d) => d.name).join(", ");
    const existing = typeof out[i].content === "string" ? [{ type: "text", text: out[i].content as string }] : (out[i].content as object[]);
    if (shown >= keepLast) { out[i] = { ...out[i], content: [...existing, { type: "text", text: `(They attached ${names} here earlier.)` }] as AgentMessage["content"] }; continue; }
    shown++;
    const blocks = (await Promise.all(docs.map((d) => block(d).catch(() => null)))).filter(Boolean) as object[];
    const unread = docs.length - blocks.length;
    out[i] = { ...out[i], content: [...blocks, ...existing, ...(unread ? [{ type: "text", text: `(${unread} attached file${unread === 1 ? "" : "s"} couldn't be opened.)` }] : [])] as AgentMessage["content"] };
  }
  return out;
}
