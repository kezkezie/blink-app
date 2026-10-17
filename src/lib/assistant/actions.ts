/**
 * Ask BlinkSpot does the work (Kezie, 2026-10-17: "my brother gave Ask the full text of what his
 * brand is about, and it just showed him where to put all that information... the AI should go
 * ahead and do tasks for you"). Tools that change the account for the user: fill or update the
 * brand (and its products), start a new brand, and write captions on posts. Each one applies at
 * once and comes back with what changed and an Undo. Nothing here spends credits, publishes or
 * deletes; spending stays with the explicit "make it now" tools.
 */
import { supabaseAdmin } from "@/lib/supabase-server";
import { CTAS, INDUSTRIES, LANGUAGES, PERSONALITY, PHOTO_VIBES, canonicalIndustry, cleanDna, type BrandDna } from "@/lib/brand-dna";
import { getLimitForTier } from "@/lib/limits";

const HEX6 = /^#[0-9a-f]{6}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? [...new Set(v.map((x) => s(x, max)).filter(Boolean))].slice(0, n) : []);
const color = (v: unknown) => (typeof v === "string" && HEX6.test(v.trim()) ? v.trim().toUpperCase() : "");

const BRAND_FIELDS = {
  name: { type: "string", description: "The brand's name" },
  tagline: { type: "string", description: "Up to 8 words" },
  description: { type: "string", description: "1-3 sentences: what they sell and to whom" },
  industry: { type: "string", description: `Best match of: ${INDUSTRIES.join(" | ")}` },
  audience: { type: "string", description: "Who buys" },
  location: { type: "string", description: "City / country" },
  usps: { type: "array", items: { type: "string" }, maxItems: 3, description: "Why people choose them" },
  offer: { type: "string", description: "A current promotion, only if stated" },
  languages: { type: "array", items: { type: "string" }, description: `From: ${LANGUAGES.join(", ")}` },
  tone: { type: "array", items: { type: "string" }, maxItems: 3, description: `Personality, from: ${PERSONALITY.join(", ")}` },
  photo_vibes: { type: "array", items: { type: "string" }, maxItems: 3, description: `From: ${PHOTO_VIBES.join(", ")}` },
  cta: { type: "string", description: `Main call to action, one of: ${CTAS.join(" | ")}` },
  whatsapp: { type: "string" }, phone: { type: "string" }, email: { type: "string" },
  website: { type: "string" }, socials: { type: "array", items: { type: "string" }, description: "Social profile links" },
  voice: { type: "string", description: "How they talk, 1-2 sentences" },
  dos: { type: "array", items: { type: "string" }, maxItems: 8 }, donts: { type: "array", items: { type: "string" }, maxItems: 8 },
  colors: { type: "object", properties: { primary: { type: "string" }, secondary: { type: "string" }, accent: { type: "string" } }, description: "Hex colours like #E4572E, only if given" },
  fonts: { type: "object", properties: { heading: { type: "string" }, body: { type: "string" } } },
  products: { type: "array", maxItems: 30, items: { type: "object", properties: { name: { type: "string" }, price: { type: "number" }, currency: { type: "string", description: "ISO code, e.g. KES" }, description: { type: "string" } }, required: ["name"] }, description: "Products or services; an existing name is updated, a new one added" },
} as const;

export const UPDATE_BRAND_TOOL = {
  name: "update_brand",
  description: "Fill in or update the active brand's Brand page FOR the user: description, audience, location, products and prices, contacts, voice, colours, fonts and so on. Use it whenever the user tells you about their brand (a pasted description, a menu, a price list, \"our WhatsApp is...\") instead of telling them where to type it. Pass only what they gave you or what clearly follows from it; never invent prices, contacts or offers. It saves at once and the user gets an Undo.",
  input_schema: { type: "object", properties: BRAND_FIELDS, additionalProperties: false },
} as const;

export const CREATE_BRAND_TOOL = {
  name: "create_brand",
  description: "Create a NEW brand for the user from what they told you (name required, plus any of the Brand page fields and products), and switch to it. Only for a brand they don't have yet: if the brand they describe is the one that's open (same name, or the open brand is still mostly empty), use update_brand. A brand with the same name as one they have is filled in, not duplicated. Their plan limits how many brands they can have; say so if it is full.",
  input_schema: { type: "object", properties: BRAND_FIELDS, required: ["name"], additionalProperties: false },
} as const;

export const UPDATE_POSTS_TOOL = {
  name: "update_posts",
  description: "Write or change captions and hashtags on the brand's Library posts, or mark them approved, FOR the user (ids from list_library). Saves at once with an Undo. Never deletes or publishes.",
  input_schema: {
    type: "object",
    properties: {
      posts: { type: "array", maxItems: 20, items: { type: "object", properties: { id: { type: "string" }, caption: { type: "string" }, hashtags: { type: "string", description: "Space-separated, e.g. #nairobi #juice" }, approve: { type: "boolean" } }, required: ["id"] } },
    },
    required: ["posts"],
    additionalProperties: false,
  },
} as const;

/** What the tool input changes on the brand row and in its DNA, cleaned and sized. */
export function brandPatch(input: Record<string, unknown>) {
  const core: Record<string, unknown> = {};
  const name = s(input.name, 120);
  if (name) { core.brand_name = name; core.company_name = name; }
  const description = s(input.description, 1200); if (description) core.description = description;
  const industry = s(input.industry, 80); if (industry) core.industry = canonicalIndustry(industry);
  const website = s(input.website, 300); if (website && /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(website)) core.website_url = /^https?:\/\//.test(website) ? website : `https://${website}`;
  const socials = list(input.socials, 6, 200).filter((u) => /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}\//i.test(u) || u.startsWith("@")); if (socials.length) core.social_urls = socials.join("\n");
  const voice = s(input.voice, 800); if (voice) core.brand_voice = voice;
  const tone = list(input.tone, 3, 30); if (tone.length) core.tone_keywords = tone;
  const dos = list(input.dos, 8, 140); if (dos.length) core.dos = dos.join("\n");
  const donts = list(input.donts, 8, 140); if (donts.length) core.donts = donts.join("\n");
  const c = (input.colors && typeof input.colors === "object" ? input.colors : {}) as Record<string, unknown>;
  for (const [k, col] of [["primary", "primary_color"], ["secondary", "secondary_color"], ["accent", "accent_color"]] as const) { const v = color(c[k]); if (v) core[col] = v; }
  const f = (input.fonts && typeof input.fonts === "object" ? input.fonts : {}) as Record<string, unknown>;
  const heading = s(f.heading, 60), body = s(f.body, 60);
  if (heading) core.primary_font = heading;
  if (body) core.secondary_font = body;
  const dna: BrandDna = cleanDna({
    tagline: s(input.tagline, 90) || undefined, audience: s(input.audience, 300) || undefined, location: s(input.location, 120) || undefined,
    usps: list(input.usps, 3, 120), offer: s(input.offer, 200) || undefined, languages: list(input.languages, 4, 30), cta: s(input.cta, 60) || undefined,
    whatsapp: s(input.whatsapp, 24) || undefined, phone: s(input.phone, 24) || undefined, email: s(input.email, 120) || undefined, photoVibes: list(input.photo_vibes, 4, 30),
  });
  const products = (Array.isArray(input.products) ? input.products : []).slice(0, 30).flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const r = p as Record<string, unknown>;
    const pname = s(r.name, 100);
    if (!pname) return [];
    const price = typeof r.price === "number" && Number.isFinite(r.price) && r.price >= 0 && r.price < 1e9 ? r.price : null;
    const currency = typeof r.currency === "string" && /^[A-Za-z]{3}$/.test(r.currency.trim()) ? r.currency.trim().toUpperCase() : null;
    return [{ name: pname, price, currency, description: s(r.description, 300) || null }];
  });
  return { core, dna, products };
}

const LABEL: Record<string, string> = {
  brand_name: "Name", description: "Description", industry: "Industry", website_url: "Website", social_urls: "Social links", brand_voice: "Voice",
  tone_keywords: "Personality", dos: "Do's", donts: "Don'ts", primary_color: "Main colour", secondary_color: "Second colour", accent_color: "Accent colour",
  primary_font: "Heading font", secondary_font: "Body font", tagline: "Tagline", audience: "Who it's for", location: "Location", usps: "Why people choose you",
  offer: "Offer", languages: "Languages", cta: "Call to action", whatsapp: "WhatsApp", phone: "Phone", email: "Email", photoVibes: "Photo style",
};
/** The brand_profiles columns the assistant may write (and so restore). */
const CORE_COLUMNS = new Set(["brand_name", "company_name", "description", "industry", "website_url", "social_urls", "brand_voice", "tone_keywords", "dos", "donts", "primary_color", "secondary_color", "accent_color", "primary_font", "secondary_font"]);
const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v ?? "")).replace(/\n/g, ", ").slice(0, 90);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type BrandUndo = { kind: "brand"; brandId: string; core: Record<string, unknown>; dna: unknown; addedProducts: string[]; changedProducts: Array<{ id: string; price: number | null; currency: string | null; description: string | null }> };
export type PostsUndo = { kind: "posts"; brandId: string; posts: Array<{ id: string; caption: string | null; hashtags: string | null; status: string }> };
export type AssistantUndo = BrandUndo | PostsUndo;

type Applied = { changes: string[]; undo: AssistantUndo | null; error?: string };

async function writeBrand(clientId: string, brandId: string, input: Record<string, unknown>): Promise<Applied> {
  const { core, dna, products } = brandPatch(input);
  const { data: row } = await supabaseAdmin.from("brand_profiles").select("*").eq("id", brandId).eq("client_id", clientId).eq("is_active", true).maybeSingle();
  if (!row) return { changes: [], undo: null, error: "Brand not found." };
  const changes: string[] = [];
  const before: Record<string, unknown> = {};
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(core)) {
    if (k === "company_name" || same(row[k], v)) continue;
    patch[k] = v; before[k] = row[k] ?? null;
    if (k === "brand_name") { patch.company_name = v; before.company_name = row.company_name ?? null; }
    changes.push(`${LABEL[k] ?? k}: ${show(v)}`);
  }
  const oldDna = cleanDna(row.dna);
  const merged = cleanDna({ ...oldDna, ...dna });
  for (const k of Object.keys(dna) as Array<keyof BrandDna>) if (!same(oldDna[k], merged[k])) changes.push(`${LABEL[k] ?? k}: ${show(merged[k])}`);
  const dnaChanged = !same(oldDna, merged);
  if (dnaChanged) patch.dna = merged;

  const addedProducts: string[] = [];
  const changedProducts: BrandUndo["changedProducts"] = [];
  if (products.length) {
    const { data: existing } = await supabaseAdmin.from("products").select("id, name, price, currency, description").eq("brand_id", brandId).eq("client_id", clientId);
    const byName = new Map((existing ?? []).map((p) => [String(p.name).toLowerCase(), p]));
    const added: string[] = [];
    for (const p of products) {
      const old = byName.get(p.name.toLowerCase());
      if (old) {
        const upd: Record<string, unknown> = {};
        if (p.price !== null && p.price !== old.price) upd.price = p.price;
        if (p.currency && p.currency !== old.currency) upd.currency = p.currency;
        if (p.description && p.description !== old.description) upd.description = p.description;
        if (!Object.keys(upd).length) continue;
        await supabaseAdmin.from("products").update({ ...upd, updated_at: new Date().toISOString() }).eq("id", old.id).eq("client_id", clientId);
        changedProducts.push({ id: old.id as string, price: (old.price as number | null) ?? null, currency: (old.currency as string | null) ?? null, description: (old.description as string | null) ?? null });
        changes.push(`${p.name}: ${upd.price !== undefined ? `price ${old.price ?? "none"} → ${p.price}` : "updated"}`);
      } else {
        const { data: made } = await supabaseAdmin.from("products").insert({ client_id: clientId, brand_id: brandId, name: p.name, price: p.price, currency: p.currency ?? "KES", description: p.description }).select("id").single();
        if (made?.id) { addedProducts.push(made.id as string); added.push(p.price !== null ? `${p.name} (${p.currency ?? "KES"} ${p.price})` : p.name); byName.set(p.name.toLowerCase(), { id: made.id, name: p.name, price: p.price, currency: p.currency, description: p.description }); }
      }
    }
    if (added.length) changes.push(`${added.length} product${added.length === 1 ? "" : "s"} added: ${added.slice(0, 8).join(", ")}${added.length > 8 ? "…" : ""}`);
  }
  if (Object.keys(patch).length) {
    const { error } = await supabaseAdmin.from("brand_profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", brandId).eq("client_id", clientId);
    if (error) return { changes: [], undo: null, error: "Couldn't save the brand just now." };
  }
  const undo: BrandUndo | null = changes.length ? { kind: "brand", brandId, core: before, dna: dnaChanged ? oldDna : null, addedProducts, changedProducts } : null;
  return { changes, undo };
}

export async function updateBrand(ctx: { clientId: string; brandId: string | null }, input: Record<string, unknown>): Promise<Applied> {
  if (!ctx.brandId) return { changes: [], undo: null, error: "No brand is open. Create one with create_brand or ask the user to pick one." };
  return writeBrand(ctx.clientId, ctx.brandId, input);
}

/** A new brand in the user's own workspace, within their plan's brand limit. */
export async function createBrand(ownClientId: string, input: Record<string, unknown>): Promise<Applied & { brand?: { id: string; brand_name: string }; existing?: boolean }> {
  const name = s(input.name, 120);
  if (!name) return { changes: [], undo: null, error: "A brand needs a name." };
  // A brand they already have (same name) is filled in, never duplicated (seen 2026-10-17: "set it
  // up" about the open brand made a second one).
  const { data: same } = await supabaseAdmin.from("brand_profiles").select("id, brand_name").eq("client_id", ownClientId).eq("is_active", true).ilike("brand_name", name.replace(/[%_\\]/g, (c) => `\\${c}`)).limit(1).maybeSingle();
  if (same) {
    const filled = await writeBrand(ownClientId, same.id as string, { ...input, name: undefined });
    return { ...filled, brand: { id: same.id as string, brand_name: same.brand_name as string }, existing: true };
  }
  const { data: client } = await supabaseAdmin.from("clients").select("id, plan_tier").eq("id", ownClientId).maybeSingle();
  if (!client) return { changes: [], undo: null, error: "Account not found." };
  const limit = getLimitForTier(client.plan_tier as string | null).maxBrands;
  const { count, error: countError } = await supabaseAdmin.from("brand_profiles").select("id", { count: "exact", head: true }).eq("client_id", ownClientId).eq("is_active", true);
  if (countError) return { changes: [], undo: null, error: "Couldn't check how many brands the plan allows. Try again." };
  if ((count ?? 0) >= limit) return { changes: [], undo: null, error: `The plan's limit of ${limit} brand${limit === 1 ? "" : "s"} is reached. Upgrade, or archive a brand on Manage brands to free a slot.` };
  const { data: made, error } = await supabaseAdmin.from("brand_profiles").insert({ client_id: ownClientId, brand_name: name, company_name: name, is_active: true }).select("id").single();
  if (error || !made) return { changes: [], undo: null, error: "Couldn't create the brand just now." };
  const filled = await writeBrand(ownClientId, made.id as string, { ...input, name: undefined });
  return { changes: [`New brand: ${name}`, ...filled.changes], undo: null, brand: { id: made.id as string, brand_name: name } };
}

export async function updatePosts(ctx: { clientId: string; brandId: string | null }, input: Record<string, unknown>): Promise<Applied> {
  if (!ctx.brandId) return { changes: [], undo: null, error: "No brand is open." };
  const asked = (Array.isArray(input.posts) ? input.posts : []).slice(0, 20).filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && typeof (p as { id?: unknown }).id === "string" && UUID.test((p as { id: string }).id));
  if (!asked.length) return { changes: [], undo: null, error: "No valid post ids. Call list_library and use its ids." };
  const { data: rows } = await supabaseAdmin.from("content").select("id, caption, hashtags, status").eq("client_id", ctx.clientId).eq("brand_id", ctx.brandId).in("id", asked.map((p) => p.id as string));
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  const changes: string[] = [];
  const undo: PostsUndo = { kind: "posts", brandId: ctx.brandId, posts: [] };
  for (const p of asked) {
    const row = byId.get(p.id as string);
    if (!row || row.status === "posted") continue;
    const upd: Record<string, unknown> = {};
    const caption = typeof p.caption === "string" ? p.caption.trim().slice(0, 2200) : "";
    if (caption && caption !== row.caption) upd.caption = caption;
    const tags = typeof p.hashtags === "string" ? p.hashtags.split(/\s+/).filter((t) => /^#[\p{L}\p{N}_]{1,60}$/u.test(t)).slice(0, 30).join(" ") : "";
    if (tags && tags !== row.hashtags) upd.hashtags = tags;
    if (p.approve === true && ["draft", "pending_approval", "rejected"].includes(row.status as string)) upd.status = "approved";
    if (!Object.keys(upd).length) continue;
    await supabaseAdmin.from("content").update({ ...upd, updated_at: new Date().toISOString() }).eq("id", row.id).eq("client_id", ctx.clientId);
    undo.posts.push({ id: row.id as string, caption: (row.caption as string | null) ?? null, hashtags: (row.hashtags as string | null) ?? null, status: row.status as string });
    changes.push(`${s(caption || row.caption, 40) || "Post"}: ${[upd.caption && "caption", upd.hashtags && "hashtags", upd.status && "approved"].filter(Boolean).join(", ")}`);
  }
  return { changes, undo: undo.posts.length ? undo : null };
}

/** Put things back as they were before the assistant's change (the user pressed Undo). */
export async function undoAssistantChange(clientId: string, raw: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Nothing to undo." };
  const u = raw as AssistantUndo;
  if (typeof u.brandId !== "string" || !UUID.test(u.brandId)) return { ok: false, error: "Nothing to undo." };
  const { data: brand } = await supabaseAdmin.from("brand_profiles").select("id").eq("id", u.brandId).eq("client_id", clientId).maybeSingle();
  if (!brand) return { ok: false, error: "Brand not found." };
  if (u.kind === "brand") {
    const core = Object.fromEntries(Object.entries(u.core && typeof u.core === "object" ? u.core : {}).filter(([k]) => CORE_COLUMNS.has(k)));
    const restore: Record<string, unknown> = { ...core, ...(u.dna ? { dna: cleanDna(u.dna) } : {}) };
    if (Object.keys(restore).length) await supabaseAdmin.from("brand_profiles").update({ ...restore, updated_at: new Date().toISOString() }).eq("id", u.brandId).eq("client_id", clientId);
    const added = (Array.isArray(u.addedProducts) ? u.addedProducts : []).filter((id) => typeof id === "string" && UUID.test(id)).slice(0, 30);
    if (added.length) await supabaseAdmin.from("products").delete().eq("brand_id", u.brandId).eq("client_id", clientId).in("id", added);
    for (const p of (Array.isArray(u.changedProducts) ? u.changedProducts : []).slice(0, 30)) {
      if (typeof p?.id !== "string" || !UUID.test(p.id)) continue;
      await supabaseAdmin.from("products").update({ price: typeof p.price === "number" ? p.price : null, currency: typeof p.currency === "string" ? p.currency.slice(0, 3) : null, description: typeof p.description === "string" ? p.description.slice(0, 300) : null }).eq("id", p.id).eq("brand_id", u.brandId).eq("client_id", clientId);
    }
    return { ok: true };
  }
  if (u.kind === "posts") {
    for (const p of (Array.isArray(u.posts) ? u.posts : []).slice(0, 20)) {
      if (typeof p?.id !== "string" || !UUID.test(p.id)) continue;
      const status = ["draft", "pending_approval", "approved", "rejected"].includes(p.status) ? p.status : "draft";
      await supabaseAdmin.from("content").update({ caption: typeof p.caption === "string" ? p.caption.slice(0, 2200) : null, hashtags: typeof p.hashtags === "string" ? p.hashtags.slice(0, 2000) : null, status, updated_at: new Date().toISOString() })
        .eq("id", p.id).eq("brand_id", u.brandId).eq("client_id", clientId).neq("status", "posted");
    }
    return { ok: true };
  }
  return { ok: false, error: "Nothing to undo." };
}
