/**
 * Motion inspiration from whatships.com (Kezie, 2026-10-16: "the AI will go over and look for
 * things on the link, but asking permission first"). whatships.com is a public directory of launch
 * films; its robots.txt welcomes "user-triggered assistant fetchers" and it publishes a search
 * index for agents. We read titles, descriptions and posters only (never the videos), match them
 * to the brand and brief, and always link back to the original page. Pure parts here.
 */
export const WHATSHIPS = "https://whatships.com";

export type ShipItem = { name: string; slug: string; meta: string; poster: string; searchText: string };
export type InspoRef = { name: string; page: string; poster: string; meta: string };
export type MotionStyleIdea = { title: string; why: string; style: string; refs: InspoRef[] };

/** Videos from the index, motion first. */
export function shipItems(raw: unknown): ShipItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>;
    if (r.kind !== "video" || typeof r.slug !== "string" || !/^[\w-]{1,120}$/.test(r.slug)) return [];
    return [{ name: String(r.name ?? "").slice(0, 160), slug: r.slug, meta: String(r.meta ?? "").slice(0, 120), poster: typeof r.poster === "string" && r.poster.startsWith("/posters/") ? r.poster : "", searchText: String(r.searchText ?? "").toLowerCase().slice(0, 1200) }];
  });
}

const STOP = new Set("a an and the of for to in on with our your my we us is are be it this that at by from as or new make video motion intro".split(" "));
const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

/** The best matches for a brand and brief: motion category first, then word overlap, then a spread. */
export function pickShips(items: ShipItem[], words: string, n = 8): ShipItem[] {
  const want = new Set(tokens(words));
  const scored = items.filter((i) => i.poster).map((i, at) => {
    const motion = /·\s*motion\b/i.test(i.meta) ? 3 : 0;
    const overlap = tokens(i.searchText).filter((w) => want.has(w)).length;
    return { i, score: motion + Math.min(overlap, 6), at };
  });
  scored.sort((a, b) => b.score - a.score || a.at - b.at);
  return scored.slice(0, n).map((s) => s.i);
}

export const pageOf = (slug: string) => `${WHATSHIPS}/videos/${slug}/`;
export const posterOf = (path: string) => `${WHATSHIPS}${path}`;

export const STYLE_SYSTEM = `You are a motion designer. You see stills from launch films (numbered) with their titles. Suggest 3 different motion styles this brand could borrow for the brief, as craft, never copying a film, logo or wording. Our motion kit has: kinetic headlines (word by word, line by line, or slam), a number counting up, a product reveal on a card, a logo sting, a lower third and an end card, in the brand's colours and font.
Reply with JSON only: {"ideas":[{"title":"short name","why":"one line: what makes it work","style":"2 short sentences of direction the kit can follow: pacing, how words arrive, colour use, which scenes in which order","refs":[numbers of the stills it draws on]}]}`;

export function stylePrompt(i: { brandName: string; industry?: string | null; brief: string; ships: Array<{ name: string; meta: string }> }) {
  return [
    `Brand: ${i.brandName}${i.industry ? ` (${i.industry})` : ""}`,
    `Brief: ${i.brief || "a short brand motion graphic"}`,
    "Stills, in order:",
    ...i.ships.map((s, n) => `${n + 1}. ${s.name} (${s.meta})`),
  ].join("\n");
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Claude's ideas, checked, with their references resolved to the films shown. */
export function validateStyleIdeas(raw: unknown, ships: ShipItem[]): MotionStyleIdea[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { ideas?: unknown }).ideas) ? (raw as { ideas: unknown[] }).ideas : [];
  return list.slice(0, 3).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>;
    const title = str(r.title, 60), style = str(r.style, 400);
    if (!title || style.split(" ").length < 6) return [];
    const nums = Array.isArray(r.refs) ? r.refs.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= ships.length) : [];
    const refs = [...new Set(nums)].slice(0, 3).map((n) => ships[n - 1]).map((s) => ({ name: s.name, page: pageOf(s.slug), poster: posterOf(s.poster), meta: s.meta }));
    return [{ title, why: str(r.why, 200), style, refs }];
  });
}

/** The style the user picked, as a line for the motion brief. */
export const styleLine = (idea: MotionStyleIdea) => `Style to follow (${idea.title}): ${idea.style}`;
