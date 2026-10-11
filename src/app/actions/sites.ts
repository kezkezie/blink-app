"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase-server";
import { loadBrandBrain } from "@/lib/sites/brain";
import { slugify, validateSpec, type SiteSpec } from "@/lib/sites/spec";

/** Landing pages: read, save edits, refresh brand data, publish at /s/<slug>. Scoped to the caller. */

async function owner(): Promise<{ clientId: string } | null> {
  const store = await cookies();
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => store.getAll(), setAll: () => {} } });
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const { data: client } = await supabaseAdmin.from("clients").select("id").eq("user_id", data.user.id).maybeSingle();
  return client?.id ? { clientId: client.id as string } : null;
}

type SiteRow = { spec: SiteSpec | null; slug: string | null; published: boolean; suggestedSlug: string };

export async function getSite(brandId: string): Promise<SiteRow | { error: string }> {
  const o = await owner();
  if (!o) return { error: "Please sign in again." };
  const { data: brand } = await supabaseAdmin.from("brand_profiles").select("brand_name").eq("id", brandId).eq("client_id", o.clientId).maybeSingle();
  if (!brand) return { error: "Brand not found." };
  const { data } = await supabaseAdmin.from("sites").select("spec, slug, published").eq("brand_id", brandId).eq("client_id", o.clientId).maybeSingle();
  const spec = data?.spec && Array.isArray((data.spec as SiteSpec).sections) ? (data.spec as SiteSpec) : null;
  return { spec, slug: data?.slug ?? null, published: !!data?.published, suggestedSlug: slugify(String(brand.brand_name || "my-brand")) };
}

/** Save edits from the builder. Images, products and contact always come from the stored copy, never the browser. */
export async function saveSite(brandId: string, edited: unknown): Promise<{ spec?: SiteSpec; error?: string }> {
  const o = await owner();
  if (!o) return { error: "Please sign in again." };
  const { data } = await supabaseAdmin.from("sites").select("id, spec").eq("brand_id", brandId).eq("client_id", o.clientId).maybeSingle();
  if (!data?.spec) return { error: "Build the page first." };
  const stored = data.spec as SiteSpec;
  const spec = validateSpec(edited, { brand: stored.brand, theme: stored.theme, images: stored.images, products: stored.products, contact: stored.contact });
  const { error } = await supabaseAdmin.from("sites").update({ spec, updated_at: new Date().toISOString() }).eq("id", data.id);
  if (error) return { error: "Couldn't save." };
  return { spec };
}

/** Pull the latest brand facts, products, contacts and Library images into the page (copy is kept). */
export async function refreshSiteData(brandId: string): Promise<{ spec?: SiteSpec; error?: string }> {
  const o = await owner();
  if (!o) return { error: "Please sign in again." };
  const [{ data }, brain] = await Promise.all([
    supabaseAdmin.from("sites").select("id, spec").eq("brand_id", brandId).eq("client_id", o.clientId).maybeSingle(),
    loadBrandBrain(o.clientId, brandId),
  ]);
  if (!data?.spec || !brain) return { error: "Build the page first." };
  const stored = data.spec as SiteSpec;
  const spec = validateSpec(stored, { brand: { name: brain.name, logoUrl: brain.logoUrl, tagline: brain.tagline }, theme: stored.theme, images: brain.images, products: brain.products, contact: brain.contact });
  await supabaseAdmin.from("sites").update({ spec, updated_at: new Date().toISOString() }).eq("id", data.id);
  return { spec };
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
const RESERVED = new Set(["admin", "api", "app", "studio", "dashboard", "login", "blinkspot", "www", "help", "support", "s"]);

export async function publishSite(brandId: string, slugInput: string): Promise<{ slug?: string; error?: string }> {
  const o = await owner();
  if (!o) return { error: "Please sign in again." };
  const slug = slugify(slugInput);
  if (!SLUG.test(slug) || RESERVED.has(slug)) return { error: "Pick another address: 3 to 48 letters, numbers or dashes." };
  const { data } = await supabaseAdmin.from("sites").select("id").eq("brand_id", brandId).eq("client_id", o.clientId).maybeSingle();
  if (!data) return { error: "Build the page first." };
  const { error } = await supabaseAdmin.from("sites").update({ slug, published: true, published_at: new Date().toISOString() }).eq("id", data.id);
  if (error) return { error: error.code === "23505" ? "That address is taken. Try another." : "Couldn't publish." };
  return { slug };
}

export async function unpublishSite(brandId: string): Promise<{ success?: boolean; error?: string }> {
  const o = await owner();
  if (!o) return { error: "Please sign in again." };
  const { error } = await supabaseAdmin.from("sites").update({ published: false }).eq("brand_id", brandId).eq("client_id", o.clientId);
  return error ? { error: "Couldn't unpublish." } : { success: true };
}
