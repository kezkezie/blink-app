import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_IDENTIFIER = /^[A-Za-z0-9._:/-]{1,128}$/;
const IMAGE_MODES = new Set([
  "standard", "product_drop", "organic_blend", "grid", "edit",
  "generate", "style_transfer", "gpt_image_2_t2i", "gpt_image_2_i2i",
]);
const IMAGE_MODELS = new Set([
  "nano-banana-2", "gpt-image-2-text-to-image", "gpt-image-2-image-to-image",
]);
const IMAGE_ENGINES = new Set(["nb2", "gpt-image-2-text-to-image", "gpt-image-2-image-to-image"]);
const IMAGE_STYLES = new Set([
  "studio", "lifestyle", "cinematic", "poster", "brand", "abstract", "flatlay",
  "realistic", "3d_render", "illustrative", "2d_flat",
]);
const ASPECT_RATIOS = new Set(["1:1", "4:5", "3:4", "9:16", "16:9", "3:2", "2:3"]);
const CONTENT_TYPES = new Set([
  "video", "reel", "carousel", "story", "post", "post_image", "raw_clip",
  "sequence_clip", "generated_audio",
]);

type SecurityFailure = { ok: false; status: 400 | 401 | 404 | 500; error: string };
type SecurityResult<T> = { ok: true; value: T } | SecurityFailure;

type OwnedContent = {
  id: string;
  brand_id: string | null;
  content_type: string;
  image_urls: unknown;
};

type OwnedBrand = {
  id: string;
  brand_name?: unknown;
  company_name?: unknown;
  website_url?: unknown;
  description?: unknown;
  industry?: unknown;
  primary_color?: unknown;
  secondary_color?: unknown;
  logo_url?: unknown;
};

export type ImageWorkflowInput = {
  requestedClientId?: string;
  requestedBrandId?: string;
  postId?: string;
  sourceContentId?: string;
  referenceUrls: string[];
  inputUrls: string[];
  payload: Record<string, unknown>;
};

export type SemanticImageInput =
  | { operation: "xray_image"; contentId: string }
  | {
      operation: "json_image_edit";
      contentId: string;
      schema: Record<string, unknown>;
      replacements: Record<string, string>;
      model: "nano-banana-2" | "gpt-image-2-image-to-image";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function cleanString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalUuid(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function urlList(value: unknown, maxItems = 10): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const urls = value.map(safeUrl);
  return urls.every(Boolean) ? [...new Set(urls as string[])] : null;
}

function parseStoredUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function optionalBoundedString(
  input: Record<string, unknown>,
  key: string,
  max: number,
  payload: Record<string, unknown>
) {
  if (input[key] === undefined || input[key] === null) return true;
  const value = cleanString(input[key], max);
  if (!value) return false;
  payload[key] = value;
  return true;
}

export function isExecutionBodySizeAllowed(request: Request, maxBytes = 256_000) {
  const raw = request.headers.get("content-length");
  if (!raw) return true;
  const size = Number(raw);
  return Number.isFinite(size) && size >= 0 && size <= maxBytes;
}

export async function authenticateExecutionRequest(request: NextRequest): Promise<SecurityResult<string>> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return request.cookies.getAll(); }, setAll() {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user
    ? { ok: true, value: user.id }
    : { ok: false, status: 401, error: "Unauthorized" };
}

async function loadClientId(userId: string): Promise<SecurityResult<string>> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: "Internal server error" };
  return data?.id
    ? { ok: true, value: data.id }
    : { ok: false, status: 404, error: "Resource not found" };
}

async function loadBrand(clientId: string, brandId: string): Promise<SecurityResult<OwnedBrand>> {
  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .select("id, brand_name, company_name, website_url, description, industry, primary_color, secondary_color, logo_url")
    .eq("id", brandId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: "Internal server error" };
  return data
    ? { ok: true, value: data as OwnedBrand }
    : { ok: false, status: 404, error: "Resource not found" };
}

async function loadContent(clientId: string, contentId: string): Promise<SecurityResult<OwnedContent>> {
  const { data, error } = await supabaseAdmin
    .from("content")
    .select("id, brand_id, content_type, image_urls")
    .eq("id", contentId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: "Internal server error" };
  return data
    ? { ok: true, value: data as OwnedContent }
    : { ok: false, status: 404, error: "Resource not found" };
}

export function parseImageWorkflowRequest(value: unknown): ImageWorkflowInput | null {
  if (!isRecord(value)) return null;
  const allowedKeys = [
    "client_id", "brand_id", "post_id", "job_id", "idempotency_key", "source_content_id",
    "topic", "content_type",
    "mode", "prompt", "assembled_prompt", "negative_prompt", "custom_typography",
    "reference_image_urls", "input_urls", "kie_model", "aspect_ratio",
    "strict_brand_alignment", "numImages", "style", "imageEngine", "brand_name",
    "brand_website", "brand_description", "brand_industry", "brand_primary_color",
    "brand_secondary_color", "logo_url", "is_sync",
  ] as const;
  if (!hasOnlyKeys(value, allowedKeys)) return null;

  const requestedClientId = optionalUuid(value.client_id);
  const requestedBrandId = optionalUuid(value.brand_id);
  const postId = optionalUuid(value.post_id);
  // job_id is an explicit alias of post_id used by the durable status writer.
  const jobId = optionalUuid(value.job_id);
  const sourceContentId = optionalUuid(value.source_content_id);
  if (requestedClientId === null || requestedBrandId === null || postId === null || jobId === null || sourceContentId === null) return null;

  // Durable correlation is ALL-OR-NOTHING and only valid on an asynchronous request.
  // The durable-only markers are `job_id` and `idempotency_key`; an async request
  // (is_sync:false) is durable by definition. A synchronous request that omits every
  // durable field is unaffected (backward compatible). Any partial set is rejected
  // BEFORE workflow invocation so an orphan job_id can never reach the status writer
  // without an ownership-verified post_id. The caller's job_id is NOT trusted for
  // forwarding — it is canonicalized from the authorized post_id after authorization.
  const idempotencyKey = value.idempotency_key;
  const usesDurableCorrelation = jobId !== undefined || idempotencyKey !== undefined || value.is_sync === false;
  if (usesDurableCorrelation) {
    if (value.is_sync !== false) return null;                       // durable fields only valid on async
    if (postId === undefined || jobId === undefined) return null;   // require the full id pair
    if (jobId !== postId) return null;                              // alias must match the placeholder
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) return null;
  }

  const referenceUrls = urlList(value.reference_image_urls);
  const inputUrls = urlList(value.input_urls);
  if (!referenceUrls || !inputUrls) return null;

  const payload: Record<string, unknown> = {};
  if (!optionalBoundedString(value, "topic", 4_000, payload)
    || !optionalBoundedString(value, "prompt", 4_000, payload)
    || !optionalBoundedString(value, "assembled_prompt", 12_000, payload)
    || !optionalBoundedString(value, "negative_prompt", 4_000, payload)
    || !optionalBoundedString(value, "custom_typography", 500, payload)) return null;
  if (!payload.topic && !payload.prompt && !payload.assembled_prompt) return null;

  if (value.mode !== undefined && (typeof value.mode !== "string" || !IMAGE_MODES.has(value.mode))) return null;
  if (value.kie_model !== undefined && (typeof value.kie_model !== "string" || !IMAGE_MODELS.has(value.kie_model))) return null;
  if (value.imageEngine !== undefined && (typeof value.imageEngine !== "string" || !IMAGE_ENGINES.has(value.imageEngine))) return null;
  if (value.style !== undefined && (typeof value.style !== "string" || !IMAGE_STYLES.has(value.style))) return null;
  if (value.aspect_ratio !== undefined && (typeof value.aspect_ratio !== "string" || !ASPECT_RATIOS.has(value.aspect_ratio))) return null;
  if (value.content_type !== undefined && (typeof value.content_type !== "string" || !CONTENT_TYPES.has(value.content_type))) return null;
  if (value.numImages !== undefined && value.numImages !== 1) return null;
  if (value.strict_brand_alignment !== undefined && typeof value.strict_brand_alignment !== "boolean") return null;
  if (value.is_sync !== undefined && typeof value.is_sync !== "boolean") return null;

  for (const key of ["mode", "kie_model", "imageEngine", "style", "aspect_ratio", "content_type", "numImages", "strict_brand_alignment", "is_sync"] as const) {
    if (value[key] !== undefined) payload[key] = value[key];
  }
  // Idempotency key is a pure correlation token (no tenant/billing authority) and
  // passes through. job_id is deliberately NOT forwarded here: it is re-derived from
  // the ownership-authorized post_id in authorizeImageWorkflow so the value the status
  // writer receives is always an owned content id, never the caller's claim.
  if (idempotencyKey !== undefined) payload.idempotency_key = idempotencyKey;

  return {
    ...(requestedClientId ? { requestedClientId } : {}),
    ...(requestedBrandId ? { requestedBrandId } : {}),
    ...(postId ? { postId } : {}),
    ...(sourceContentId ? { sourceContentId } : {}),
    referenceUrls,
    inputUrls,
    payload,
  };
}

function isScopedStorageUrl(urlValue: string, clientId: string, brandId: string, contentId?: string) {
  try {
    const url = new URL(urlValue);
    const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
    if (url.origin !== supabaseOrigin) return false;
    const path = decodeURIComponent(url.pathname);
    const root = "/storage/v1/object/public/assets/";
    if (!path.startsWith(root)) return false;
    const objectPath = path.slice(root.length);
    return [
      `images/${clientId}/`,
      `references/${clientId}/`,
      `videos/${clientId}/`,
      `videos/${brandId}/`,
      ...(contentId ? [`edits/${clientId}/${contentId}/`] : []),
    ].some((prefix) => objectPath.startsWith(prefix));
  } catch {
    return false;
  }
}

export async function authorizeImageWorkflow(
  userId: string,
  input: ImageWorkflowInput
): Promise<SecurityResult<Record<string, unknown>>> {
  const client = await loadClientId(userId);
  if (!client.ok) return client;
  const clientId = client.value;
  if (input.requestedClientId && input.requestedClientId !== clientId) {
    return { ok: false, status: 404, error: "Resource not found" };
  }

  const post = input.postId ? await loadContent(clientId, input.postId) : null;
  if (post && !post.ok) return post;
  const source = input.sourceContentId ? await loadContent(clientId, input.sourceContentId) : null;
  if (source && !source.ok) return source;

  const contentBrandId = post?.ok ? post.value.brand_id : source?.ok ? source.value.brand_id : null;
  const brandId = input.requestedBrandId || contentBrandId;
  if (!brandId) return { ok: false, status: 400, error: "Invalid request" };
  if (contentBrandId && contentBrandId !== brandId) {
    return { ok: false, status: 404, error: "Resource not found" };
  }

  const brand = await loadBrand(clientId, brandId);
  if (!brand.ok) return brand;

  const sourceUrls = source?.ok ? parseStoredUrls(source.value.image_urls) : [];
  if (input.sourceContentId && sourceUrls.length === 0) {
    return { ok: false, status: 400, error: "Invalid request" };
  }
  const requestedUrls = [...new Set([...input.referenceUrls, ...input.inputUrls])];
  const trusted = new Set<string>([
    ...(post?.ok ? parseStoredUrls(post.value.image_urls) : []),
    ...sourceUrls,
    ...(typeof brand.value.logo_url === "string" ? [brand.value.logo_url] : []),
  ]);

  const unresolved = requestedUrls.filter((url) => !trusted.has(url) && !isScopedStorageUrl(url, clientId, brandId));
  if (unresolved.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("content")
      .select("image_urls")
      .eq("client_id", clientId)
      .eq("brand_id", brandId)
      .limit(500);
    if (error) return { ok: false, status: 500, error: "Internal server error" };
    for (const row of data || []) {
      for (const url of parseStoredUrls(row.image_urls)) trusted.add(url);
    }
    if (unresolved.some((url) => !trusted.has(url))) {
      return { ok: false, status: 404, error: "Resource not found" };
    }
  }

  const references = [...new Set([...input.referenceUrls, ...sourceUrls])];
  if (references.length > 10) return { ok: false, status: 400, error: "Invalid request" };

  // Durable requests (is_sync:false) carry a complete, validated correlation set; the
  // job_id forwarded downstream is the ownership-authorized post id, not the caller's.
  const isDurable = input.payload.is_sync === false;
  const canonical: Record<string, unknown> = {
    ...input.payload,
    client_id: clientId,
    brand_id: brandId,
    reference_image_urls: references,
    ...(input.inputUrls.length ? { input_urls: input.inputUrls } : {}),
    ...(post?.ok
      ? {
          post_id: post.value.id,
          content_type: post.value.content_type,
          ...(isDurable ? { job_id: post.value.id } : {}),
        }
      : {}),
  };

  const canonicalFields: Array<[string, unknown, number]> = [
    ["brand_name", brand.value.brand_name || brand.value.company_name, 80],
    ["brand_website", brand.value.website_url, 240],
    ["brand_description", brand.value.description, 600],
    ["brand_industry", brand.value.industry, 80],
    ["brand_primary_color", brand.value.primary_color, 32],
    ["brand_secondary_color", brand.value.secondary_color, 32],
    ["logo_url", brand.value.logo_url, 2_048],
  ];
  for (const [key, value, max] of canonicalFields) {
    const cleaned = cleanString(value, max);
    if (cleaned) canonical[key] = cleaned;
  }

  return { ok: true, value: canonical };
}

function parseSemanticSchema(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["scene_description", "lighting_and_weather", "objects"])) return null;
  const scene = cleanString(value.scene_description, 1_000);
  const lighting = cleanString(value.lighting_and_weather, 500);
  if (!scene || !lighting || !Array.isArray(value.objects) || value.objects.length > 80) return null;
  const objects = value.objects.map((item) => {
    if (!isRecord(item) || !hasOnlyKeys(item, ["id", "name", "color", "material", "type", "text_content", "font_style"])) return null;
    const parsed: Record<string, string> = {};
    for (const [key, max] of [["id", 64], ["name", 160], ["color", 120], ["material", 200], ["type", 80]] as const) {
      const field = cleanString(item[key], max);
      if (!field) return null;
      parsed[key] = field;
    }
    for (const [key, max] of [["text_content", 500], ["font_style", 200]] as const) {
      const field = cleanString(item[key], max);
      if (field) parsed[key] = field;
    }
    return parsed;
  });
  if (objects.some((item) => item === null)) return null;
  return { scene_description: scene, lighting_and_weather: lighting, objects };
}

export function parseSemanticImageRequest(value: unknown): SemanticImageInput | null {
  if (!isRecord(value)) return null;
  const contentId = optionalUuid(value.content_id);
  if (!contentId || contentId === null || value.mode !== "scene_video_generator") return null;

  if (value.video_mode === "xray_image") {
    return hasOnlyKeys(value, ["mode", "video_mode", "content_id"])
      ? { operation: "xray_image", contentId }
      : null;
  }
  if (value.video_mode !== "json_image_edit"
    || !hasOnlyKeys(value, ["mode", "video_mode", "content_id", "json_schema", "replacements", "kie_model"])) return null;

  const schema = parseSemanticSchema(value.json_schema);
  const model = value.kie_model === undefined ? "nano-banana-2" : value.kie_model;
  if (!schema || (model !== "nano-banana-2" && model !== "gpt-image-2-image-to-image")) return null;
  if (!isRecord(value.replacements) || Object.keys(value.replacements).length > 20) return null;
  const replacements: Record<string, string> = {};
  const objectIds = new Set(
    Array.isArray(schema.objects)
      ? schema.objects
        .map((item) => isRecord(item) && typeof item.id === "string" ? item.id : "")
        .filter(Boolean)
      : []
  );
  for (const [key, rawUrl] of Object.entries(value.replacements)) {
    const url = safeUrl(rawUrl);
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(key) || !objectIds.has(key) || !url) return null;
    replacements[key] = url;
  }
  return { operation: "json_image_edit", contentId, schema, replacements, model };
}

export async function authorizeSemanticImage(
  userId: string,
  input: SemanticImageInput
): Promise<SecurityResult<Record<string, unknown>>> {
  const client = await loadClientId(userId);
  if (!client.ok) return client;
  const content = await loadContent(client.value, input.contentId);
  if (!content.ok) return content;
  const sourceUrl = parseStoredUrls(content.value.image_urls)[0];
  if (!sourceUrl) return { ok: false, status: 400, error: "Invalid request" };

  if (content.value.brand_id) {
    const brand = await loadBrand(client.value, content.value.brand_id);
    if (!brand.ok) return brand;
  }

  const canonical: Record<string, unknown> = {
    mode: "scene_video_generator",
    video_mode: input.operation,
    client_id: client.value,
    post_id: content.value.id,
    ...(content.value.brand_id ? { brand_id: content.value.brand_id } : {}),
    primary_image_url: sourceUrl,
  };

  if (input.operation === "json_image_edit") {
    for (const url of Object.values(input.replacements)) {
      if (!isScopedStorageUrl(url, client.value, content.value.brand_id || "", content.value.id)) {
        return { ok: false, status: 404, error: "Resource not found" };
      }
    }
    canonical.json_schema = input.schema;
    canonical.replacements = input.replacements;
    canonical.kie_model = input.model;
  }

  return { ok: true, value: canonical };
}

export async function authorizeGenericExecutionPayload(
  userId: string,
  value: unknown
): Promise<SecurityResult<Record<string, unknown>>> {
  if (!isRecord(value)) return { ok: false, status: 400, error: "Invalid request" };
  for (const key of ["mode", "video_mode", "ai_model_override", "kie_model", "imageEngine"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !SAFE_IDENTIFIER.test(value[key]))) {
      return { ok: false, status: 400, error: "Invalid request" };
    }
  }
  const requestedClient = optionalUuid(value.client_id ?? value.clientId);
  const requestedBrand = optionalUuid(value.brand_id ?? value.brandId);
  const requestedContent = optionalUuid(value.post_id ?? value.postId);
  if (requestedClient === null || requestedBrand === null || requestedContent === null) {
    return { ok: false, status: 400, error: "Invalid request" };
  }

  const client = await loadClientId(userId);
  if (!client.ok) return client;
  if (requestedClient && requestedClient !== client.value) {
    return { ok: false, status: 404, error: "Resource not found" };
  }
  if (requestedBrand) {
    const brand = await loadBrand(client.value, requestedBrand);
    if (!brand.ok) return brand;
  }
  const content = requestedContent ? await loadContent(client.value, requestedContent) : null;
  if (content && !content.ok) return content;
  if (content?.ok && requestedBrand && content.value.brand_id && content.value.brand_id !== requestedBrand) {
    return { ok: false, status: 404, error: "Resource not found" };
  }

  return {
    ok: true,
    value: {
      ...value,
      client_id: client.value,
      ...(Object.hasOwn(value, "clientId") ? { clientId: client.value } : {}),
      ...(requestedBrand ? { brand_id: requestedBrand, ...(Object.hasOwn(value, "brandId") ? { brandId: requestedBrand } : {}) } : {}),
      ...(content?.ok ? { post_id: content.value.id, ...(Object.hasOwn(value, "postId") ? { postId: content.value.id } : {}) } : {}),
    },
  };
}
