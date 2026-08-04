/**
 * Brand Creative Context v1 — the ONE server-owned brand context every creative
 * surface consumes (Image Studio plan §7.3, Video plan §14/§17, slice V6).
 *
 * Before this module the same brand facts were assembled in several places and
 * shapes: Assisted Creation built its own `AssistedBrandContext`, and the video
 * surfaces assembled `brand_name`/`brand_info` **in the browser** and sent them
 * to n8n — meaning the browser was authoritative for brand identity, and two
 * surfaces could disagree about the same brand.
 *
 * Rules this module enforces:
 *
 *  1. **Server-owned.** Canonical brand fields are read from the database under
 *     verified ownership (auth → client → brand). A caller may say *which* brand
 *     (by id, ownership-checked); it may never supply the brand's name, voice,
 *     colours, or description.
 *  2. **Versioned.** Every context carries `schemaVersion`, and callers persist
 *     `contextVersion` alongside generated assets so reopening an old asset does
 *     not silently rewrite its history when the brand profile later changes.
 *  3. **One shape, many projections.** The context is a superset; each surface
 *     gets a projection (`toAssistedBrandContext`, `toVideoWorkflowFields`,
 *     `toDirectorBrief`). Projections never re-read the database.
 *  4. **Bounded.** Every field is trimmed and length-capped here, so no
 *     downstream payload can be inflated by unbounded brand text.
 *
 * This module is the single place to add a brand field. It performs no provider,
 * n8n, or billing work.
 */

import { supabaseAdmin } from "@/lib/supabase-server";

export const BRAND_CONTEXT_VERSION = 1 as const;

export interface BrandCreativeContext {
  schemaVersion: typeof BRAND_CONTEXT_VERSION;
  clientId: string;
  brandId: string;

  // Identity
  name: string;
  companyName: string;
  industry: string;
  description: string;
  websiteUrl: string;

  // Voice
  brandVoice: string;
  toneKeywords: string[];
  vocabularyNotes: string;
  dos: string;
  donts: string;

  // Visual system
  imageStyle: string;
  visualStyleGuide: string;
  compositionNotes: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  primaryFont: string;
  secondaryFont: string;
  logoUrl: string;
}

export type BrandCreativeContextResult =
  | { ok: true; context: BrandCreativeContext }
  | { ok: false; status: 404 | 500; error: string };

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const stringList = (value: unknown, maxItems = 12) =>
  Array.isArray(value)
    ? value.map((item) => clean(item, 80)).filter(Boolean).slice(0, maxItems)
    : [];

type CanonicalClient = { id: string; company_name?: unknown; industry?: unknown; website_url?: unknown };
type CanonicalBrand = Record<string, unknown>;

/** Columns the context needs. Adding a field means adding it here AND to the type. */
export const BRAND_CONTEXT_COLUMNS =
  "brand_name, company_name, industry, description, website_url, brand_voice, tone_keywords, " +
  "image_style, visual_style_guide, composition_notes, primary_color, secondary_color, accent_color, " +
  "primary_font, secondary_font, vocabulary_notes, dos, donts, logo_url";

/** Pure assembly from already-loaded, already-owned rows. */
export function buildBrandCreativeContext(
  client: CanonicalClient,
  brand: CanonicalBrand,
  brandId: string,
): BrandCreativeContext {
  return {
    schemaVersion: BRAND_CONTEXT_VERSION,
    clientId: client.id,
    brandId,
    name: clean(brand.brand_name, 80) || clean(brand.company_name, 80) || clean(client.company_name, 80),
    companyName: clean(brand.company_name, 80) || clean(client.company_name, 80),
    industry: clean(brand.industry, 80) || clean(client.industry, 80),
    description: clean(brand.description, 600),
    websiteUrl: clean(brand.website_url, 240) || clean(client.website_url, 240),
    brandVoice: clean(brand.brand_voice, 240),
    toneKeywords: stringList(brand.tone_keywords),
    vocabularyNotes: clean(brand.vocabulary_notes, 400),
    dos: clean(brand.dos, 400),
    donts: clean(brand.donts, 400),
    imageStyle: clean(brand.image_style, 240),
    visualStyleGuide: clean(brand.visual_style_guide, 800),
    compositionNotes: clean(brand.composition_notes, 400),
    primaryColor: clean(brand.primary_color, 32),
    secondaryColor: clean(brand.secondary_color, 32),
    accentColor: clean(brand.accent_color, 32),
    primaryFont: clean(brand.primary_font, 100),
    secondaryFont: clean(brand.secondary_font, 100),
    logoUrl: clean(brand.logo_url, 2_048),
  };
}

/**
 * Load the canonical context for a brand the authenticated user owns.
 * Missing client, missing brand and cross-tenant brand all return an identical
 * 404 — never leak whether a brand exists in another tenant.
 */
export async function loadOwnedBrandCreativeContext(
  userId: string,
  brandId: string,
): Promise<BrandCreativeContextResult> {
  const { data: client, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("id, company_name, industry, website_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (clientError) return { ok: false, status: 500, error: "Unable to resolve brand context" };
  if (!client) return { ok: false, status: 404, error: "Brand not found" };

  const { data: brand, error: brandError } = await supabaseAdmin
    .from("brand_profiles")
    .select(BRAND_CONTEXT_COLUMNS)
    .eq("id", brandId)
    .eq("client_id", client.id)
    .maybeSingle();
  if (brandError) return { ok: false, status: 500, error: "Unable to resolve brand context" };
  if (!brand) return { ok: false, status: 404, error: "Brand not found" };

  return { ok: true, context: buildBrandCreativeContext(client, brand as unknown as CanonicalBrand, brandId) };
}

// ── Projections ─────────────────────────────────────────────────────────────
// Each surface gets exactly the shape it already expects. Projections are pure
// and never re-read the database.

/**
 * The Assisted Creation view. **Byte-identical to the shape Image Studio already
 * sends into its prompt** — same fields, same order — so generalizing the
 * service changes no image behaviour. Do not add fields here without checking
 * the assisted prompt and its tests.
 */
export function toAssistedBrandContext(context: BrandCreativeContext) {
  return {
    name: context.name,
    companyName: context.companyName,
    industry: context.industry,
    description: context.description,
    websiteUrl: context.websiteUrl,
    brandVoice: context.brandVoice,
    toneKeywords: context.toneKeywords,
    imageStyle: context.imageStyle,
    visualStyleGuide: context.visualStyleGuide,
    compositionNotes: context.compositionNotes,
    primaryColor: context.primaryColor,
    secondaryColor: context.secondaryColor,
    accentColor: context.accentColor,
    primaryFont: context.primaryFont,
    secondaryFont: context.secondaryFont,
    vocabularyNotes: context.vocabularyNotes,
    dos: context.dos,
    donts: context.donts,
  };
}

/**
 * A compact, human-readable brand brief for the Director / storyboard prompts.
 * Only non-empty facts are included, so an unfilled brand profile produces a
 * short brief rather than a wall of empty labels.
 */
export function toDirectorBrief(context: BrandCreativeContext): string {
  const parts: Array<[string, string]> = [
    ["Brand", context.name],
    ["Industry", context.industry],
    ["About", context.description],
    ["Voice", context.brandVoice],
    ["Tone", context.toneKeywords.join(", ")],
    ["Visual style", context.imageStyle || context.visualStyleGuide],
    ["Composition", context.compositionNotes],
    ["Do", context.dos],
    ["Don't", context.donts],
  ];
  return parts
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`)
    .join(" · ");
}

/**
 * The canonical brand fields the video workflow expects. These REPLACE whatever
 * the browser sent — `brand_name`/`brand_info` are no longer client-authored.
 * `brand_context_version` travels with them so a generated asset records which
 * version of the brand context produced it.
 */
export function toVideoWorkflowFields(context: BrandCreativeContext): Record<string, string | number> {
  const fields: Record<string, string | number> = {
    brand_name: context.name,
    brand_info: toDirectorBrief(context),
    brand_context_version: context.schemaVersion,
  };
  if (context.logoUrl) fields.logo_url = context.logoUrl;
  return fields;
}
