"use server";

import { supabaseAdmin } from "@/lib/supabase-server";

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
}> {
  // Step 1: Ensure a master client record exists
  let clientId: string;

  const { data: existingClient } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (existingClient) {
    clientId = existingClient.id;
  } else {
    const { data: newClient, error: clientError } = await supabaseAdmin
      .from("clients")
      .insert({
        user_id: input.userId,
        contact_name: input.contactName,
        company_name: "Master Account",
        contact_email: "user@brand.com",
        plan_tier: "starter" as const,
      })
      .select("id")
      .single();

    if (clientError) {
      return { error: clientError.message };
    }
    clientId = newClient.id;
  }

  // Step 2: Insert the brand profile (all business info is isolated here)
  const { data: newBrand, error: brandError } = await supabaseAdmin
    .from("brand_profiles")
    .insert({
      client_id: clientId,
      brand_name: input.brandName,
      company_name: input.companyName || input.brandName,
      industry: input.industry,
      description: input.description,
      website_url: input.websiteUrl,
      social_urls: input.socialUrls,
      visual_style_guide: input.visualStyleGuide,
      brand_voice: input.brandVoice,
      primary_color: input.primaryColor,
      secondary_color: input.secondaryColor,
      accent_color: input.accentColor,
      additional_colors: [input.additionalColor],
      primary_font: input.primaryFont,
      tone_keywords: input.toneKeywords,
      is_active: true,
      logo_url: input.logoUrl,
      uploaded_assets: input.uploadedAssets.length > 0 ? input.uploadedAssets : [],
    })
    .select("id")
    .single();

  if (brandError) {
    return { error: brandError.message };
  }

  return { brandId: newBrand.id, clientId };
}

// ────────────────────────────────────────────────
// 2. Save Brand Profile (from BrandIdentityPage)
// ────────────────────────────────────────────────

export async function saveBrandProfile(
  brandId: string,
  data: SaveBrandProfileInput
): Promise<{ success?: boolean; error?: string }> {
  const { error } = await supabaseAdmin
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
      dos: data.dos.join("\n"),
      donts: data.donts.join("\n"),
    })
    .eq("id", brandId);

  if (error) {
    return { error: error.message };
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
}> {
  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .insert({
      client_id: clientId,
      brand_name: brandName,
      primary_color: "#2563EB",
      secondary_color: "#F59E0B",
      accent_color: "#10B981",
    })
    .select("id, brand_name, logo_url")
    .single();

  if (error) {
    return { error: error.message };
  }

  return { brand: data };
}
