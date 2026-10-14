/**
 * Industry research for a brand (Kezie, 2026-10-14: "look at similar apps in the crypto realm,
 * MetaMask, Coinbase, PancakeSwap, see how they make their posts, then make our own with our
 * assets and font"). Claude searches the web for how leading brands in the same industry design
 * their social posts and returns a short playbook: the peers, their visual language and 4-6 post
 * formats. Generate's ideas follow those formats; the image prompt uses them with the brand's own
 * colours, fonts, logo and products. Pure parts here (validation, prompt text); the call lives in
 * the API route.
 */
export type ResearchFormat = { name: string; layout: string; imagery: string; text: string; peer: string };
export type BrandResearch = {
  industry: string;
  peers: Array<{ name: string; why: string }>;
  visualLanguage: string;
  formats: ResearchFormat[];
  avoid: string[];
  sources: string[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/** Checks what the model returned; null when it isn't a usable playbook. */
export function validateResearch(raw: unknown): BrandResearch | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const rawPeers = o.peers ?? o.brands ?? o.competitors;
  const peers = (Array.isArray(rawPeers) ? rawPeers : []).map((p) => {
    const x = (typeof p === "string" ? { name: p } : p ?? {}) as Record<string, unknown>;
    const name = str(x.name, 60);
    return name ? { name, why: str(x.why, 200) } : null;
  }).filter((p): p is { name: string; why: string } => !!p).slice(0, 6);
  // The model sometimes names fields a little differently; accept the obvious variants.
  const rawFormats = o.formats ?? o.postFormats ?? o.post_formats;
  const formats = (Array.isArray(rawFormats) ? rawFormats : []).map((f) => {
    const x = (f ?? {}) as Record<string, unknown>;
    const name = str(x.name ?? x.title, 80);
    const layout = str(x.layout ?? x.composition ?? x.structure ?? x.description, 400);
    return name && layout ? { name, layout, imagery: str(x.imagery ?? x.visual ?? x.image, 400), text: str(x.text ?? x.copy ?? x.words, 300), peer: str(x.peer ?? x.example, 60) } : null;
  }).filter((f): f is ResearchFormat => !!f).slice(0, 6);
  const visualLanguage = str(o.visualLanguage ?? o.visual_language ?? o.look ?? o.style, 900);
  if (peers.length < 2 || formats.length < 2 || !visualLanguage) return null;
  const sources = list(o.sources, 12, 300).filter((u) => /^https?:\/\//.test(u));
  return { industry: str(o.industry, 120), peers, visualLanguage, formats, avoid: list(o.avoid, 6, 160), sources };
}

export const RESEARCH_SYSTEM = `You are a social media art director researching a brand's industry. Use web search to find how 3 to 5 leading, well-designed brands in the SAME industry and market design their social media post graphics (Instagram, X, LinkedIn): layouts, colour use, typography, imagery and motifs, how much text, what they show (product UI, people, objects, data). Also look at strong post designs for this industry on Pinterest and Behance, as reference only, never to copy. Prefer what you can actually see described in sources over guesses.
Then write a short playbook this brand can follow with its own colours, fonts, logo and products. Never tell it to copy another brand's logo, name, mascot or exact wording.
Reply with JSON only, no markdown:
{"industry":"the industry in a few words","peers":[{"name":"","why":"what they do well in their posts"}],"visualLanguage":"2-4 sentences: the shared look of strong posts in this industry (palette approach, type style, imagery, mood)","formats":[{"name":"short name for a post format","layout":"where things go: headline, visual, logo, CTA","imagery":"what the picture shows, concretely","text":"what the words on it are like","peer":"which peer does this best"}],"avoid":["clichés or mistakes to avoid in this industry"],"sources":["urls you used"]}
Give 4 to 6 formats that suit this brand, varied (product, announcement, education, social proof, offer...).`;

export function researchPrompt(b: { name: string; industry?: string | null; description?: string | null; website?: string | null; products?: string[]; audience?: string | null; location?: string | null }) {
  return [
    `Brand: ${b.name}`,
    b.industry ? `Industry: ${b.industry}` : "",
    b.description ? `What it does: ${b.description}` : "",
    b.website ? `Website: ${b.website}` : "",
    b.products?.length ? `Products: ${b.products.join("; ")}` : "",
    b.audience ? `Audience: ${b.audience}` : "",
    b.location ? `Market: ${b.location}` : "",
    "Research how the leading brands in this industry design their social posts, then write the playbook.",
  ].filter(Boolean).join("\n");
}

/** The research, for an ideas or brief prompt. */
export function researchBrief(r: BrandResearch | null | undefined) {
  if (!r) return "";
  return [
    `How leading ${r.industry || "brands in this industry"} brands post (researched: ${r.peers.map((p) => p.name).join(", ")}): ${r.visualLanguage}`,
    `Post formats that work: ${r.formats.map((f, i) => `${i + 1}) ${f.name}: ${f.layout} Visual: ${f.imagery}`).join(" ")}`,
    r.avoid.length ? `Avoid: ${r.avoid.join("; ")}.` : "",
  ].filter(Boolean).join("\n");
}

/** The JSON object in a model reply (it may wrap it in prose or a code fence). */
export function jsonFrom(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}
