import { supabaseAdmin } from "@/lib/supabase-server";
import { CREATIVE_FORMATS, parseConcepts, type CreativeConcept, type CreativeFormat } from "@/lib/assisted-creation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AssistedCreationRequest =
  | { operation: "concepts"; brandId: string; idea: string; allowedFormats?: readonly CreativeFormat[] }
  | { operation: "direction"; brandId: string; idea: string; concept: CreativeConcept; allowedFormats?: readonly CreativeFormat[] };

/**
 * Caller capability: which creative formats the calling surface can execute.
 * Absent → undefined (default shared contract, all formats). Present → must be
 * a non-empty, duplicate-free subset of CREATIVE_FORMATS, else invalid (null).
 */
function parseAllowedFormats(value: unknown): readonly CreativeFormat[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > CREATIVE_FORMATS.length) return null;
  const formats: CreativeFormat[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !CREATIVE_FORMATS.includes(entry as CreativeFormat)) return null;
    if (formats.includes(entry as CreativeFormat)) return null;
    formats.push(entry as CreativeFormat);
  }
  return formats;
}

export type AssistedBrandContext = {
  name: string;
  companyName: string;
  industry: string;
  description: string;
  websiteUrl: string;
  brandVoice: string;
  toneKeywords: string[];
  imageStyle: string;
  visualStyleGuide: string;
  compositionNotes: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  primaryFont: string;
  secondaryFont: string;
  vocabularyNotes: string;
  dos: string;
  donts: string;
};

type CanonicalClient = { id: string; company_name?: unknown; industry?: unknown; website_url?: unknown };
type CanonicalBrand = Record<string, unknown>;

export type BrandContextResult =
  | { ok: true; clientId: string; context: AssistedBrandContext }
  | { ok: false; status: 404 | 500; error: string };

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const stringList = (value: unknown, maxItems = 12) =>
  Array.isArray(value)
    ? value.map((item) => clean(item, 80)).filter(Boolean).slice(0, maxItems)
    : [];

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function parseAssistedCreationRequest(value: unknown): AssistedCreationRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const operation = input.operation;
  const brandId = clean(input.brandId, 36);
  const idea = clean(input.idea, 500);
  if (!UUID_PATTERN.test(brandId) || !idea) return null;

  const allowedFormats = parseAllowedFormats(input.allowedFormats);
  if (allowedFormats === null) return null;
  const capability = allowedFormats ? { allowedFormats } : {};

  if (operation === "concepts") {
    return hasOnlyKeys(input, ["operation", "brandId", "idea", "allowedFormats"])
      ? { operation, brandId, idea, ...capability }
      : null;
  }
  if (operation !== "direction" || !hasOnlyKeys(input, ["operation", "brandId", "idea", "concept", "allowedFormats"])) return null;
  const concept = parseConcepts({ concepts: [input.concept, input.concept, input.concept] })?.[0];
  return concept ? { operation, brandId, idea, concept, ...capability } : null;
}

export function buildAssistedBrandContext(client: CanonicalClient, brand: CanonicalBrand): AssistedBrandContext {
  return {
    name: clean(brand.brand_name, 80) || clean(brand.company_name, 80) || clean(client.company_name, 80),
    companyName: clean(brand.company_name, 80) || clean(client.company_name, 80),
    industry: clean(brand.industry, 80) || clean(client.industry, 80),
    description: clean(brand.description, 600),
    websiteUrl: clean(brand.website_url, 240) || clean(client.website_url, 240),
    brandVoice: clean(brand.brand_voice, 240),
    toneKeywords: stringList(brand.tone_keywords),
    imageStyle: clean(brand.image_style, 240),
    visualStyleGuide: clean(brand.visual_style_guide, 800),
    compositionNotes: clean(brand.composition_notes, 400),
    primaryColor: clean(brand.primary_color, 32),
    secondaryColor: clean(brand.secondary_color, 32),
    accentColor: clean(brand.accent_color, 32),
    primaryFont: clean(brand.primary_font, 100),
    secondaryFont: clean(brand.secondary_font, 100),
    vocabularyNotes: clean(brand.vocabulary_notes, 400),
    dos: clean(brand.dos, 400),
    donts: clean(brand.donts, 400),
  };
}

export async function loadOwnedAssistedBrandContext(userId: string, brandId: string): Promise<BrandContextResult> {
  const { data: client, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("id, company_name, industry, website_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (clientError) return { ok: false, status: 500, error: "Unable to resolve brand context" };
  if (!client) return { ok: false, status: 404, error: "Brand not found" };

  const { data: brand, error: brandError } = await supabaseAdmin
    .from("brand_profiles")
    .select("brand_name, company_name, industry, description, website_url, brand_voice, tone_keywords, image_style, visual_style_guide, composition_notes, primary_color, secondary_color, accent_color, primary_font, secondary_font, vocabulary_notes, dos, donts")
    .eq("id", brandId)
    .eq("client_id", client.id)
    .maybeSingle();

  if (brandError) return { ok: false, status: 500, error: "Unable to resolve brand context" };
  if (!brand) return { ok: false, status: 404, error: "Brand not found" };
  return { ok: true, clientId: client.id, context: buildAssistedBrandContext(client, brand) };
}
