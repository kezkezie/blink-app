export const CREATIVE_FORMATS = ["image", "video", "carousel"] as const;
export const CREATIVE_STYLES = ["studio", "lifestyle", "cinematic", "poster", "brand", "abstract", "flatlay"] as const;

export type CreativeFormat = (typeof CREATIVE_FORMATS)[number];
export type CreativeStyle = (typeof CREATIVE_STYLES)[number];

/**
 * Formats Image Studio can genuinely complete today (2026-07-20 format-honesty
 * correction). `video` returns through the state-preserving Create → Video
 * handoff (video plan V8); `carousel` returns only when a real multi-image
 * carousel exists end to end. The shared CREATIVE_FORMATS contract is unchanged.
 */
export const IMAGE_STUDIO_ALLOWED_FORMATS: readonly CreativeFormat[] = ["image"];
export const ASSISTED_CREATION_DRAFT_VERSION = 1 as const;
export type AssistedCreationStep = "idea" | "concepts" | "direction" | "handoff";

export interface CreativeConcept {
  id: string;
  title: string;
  idea: string;
  angle: string;
  format: CreativeFormat;
}

export interface AssistedCreativeDirection {
  visualDirection: string;
  tone: string;
  composition: string;
  outputType: CreativeFormat;
  style: CreativeStyle;
  summary: string;
}

export interface AssistedCreationDraft {
  version: typeof ASSISTED_CREATION_DRAFT_VERSION;
  brandId: string;
  idea: string;
  concepts: CreativeConcept[];
  selectedConcept: CreativeConcept | null;
  direction: AssistedCreativeDirection | null;
  step: AssistedCreationStep;
  advancedRevealed: boolean;
  handoff: { prompt: string; style: CreativeStyle; mode: "standard" } | null;
}

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const isFormat = (value: unknown): value is CreativeFormat =>
  typeof value === "string" && CREATIVE_FORMATS.includes(value as CreativeFormat);

const isStyle = (value: unknown): value is CreativeStyle =>
  typeof value === "string" && CREATIVE_STYLES.includes(value as CreativeStyle);

export function createEmptyAssistedCreationDraft(brandId: string): AssistedCreationDraft {
  return { version: ASSISTED_CREATION_DRAFT_VERSION, brandId, idea: "", concepts: [], selectedConcept: null, direction: null, step: "idea", advancedRevealed: false, handoff: null };
}

export function parseAssistedCreationDraft(value: unknown): AssistedCreationDraft | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item.version !== ASSISTED_CREATION_DRAFT_VERSION) return null;
  const brandId = clean(item.brandId, 120);
  const idea = clean(item.idea, 2_000);
  if (!brandId || !Array.isArray(item.concepts)) return null;
  const concepts = item.concepts.length === 0 ? [] : parseConcepts({ concepts: item.concepts });
  if (!concepts) return null;
  const selectedId = item.selectedConcept && typeof item.selectedConcept === "object"
    ? clean((item.selectedConcept as Record<string, unknown>).id, 40)
    : "";
  const selectedConcept = selectedId ? concepts.find((concept) => concept.id === selectedId) ?? null : null;
  if (selectedId && !selectedConcept) return null;
  const direction = item.direction === null ? null : parseCreativeDirection(item.direction);
  if (item.direction !== null && !direction) return null;
  if (direction && !selectedConcept) return null;
  if (!(["idea", "concepts", "direction", "handoff"] as const).includes(item.step as AssistedCreationStep)) return null;
  const step = item.step as AssistedCreationStep;
  if ((step === "concepts" && concepts.length !== 3) || ((step === "direction" || step === "handoff") && (!selectedConcept || !direction))) return null;

  let handoff: AssistedCreationDraft["handoff"] = null;
  if (item.handoff !== null) {
    if (!item.handoff || typeof item.handoff !== "object") return null;
    const saved = item.handoff as Record<string, unknown>;
    const prompt = clean(saved.prompt, 2_000);
    if (!prompt || !isStyle(saved.style) || saved.mode !== "standard" || !direction) return null;
    handoff = { prompt, style: saved.style, mode: "standard" };
  }
  if (step === "handoff" && !handoff) return null;

  return { version: ASSISTED_CREATION_DRAFT_VERSION, brandId, idea, concepts, selectedConcept, direction, step, advancedRevealed: item.advancedRevealed === true, handoff };
}

export function parseConcepts(value: unknown): CreativeConcept[] | null {
  if (!value || typeof value !== "object") return null;
  const concepts = (value as { concepts?: unknown }).concepts;
  if (!Array.isArray(concepts) || concepts.length !== 3) return null;

  const parsed = concepts.map((concept, index) => {
    if (!concept || typeof concept !== "object") return null;
    const item = concept as Record<string, unknown>;
    const title = clean(item.title, 80);
    const idea = clean(item.idea, 220);
    const angle = clean(item.angle, 160);
    if (!title || !idea || !angle || !isFormat(item.format)) return null;
    return { id: `concept-${index + 1}`, title, idea, angle, format: item.format };
  });

  return parsed.every(Boolean) ? (parsed as CreativeConcept[]) : null;
}

export function parseCreativeDirection(value: unknown): AssistedCreativeDirection | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const visualDirection = clean(item.visualDirection, 300);
  const tone = clean(item.tone, 160);
  const composition = clean(item.composition, 300);
  const summary = clean(item.summary, 600);
  if (!visualDirection || !tone || !composition || !summary || !isFormat(item.outputType) || !isStyle(item.style)) return null;
  return { visualDirection, tone, composition, summary, outputType: item.outputType, style: item.style };
}

/** Deterministic, genuinely distinct fallback concepts per format. */
function fallbackConceptPool(idea: string, brandName?: string): Record<CreativeFormat, Omit<CreativeConcept, "id">[]> {
  const subject = clean(idea, 180) || "a new brand story";
  const brand = clean(brandName, 80) || "the brand";
  return {
    image: [
      { title: "The Hero Shot", idea: `Make ${subject} the unmistakable hero of one focused, premium frame for ${brand}.`, angle: "Clarity, confidence, and immediate product desire", format: "image" },
      { title: "Caught in Real Life", idea: `Show ${subject} living naturally inside a real, warm customer moment that feels genuinely unstaged.`, angle: "Authenticity, relatability, and everyday aspiration", format: "image" },
      { title: "The Statement Poster", idea: `Turn ${subject} into one bold graphic brand statement with strong composition and space for a headline.`, angle: "Brand authority and scroll-stopping design", format: "image" },
    ],
    video: [
      { title: "A Story in Motion", idea: `Show how ${subject} changes a real moment, moving from anticipation to a memorable payoff.`, angle: "Human connection and emotional transformation", format: "video" },
      { title: "The Before and After", idea: `Contrast life without and with ${subject} in one continuous, satisfying transition for ${brand}.`, angle: "Transformation and proof", format: "video" },
      { title: "Behind the Craft", idea: `Reveal the care behind ${subject} through close, tactile moments that build trust in ${brand}.`, angle: "Craftsmanship and credibility", format: "video" },
    ],
    carousel: [
      { title: "The Visual Series", idea: `Explore ${subject} through three connected visual beats that reveal detail, context, and personality.`, angle: "Curiosity, discovery, and brand recognition", format: "carousel" },
      { title: "Step by Step", idea: `Walk through ${subject} one clear panel at a time, ending on a confident brand payoff.`, angle: "Education and momentum", format: "carousel" },
      { title: "Three Reasons Why", idea: `Give three crisp, visual reasons ${subject} matters, each with its own dedicated frame.`, angle: "Persuasion through structure", format: "carousel" },
    ],
  };
}

const includesAll = (allowed: readonly CreativeFormat[]) => CREATIVE_FORMATS.every((format) => allowed.includes(format));

export function fallbackConcepts(
  idea: string,
  brandName?: string,
  allowedFormats: readonly CreativeFormat[] = CREATIVE_FORMATS
): CreativeConcept[] {
  const pool = fallbackConceptPool(idea, brandName);
  const picks: Omit<CreativeConcept, "id">[] = [];
  if (includesAll(allowedFormats)) {
    // Default shared contract (all formats) keeps the historical mixed trio.
    picks.push(pool.image[0], pool.video[0], pool.carousel[0]);
  } else {
    // Cycle the allowed formats over their pools until three distinct concepts exist.
    let depth = 0;
    while (picks.length < 3 && depth <= 6) {
      for (const format of allowedFormats) {
        if (picks.length === 3) break;
        const candidate = pool[format][depth % pool[format].length];
        if (!picks.some((existing) => existing.title === candidate.title)) picks.push(candidate);
      }
      depth += 1;
    }
  }
  return picks.slice(0, 3).map((concept, index) => ({ ...concept, id: `concept-${index + 1}` }));
}

const STYLE_FOR_FORMAT: Record<CreativeFormat, CreativeStyle> = { image: "lifestyle", video: "cinematic", carousel: "poster" };

export function fallbackCreativeDirection(
  concept: CreativeConcept,
  allowedFormats: readonly CreativeFormat[] = CREATIVE_FORMATS
): AssistedCreativeDirection {
  // Never emit a format the caller cannot execute; coerce to the caller's first
  // allowed format instead of pretending the concept's format was produced.
  const outputType = allowedFormats.includes(concept.format) ? concept.format : allowedFormats[0] ?? "image";
  return {
    visualDirection: `A polished, brand-led interpretation of “${concept.idea}” with a clear focal subject and purposeful supporting details.`,
    tone: concept.angle,
    composition: "Lead with one strong focal point, use clean depth and negative space, and make every secondary element support the central idea.",
    outputType,
    style: STYLE_FOR_FORMAT[outputType],
    summary: `${concept.title}: ${concept.idea} The result should feel intentional, emotionally clear, and recognizably on-brand.`,
  };
}

export interface NormalizedConcepts {
  concepts: CreativeConcept[];
  /** True when anything was dropped, malformed, duplicated, or filled from fallbacks. */
  repaired: boolean;
}

/**
 * Enforce the caller's allowed formats on raw (AI or fixture) concept output.
 * Disallowed-format concepts are DROPPED, never relabelled; missing slots are
 * repaired with deterministic, distinct fallbacks so exactly three executable
 * concepts always return.
 */
export function normalizeConceptsForFormats(
  value: unknown,
  allowedFormats: readonly CreativeFormat[],
  idea: string,
  brandName?: string
): NormalizedConcepts {
  const raw = value && typeof value === "object" ? (value as { concepts?: unknown }).concepts : null;
  const entries = Array.isArray(raw) ? raw : [];
  const seenTitles = new Set<string>();
  const kept: CreativeConcept[] = [];

  for (const entry of entries) {
    if (kept.length === 3) break;
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const title = clean(item.title, 80);
    const conceptIdea = clean(item.idea, 220);
    const angle = clean(item.angle, 160);
    if (!title || !conceptIdea || !angle || !isFormat(item.format)) continue;
    if (!allowedFormats.includes(item.format)) continue; // dropped, never relabelled
    const key = title.toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    kept.push({ id: `concept-${kept.length + 1}`, title, idea: conceptIdea, angle, format: item.format });
  }

  let repaired = entries.length !== 3 || kept.length < 3;
  for (const fallback of fallbackConcepts(idea, brandName, allowedFormats)) {
    if (kept.length === 3) break;
    const key = fallback.title.toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    kept.push({ ...fallback, id: `concept-${kept.length + 1}` });
    repaired = true;
  }
  // Last-resort guarantee if titles collided with every fallback.
  let take = 2;
  while (kept.length < 3) {
    const base = fallbackConcepts(idea, brandName, allowedFormats)[kept.length % 3];
    kept.push({ ...base, id: `concept-${kept.length + 1}`, title: `${base.title} — Take ${take}` });
    take += 1;
    repaired = true;
  }
  return { concepts: kept, repaired };
}
