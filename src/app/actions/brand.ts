"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getLimitForTier } from "@/lib/limits";
import { workspaceFor, type BrandRole } from "@/lib/brand-access";

// ────────────────────────────────────────────────
// Security model (2026-09-29)
//
// These server actions are public HTTP endpoints: their ids ship in the client
// bundle. They use the service-role client, which bypasses RLS, so EVERY action
// must establish identity from the session cookie itself and check ownership.
// Caller-supplied userId / clientId are never trusted. Before this, any visitor
// could overwrite any brand in the database and create brands for any user.
// ────────────────────────────────────────────────

async function sessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

async function ownedClient(userId: string): Promise<{ id: string; plan_tier: string | null } | null> {
  const { data } = await supabaseAdmin.from("clients").select("id, plan_tier").eq("user_id", userId).maybeSingle();
  return (data as { id: string; plan_tier: string | null } | null) ?? null;
}

/**
 * The workspace a brand lives in, for a caller who may work on it: their own brand, or one shared
 * with them (editors write, viewers only read). Archiving, deleting and brand slots stay with the
 * owner and keep using ownedClient.
 */
async function brandClient(userId: string, brandId: unknown, write = true): Promise<{ id: string; plan_tier: string | null; role: BrandRole } | null> {
  if (typeof brandId !== "string") return null;
  const ws = await workspaceFor(userId, { brandId, write });
  if (!ws) return null;
  const { data } = await supabaseAdmin.from("clients").select("plan_tier").eq("id", ws.clientId).maybeSingle();
  return { id: ws.clientId, plan_tier: (data?.plan_tier as string | null | undefined) ?? null, role: ws.role };
}

async function activeBrandCount(clientId: string): Promise<number | null> {
  const { count, error } = await supabaseAdmin
    .from("brand_profiles")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("is_active", true);
  return error ? null : count ?? 0;
}

const LIMIT_MESSAGE = (limit: number) =>
  `You've reached your plan's limit of ${limit} active brand${limit === 1 ? "" : "s"}. Upgrade, or archive a brand to free a slot.`;

/**
 * Server-side brand entitlement. Only ACTIVE brands count, so archiving frees a
 * slot. An unknown tier gets the free limit (getLimitForTier), never unlimited.
 * A failed count refuses the create rather than guessing.
 * Known gap: count-then-insert can race by one under concurrent creates; a DB
 * trigger would close it (Red: migration).
 */
async function checkBrandAllowance(client: { id: string; plan_tier: string | null }): Promise<{ ok: true } | { ok: false; error: string; limitReached?: true }> {
  const limit = getLimitForTier(client.plan_tier).maxBrands;
  const count = await activeBrandCount(client.id);
  if (count === null) return { ok: false, error: "Could not verify your brand allowance. Please try again." };
  if (count >= limit) return { ok: false, error: LIMIT_MESSAGE(limit), limitReached: true };
  return { ok: true };
}

const cleanName = (v: unknown, max = 120): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= max ? t : null;
};

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

interface CreateBrandWorkspaceInput {
  userId: string;
  contactName: string;
  // Business info (isolated per brand)
  brandName: string;
  companyName: string;
  industry: string;
  description: string;
  websiteUrl: string;
  socialUrls: string;
  // Visuals
  visualStyleGuide: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  additionalColor: string;
  primaryFont: string | null;
  // Voice
  brandVoice: string;
  toneKeywords: string[];
  // Uploaded URLs (already uploaded client-side to Storage)
  logoUrl: string | null;
  uploadedAssets: string[];
  // Optional extras from the brand builder
  secondaryFont?: string | null;
  dos?: string[];
  donts?: string[];
}

interface SaveBrandProfileInput {
  // Business info
  company_name: string;
  industry: string;
  description: string;
  website_url: string;
  social_urls: string;
  // Brand identity
  brand_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  additional_colors: string[];
  uploaded_assets: string[];
  primary_font: string;
  secondary_font: string;
  visual_style_guide: string;
  brand_voice: string;
  tone_keywords: string[];
  vocabulary_notes: string;
  dos: string[];
  donts: string[];
}

// ────────────────────────────────────────────────
// 1. Create Brand Workspace (from BrandCreationModal)
// ────────────────────────────────────────────────

export async function createBrandWorkspace(input: CreateBrandWorkspaceInput): Promise<{
  brandId?: string;
  clientId?: string;
  error?: string;
  limitReached?: boolean;
}> {
  // Identity comes from the session, NEVER from input.userId.
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const brandName = cleanName(input?.brandName);
  if (!brandName) return { error: "Please enter a brand name (up to 120 characters)." };

  // Step 1: Ensure a master client record exists
  let clientId: string;
  const existingClient = await ownedClient(userId);

  if (existingClient) {
    const allowance = await checkBrandAllowance(existingClient);
    if (!allowance.ok) return { error: allowance.error, ...(allowance.limitReached ? { limitReached: true } : {}) };
    clientId = existingClient.id;
  } else {
    // Fetch the auth user's email to satisfy the unique constraint on contact_email
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const userEmail = authUser?.user?.email || null;

    const { data: newClient, error: clientError } = await supabaseAdmin
      .from("clients")
      .insert({
        user_id: userId,
        contact_name: input.contactName,
        company_name: "Master Account",
        contact_email: userEmail,
        plan_tier: "free" as const,
      })
      .select("id")
      .single();

    if (clientError || !newClient) {
      return { error: "Could not create your account. Please try again." };
    }
    clientId = (newClient as { id: string }).id;
  }

  // Step 2: Insert the brand profile (all business info is isolated here)
  const { data: newBrand, error: brandError } = await supabaseAdmin
    .from("brand_profiles")
    .insert({
      client_id: clientId,
      brand_name: brandName,
      company_name: input.companyName || brandName,
      industry: input.industry,
      description: input.description,
      website_url: input.websiteUrl,
      social_urls: input.socialUrls,
      visual_style_guide: input.visualStyleGuide,
      brand_voice: input.brandVoice,
      primary_color: input.primaryColor,
      secondary_color: input.secondaryColor,
      accent_color: input.accentColor,
      additional_colors: input.additionalColor ? [input.additionalColor] : [],
      primary_font: input.primaryFont,
      ...(typeof input.secondaryFont === "string" && input.secondaryFont ? { secondary_font: input.secondaryFont.slice(0, 60) } : {}),
      ...(Array.isArray(input.dos) ? { dos: input.dos.filter((d) => typeof d === "string").slice(0, 8).join("\n") } : {}),
      ...(Array.isArray(input.donts) ? { donts: input.donts.filter((d) => typeof d === "string").slice(0, 8).join("\n") } : {}),
      tone_keywords: input.toneKeywords,
      is_active: true,
      logo_url: input.logoUrl,
      uploaded_assets: Array.isArray(input.uploadedAssets) ? input.uploadedAssets : [],
    })
    .select("id")
    .single();

  if (brandError || !newBrand) {
    return { error: "Could not create the brand. Please try again." };
  }

  return { brandId: (newBrand as { id: string }).id, clientId };
}

// ────────────────────────────────────────────────
// 2. Save Brand Profile (from BrandIdentityPage)
// ────────────────────────────────────────────────

export async function saveBrandProfile(
  brandId: string,
  data: SaveBrandProfileInput
): Promise<{ success?: boolean; error?: string }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await ownedClient(userId);
  if (!client || typeof brandId !== "string") return { error: "Brand not found." };

  // Scoped to the caller's own client: another customer's brand id matches no row.
  const { data: updated, error } = await supabaseAdmin
    .from("brand_profiles")
    .update({
      brand_name: data.brand_name,
      company_name: data.company_name,
      industry: data.industry,
      description: data.description,
      website_url: data.website_url,
      social_urls: data.social_urls,
      logo_url: data.logo_url,
      primary_color: data.primary_color,
      secondary_color: data.secondary_color,
      accent_color: data.accent_color,
      additional_colors: data.additional_colors,
      uploaded_assets: data.uploaded_assets,
      primary_font: data.primary_font,
      secondary_font: data.secondary_font,
      visual_style_guide: data.visual_style_guide,
      brand_voice: data.brand_voice,
      tone_keywords: data.tone_keywords,
      vocabulary_notes: data.vocabulary_notes,
      dos: (data.dos ?? []).join("\n"),
      donts: (data.donts ?? []).join("\n"),
    })
    .eq("id", brandId)
    .eq("client_id", client.id)
    .select("id");

  // Proven by the returned rows, not by the absence of an error.
  if (error || !Array.isArray(updated) || updated.length !== 1) {
    return { error: "Brand not found." };
  }

  return { success: true };
}

// ────────────────────────────────────────────────
// 3. Create Quick Brand (from "Create New Brand" button)
// ────────────────────────────────────────────────

export async function createQuickBrand(
  clientId: string,
  brandName: string
): Promise<{
  brand?: { id: string; brand_name: string; logo_url: string | null };
  error?: string;
  limitReached?: boolean;
}> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await ownedClient(userId);
  // The clientId argument is only accepted if it IS the caller's own client.
  if (!client || client.id !== clientId) return { error: "Account not found." };
  const name = cleanName(brandName);
  if (!name) return { error: "Please enter a brand name (up to 120 characters)." };

  const allowance = await checkBrandAllowance(client);
  if (!allowance.ok) return { error: allowance.error, ...(allowance.limitReached ? { limitReached: true } : {}) };

  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .insert({
      client_id: client.id,
      brand_name: name,
      primary_color: "#2563EB",
      secondary_color: "#F59E0B",
      accent_color: "#10B981",
      is_active: true,
    })
    .select("id, brand_name, logo_url")
    .single();

  if (error || !data) {
    return { error: "Could not create the brand. Please try again." };
  }

  return { brand: data as { id: string; brand_name: string; logo_url: string | null } };
}

// ────────────────────────────────────────────────
// 3b. Brand allowance (read-only) — lets the UI explain the limit BEFORE the user
//     fills in a whole creation form. Creation still re-checks on the server.
// ────────────────────────────────────────────────

export async function getBrandAllowance(): Promise<{ used: number; limit: number; canCreate: boolean; plan: string } | { error: string }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await ownedClient(userId);
  // No client row yet = brand-new user about to create their first brand.
  if (!client) {
    const limit = getLimitForTier("free").maxBrands;
    return { used: 0, limit, canCreate: limit > 0, plan: "free" };
  }
  const limit = getLimitForTier(client.plan_tier).maxBrands;
  const used = await activeBrandCount(client.id);
  if (used === null) return { error: "Could not check your brand allowance." };
  return { used, limit, canCreate: used < limit, plan: client.plan_tier || "free" };
}

// ────────────────────────────────────────────────
// 4. Archive Brand (replaces the browser-side hard delete)
// ────────────────────────────────────────────────

/**
 * Soft delete. The row stays so posts, jobs, social accounts and the credit
 * ledger keep a valid reference (content.brand_id and social_accounts.brand_id
 * reference it with no ON DELETE rule, which is why the old hard delete failed
 * for any brand with content). An archived brand stops counting against the plan
 * limit and disappears from brand lists.
 */
export async function archiveBrand(brandId: string): Promise<{ success?: boolean; error?: string }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await ownedClient(userId);
  if (!client || typeof brandId !== "string") return { error: "Brand not found." };

  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", brandId)
    .eq("client_id", client.id)
    .select("id");

  if (error || !Array.isArray(data) || data.length !== 1) return { error: "Brand not found." };
  return { success: true };
}

// ────────────────────────────────────────────────
// 5. Archived brands: list and restore (2026-10-10)
// ────────────────────────────────────────────────

export async function listArchivedBrands(): Promise<{ brands: Array<{ id: string; brand_name: string; logo_url: string | null; updated_at: string | null }> } | { error: string }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await ownedClient(userId);
  if (!client) return { brands: [] };
  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .select("id, brand_name, logo_url, updated_at")
    .eq("client_id", client.id)
    .eq("is_active", false)
    .order("updated_at", { ascending: false });
  if (error) return { error: "Could not load archived brands." };
  return { brands: (data ?? []) as Array<{ id: string; brand_name: string; logo_url: string | null; updated_at: string | null }> };
}

/** Bring an archived brand back (everything it had is still there). Respects the plan's brand limit. */
export async function restoreBrand(brandId: string): Promise<{ success?: boolean; error?: string }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await ownedClient(userId);
  if (!client || typeof brandId !== "string") return { error: "Brand not found." };
  const used = await activeBrandCount(client.id);
  const limit = getLimitForTier(client.plan_tier).maxBrands;
  if (used === null) return { error: "Could not check your brand allowance." };
  if (used >= limit) return { error: `Your plan allows ${limit} active brand${limit === 1 ? "" : "s"}. Archive one first, then restore this one.` };
  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", brandId)
    .eq("client_id", client.id)
    .eq("is_active", false)
    .select("id");
  if (error || !Array.isArray(data) || data.length !== 1) return { error: "Brand not found." };
  return { success: true };
}

/**
 * Swap which brand is active when the plan is full: archive one, restore another, in one step
 * (an agency pausing one client to work on another). If the restore fails, the archived brand is
 * switched back on, so the user never ends up with fewer brands than they started with.
 */
export async function swapBrands(archiveId: string, restoreId: string): Promise<{ success?: boolean; error?: string }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await ownedClient(userId);
  if (!client || typeof archiveId !== "string" || typeof restoreId !== "string" || archiveId === restoreId) return { error: "Brand not found." };
  const now = new Date().toISOString();
  const { data: off, error: offErr } = await supabaseAdmin.from("brand_profiles").update({ is_active: false, updated_at: now })
    .eq("id", archiveId).eq("client_id", client.id).eq("is_active", true).select("id");
  if (offErr || !Array.isArray(off) || off.length !== 1) return { error: "Brand not found." };
  const restored = await restoreBrand(restoreId);
  if (restored.error) {
    await supabaseAdmin.from("brand_profiles").update({ is_active: true, updated_at: now }).eq("id", archiveId).eq("client_id", client.id);
    return { error: restored.error };
  }
  return { success: true };
}

// ────────────────────────────────────────────────
// 6. Delete a brand forever (2026-10-10)
// ────────────────────────────────────────────────

const CHUNK = 200;
function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/**
 * Permanently deletes a brand, its posts, schedules, social connections and their conversations.
 * The user must type the brand's name. content.brand_id and social_accounts.brand_id have no
 * ON DELETE rule, so dependents are removed (or unlinked) first. Billing history is kept: ledger
 * rows only lose their link to the deleted post. Uploaded files in storage are left in place.
 */
export async function deleteBrandPermanently(brandId: string, typedName: string): Promise<{ success?: boolean; error?: string; removed?: { posts: number; accounts: number } }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await ownedClient(userId);
  if (!client || typeof brandId !== "string") return { error: "Brand not found." };
  const { data: brand } = await supabaseAdmin.from("brand_profiles").select("id, brand_name").eq("id", brandId).eq("client_id", client.id).maybeSingle();
  if (!brand) return { error: "Brand not found." };
  if ((typedName ?? "").trim().toLowerCase() !== String(brand.brand_name ?? "").trim().toLowerCase()) return { error: "The name you typed doesn't match the brand." };

  const fail = (step: string) => ({ error: `Couldn't finish deleting the brand (stopped at: ${step}). Some of its posts may already be gone; try again to finish.` });

  const { data: posts, error: pe } = await supabaseAdmin.from("content").select("id").eq("brand_id", brandId).eq("client_id", client.id);
  const { data: accounts, error: ae } = await supabaseAdmin.from("social_accounts").select("id").eq("brand_id", brandId).eq("client_id", client.id);
  if (pe || ae) return fail("reading the brand");
  const postIds = (posts ?? []).map((p) => p.id as string);
  const accountIds = (accounts ?? []).map((a) => a.id as string);

  // schedules (and their analytics) for these posts or accounts
  const scheduleIds = new Set<string>();
  for (const ids of chunks(postIds)) {
    const { data, error } = await supabaseAdmin.from("content_schedule").select("id").in("content_id", ids);
    if (error) return fail("reading schedules"); (data ?? []).forEach((r) => scheduleIds.add(r.id as string));
  }
  for (const ids of chunks(accountIds)) {
    const { data, error } = await supabaseAdmin.from("content_schedule").select("id").in("social_account_id", ids);
    if (error) return fail("reading schedules"); (data ?? []).forEach((r) => scheduleIds.add(r.id as string));
  }
  for (const ids of chunks([...scheduleIds])) {
    if ((await supabaseAdmin.from("analytics").delete().in("content_schedule_id", ids)).error) return fail("removing analytics");
    if ((await supabaseAdmin.from("content_schedule").delete().in("id", ids)).error) return fail("removing schedules");
  }
  // conversations on this brand's social accounts
  for (const ids of chunks(accountIds)) {
    const { data: convs, error } = await supabaseAdmin.from("conversations").select("id").in("social_account_id", ids);
    if (error) return fail("reading conversations");
    for (const cids of chunks((convs ?? []).map((c) => c.id as string))) {
      if ((await supabaseAdmin.from("conversation_messages").delete().in("conversation_id", cids)).error) return fail("removing messages");
      if ((await supabaseAdmin.from("conversations").delete().in("id", cids)).error) return fail("removing conversations");
    }
  }
  // unlink rows that must survive (files, billing history, retries from other posts)
  for (const ids of chunks(postIds)) {
    if ((await supabaseAdmin.from("assets").update({ related_content_id: null }).in("related_content_id", ids)).error) return fail("unlinking files");
    if ((await supabaseAdmin.from("generation_billing_ledger").update({ content_id: null }).in("content_id", ids)).error) return fail("unlinking billing history");
    if ((await supabaseAdmin.from("content").update({ retry_of_content_id: null }).in("retry_of_content_id", ids)).error) return fail("unlinking retries");
  }
  for (const ids of chunks(postIds)) {
    if ((await supabaseAdmin.from("content").delete().in("id", ids).eq("client_id", client.id)).error) return fail("removing posts");
  }
  for (const ids of chunks(accountIds)) {
    if ((await supabaseAdmin.from("social_accounts").delete().in("id", ids).eq("client_id", client.id)).error) return fail("removing social connections");
  }
  const { error: be } = await supabaseAdmin.from("brand_profiles").delete().eq("id", brandId).eq("client_id", client.id);
  if (be) return fail("removing the brand");
  return { success: true, removed: { posts: postIds.length, accounts: accountIds.length } };
}

// ────────────────────────────────────────────────
// 7. Set a brand's logo after it was created (brand builder, 2026-10-10)
// ────────────────────────────────────────────────

export async function setBrandLogo(brandId: string, logoUrl: string): Promise<{ success?: boolean; error?: string }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await brandClient(userId, brandId);
  if (!client || typeof brandId !== "string" || typeof logoUrl !== "string") return { error: "Brand not found." };
  // Only a file in the user's own storage folder can become their logo.
  const root = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/images/${client.id}/`;
  if (!logoUrl.startsWith(root)) return { error: "Invalid logo." };
  const { data, error } = await supabaseAdmin.from("brand_profiles").update({ logo_url: logoUrl, updated_at: new Date().toISOString() }).eq("id", brandId).eq("client_id", client.id).select("id");
  if (error || !Array.isArray(data) || data.length !== 1) return { error: "Brand not found." };
  return { success: true };
}

// ────────────────────────────────────────────────
// 8. Brand DNA v2: the new Brand page and onboarding (2026-10-11)
// ────────────────────────────────────────────────

const HEX6 = /^#[0-9a-f]{6}$/i;
const textOrNull = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : null);

export type BrandDnaPayload = {
  brand_name: string; description?: string; industry?: string; website_url?: string; social_urls?: string; logo_url?: string | null;
  primary_color?: string; secondary_color?: string; accent_color?: string; additional_colors?: string[];
  primary_font?: string; secondary_font?: string; brand_voice?: string; tone_keywords?: string[]; visual_style_guide?: string;
  uploaded_assets?: string[]; vocabulary_notes?: string; dos?: string[]; donts?: string[]; dna?: unknown;
};

/** Everything the Brand page shows, in one call. Scoped to the caller's own brand. */
export async function loadBrandDna(brandId: string): Promise<{ brand: Record<string, unknown>; products: Array<Record<string, unknown>>; plan: string; role: BrandRole } | { error: string }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await brandClient(userId, brandId, false);
  if (!client || typeof brandId !== "string") return { error: "Brand not found." };
  const [{ data: brand }, { data: products }] = await Promise.all([
    supabaseAdmin.from("brand_profiles").select("*").eq("id", brandId).eq("client_id", client.id).maybeSingle(),
    supabaseAdmin.from("products").select("id, name, description, price, currency, image_url, created_at").eq("brand_id", brandId).eq("client_id", client.id).order("created_at", { ascending: true }),
  ]);
  if (!brand) return { error: "Brand not found." };
  return { brand, products: products ?? [], plan: client.plan_tier || "free", role: client.role };
}

/** Save the Brand page. Only the caller's own brand; every field typed and sized here. */
export async function saveBrandDna(brandId: string, p: BrandDnaPayload): Promise<{ success?: boolean; error?: string }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await brandClient(userId, brandId);
  if (!client || typeof brandId !== "string" || !p || typeof p !== "object") return { error: "Brand not found." };
  const name = cleanName(p.brand_name);
  if (!name) return { error: "Your brand needs a name." };
  const { cleanDna } = await import("@/lib/brand-dna");
  const color = (v: unknown) => (typeof v === "string" && HEX6.test(v) ? v.toUpperCase() : undefined);
  const strings = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, max)).filter(Boolean).slice(0, n) : undefined);
  // A logo must be one of the user's own files (their storage folders), never an arbitrary URL.
  const storage = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/`;
  const ownLogo = (v: unknown) => v === null ? null : typeof v === "string" && (v.startsWith(`${storage}images/${client.id}/`) || v.startsWith(`${storage}brands/${brandId}/`)) ? v : undefined;
  // Photos already on the brand are always kept (older brands stored them elsewhere); new ones must be the user's own files.
  const { data: current } = await supabaseAdmin.from("brand_profiles").select("uploaded_assets").eq("id", brandId).eq("client_id", client.id).maybeSingle();
  const existing = new Set(Array.isArray(current?.uploaded_assets) ? (current.uploaded_assets as unknown[]).filter((u): u is string => typeof u === "string") : []);
  const ownAssets = (v: unknown) => strings(v, 24, 600)?.filter((u) => existing.has(u) || u.startsWith(`${storage}images/${client.id}/`) || u.startsWith(`${storage}brands/${brandId}/`));
  const update: Record<string, unknown> = {
    brand_name: name,
    company_name: name,
    description: textOrNull(p.description, 1200),
    industry: textOrNull(p.industry, 80),
    website_url: textOrNull(p.website_url, 300),
    social_urls: textOrNull(p.social_urls, 1200),
    primary_color: color(p.primary_color),
    secondary_color: color(p.secondary_color),
    accent_color: color(p.accent_color),
    additional_colors: (strings(p.additional_colors, 3, 7) ?? []).map(color).filter(Boolean),
    primary_font: textOrNull(p.primary_font, 60),
    secondary_font: textOrNull(p.secondary_font, 60),
    brand_voice: textOrNull(p.brand_voice, 800),
    tone_keywords: strings(p.tone_keywords, 8, 30) ?? [],
    visual_style_guide: textOrNull(p.visual_style_guide, 800),
    vocabulary_notes: textOrNull(p.vocabulary_notes, 600),
    dos: (strings(p.dos, 8, 140) ?? []).join("\n"),
    donts: (strings(p.donts, 8, 140) ?? []).join("\n"),
    dna: cleanDna(p.dna),
    updated_at: new Date().toISOString(),
  };
  const logo = ownLogo(p.logo_url);
  if (logo !== undefined) update.logo_url = logo;
  const assets = ownAssets(p.uploaded_assets);
  if (assets) update.uploaded_assets = assets;
  for (const k of Object.keys(update)) if (update[k] === undefined) delete update[k];
  const { data, error } = await supabaseAdmin.from("brand_profiles").update(update).eq("id", brandId).eq("client_id", client.id).select("id");
  if (error || !Array.isArray(data) || data.length !== 1) return { error: "Couldn't save. Try again." };
  return { success: true };
}

export async function saveProduct(brandId: string, p: { id?: string; name: string; description?: string; price?: number | null; currency?: string; image_url?: string | null }): Promise<{ product?: Record<string, unknown>; error?: string }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await brandClient(userId, brandId);
  if (!client || typeof brandId !== "string" || !p) return { error: "Brand not found." };
  const { data: brand } = await supabaseAdmin.from("brand_profiles").select("id").eq("id", brandId).eq("client_id", client.id).maybeSingle();
  if (!brand) return { error: "Brand not found." };
  const name = cleanName(p.name, 100);
  if (!name) return { error: "Give it a name." };
  const storage = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/images/${client.id}/`;
  const row = {
    name,
    description: textOrNull(p.description, 300),
    price: typeof p.price === "number" && Number.isFinite(p.price) && p.price >= 0 && p.price < 1e9 ? p.price : null,
    currency: typeof p.currency === "string" && /^[A-Z]{3}$/.test(p.currency) ? p.currency : "KES",
    image_url: typeof p.image_url === "string" && p.image_url.startsWith(storage) ? p.image_url : null,
    updated_at: new Date().toISOString(),
  };
  const q = p.id
    ? supabaseAdmin.from("products").update(row).eq("id", p.id).eq("brand_id", brandId).eq("client_id", client.id).select("id, name, description, price, currency, image_url").single()
    : supabaseAdmin.from("products").insert({ ...row, client_id: client.id, brand_id: brandId }).select("id, name, description, price, currency, image_url").single();
  const { data, error } = await q;
  if (error || !data) return { error: "Couldn't save the product." };
  return { product: data };
}

export async function deleteProduct(brandId: string, productId: string): Promise<{ success?: boolean; error?: string }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await brandClient(userId, brandId);
  if (!client) return { error: "Brand not found." };
  const { data, error } = await supabaseAdmin.from("products").delete().eq("id", productId).eq("brand_id", brandId).eq("client_id", client.id).select("id");
  if (error || !Array.isArray(data) || data.length !== 1) return { error: "Product not found." };
  return { success: true };
}
