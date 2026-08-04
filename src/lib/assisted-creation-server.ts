import { supabaseAdmin } from "@/lib/supabase-server";
import {
  buildBrandCreativeContext,
  loadOwnedBrandCreativeContext,
  toAssistedBrandContext,
} from "@/lib/brand-creative-context";
import { CREATIVE_FORMATS, parseConcepts, type CreativeConcept, type CreativeFormat } from "@/lib/assisted-creation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AssistedCreationRequest =
  | { operation: "concepts"; brandId: string; idea: string; inspirationImageUrl?: string; allowedFormats?: readonly CreativeFormat[] }
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
  // brandId is always required. `idea` is required for text-driven flows, but an
  // image-driven concepts request may omit it (enforced per-operation below).
  if (!UUID_PATTERN.test(brandId)) return null;

  const allowedFormats = parseAllowedFormats(input.allowedFormats);
  if (allowedFormats === null) return null;
  const capability = allowedFormats ? { allowedFormats } : {};

  if (operation === "concepts") {
    if (!hasOnlyKeys(input, ["operation", "brandId", "idea", "inspirationImageUrl", "allowedFormats"])) return null;
    // Optional inspiration image: a bounded https URL. Ownership is verified in the
    // route (needs the DB); here we only validate shape. Concepts require an idea
    // OR an inspiration image — an image alone is a valid, image-driven request.
    const inspirationImageUrl = parseInspirationImageUrl(input.inspirationImageUrl);
    if (inspirationImageUrl === null) return null;
    if (!idea && !inspirationImageUrl) return null;
    return { operation, brandId, idea, ...(inspirationImageUrl ? { inspirationImageUrl } : {}), ...capability };
  }
  if (operation !== "direction" || !hasOnlyKeys(input, ["operation", "brandId", "idea", "concept", "allowedFormats"])) return null;
  if (!idea) return null; // developing a direction always has the originating idea
  const concept = parseConcepts({ concepts: [input.concept, input.concept, input.concept] })?.[0];
  return concept ? { operation, brandId, idea, concept, ...capability } : null;
}

/**
 * Validate the OPTIONAL inspiration image URL's shape only (ownership is checked in
 * the route against the DB). Returns `undefined` when absent, a bounded https URL
 * string when valid, or `null` when malformed (caller rejects the whole request).
 */
export function parseInspirationImageUrl(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 2048) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:") return null;
  return value;
}

/**
 * Verify an inspiration image URL belongs to the authenticated client: it must be
 * either a client-scoped Supabase asset path (`images|references|edits/<clientId>/…`)
 * or a URL already stored on one of the client's own content rows. Prevents feeding
 * an arbitrary/other-tenant image into the (billed) vision analysis.
 */
export async function verifyOwnedInspirationImage(
  clientId: string,
  url: string,
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const parsed = new URL(url);
      if (parsed.origin === new URL(supabaseUrl).origin) {
        const path = decodeURIComponent(parsed.pathname);
        const root = "/storage/v1/object/public/assets/";
        if (path.startsWith(root)) {
          const objectPath = path.slice(root.length);
          if (["images/", "references/", "edits/"].some((p) => objectPath.startsWith(`${p}${clientId}/`))) {
            return true;
          }
        }
      }
    } catch { /* fall through to owned-content check */ }
  }
  // Otherwise the URL must appear on one of the client's own content rows.
  const { data, error } = await supabaseAdmin
    .from("content")
    .select("image_urls")
    .eq("client_id", clientId)
    .limit(1000);
  if (error || !data) return false;
  for (const row of data) {
    const urls = Array.isArray(row.image_urls) ? row.image_urls : [];
    if (urls.some((u) => typeof u === "string" && u === url)) return true;
  }
  return false;
}

/**
 * V6: assembly now delegates to the shared Brand Creative Context v1 service.
 * The returned shape is unchanged (`toAssistedBrandContext` is a byte-identical
 * projection), so Image Studio behaviour and its prompt are untouched.
 */
export function buildAssistedBrandContext(client: CanonicalClient, brand: CanonicalBrand): AssistedBrandContext {
  return toAssistedBrandContext(buildBrandCreativeContext(client, brand, ""));
}

export async function loadOwnedAssistedBrandContext(userId: string, brandId: string): Promise<BrandContextResult> {
  // V6: one shared, server-owned loader for every creative surface.
  const result = await loadOwnedBrandCreativeContext(userId, brandId);
  if (!result.ok) return { ok: false, status: result.status, error: result.error };
  return {
    ok: true,
    clientId: result.context.clientId,
    context: toAssistedBrandContext(result.context),
  };
}
