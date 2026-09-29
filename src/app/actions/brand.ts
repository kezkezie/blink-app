"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getLimitForTier } from "@/lib/limits";

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

export async function getBrandAllowance(): Promise<{ used: number; limit: number; canCreate: boolean } | { error: string }> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Please sign in again." };
  const client = await ownedClient(userId);
  // No client row yet = brand-new user about to create their first brand.
  if (!client) {
    const limit = getLimitForTier("free").maxBrands;
    return { used: 0, limit, canCreate: limit > 0 };
  }
  const limit = getLimitForTier(client.plan_tier).maxBrands;
  const used = await activeBrandCount(client.id);
  if (used === null) return { error: "Could not check your brand allowance." };
  return { used, limit, canCreate: used < limit };
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
