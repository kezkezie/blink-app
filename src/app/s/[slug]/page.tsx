import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-server";
import { SiteRenderer } from "@/components/sites/SiteRenderer";
import type { SiteSpec } from "@/lib/sites/spec";

/** A brand's published landing page: blinkspot.io/s/<slug>. Only published sites are served. */
export const revalidate = 60;

async function load(slug: string): Promise<SiteSpec | null> {
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) return null;
  // The published snapshot, not the draft the builder autosaves to.
  const { data } = await supabaseAdmin.from("sites").select("published_spec").eq("slug", slug).eq("published", true).maybeSingle();
  const spec = data?.published_spec as SiteSpec | undefined;
  return spec && Array.isArray(spec.sections) ? spec : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const spec = await load((await params).slug);
  if (!spec) return { title: "Not found" };
  const hero = spec.sections.find((s) => s.type === "hero");
  const image = hero && "imageId" in hero ? spec.images.find((i) => i.id === hero.imageId)?.url : spec.images[0]?.url;
  return {
    title: spec.seo.title || spec.brand.name,
    description: spec.seo.description,
    openGraph: { title: spec.seo.title || spec.brand.name, description: spec.seo.description, images: image ? [{ url: image }] : undefined, type: "website" },
    icons: spec.brand.logoUrl ? { icon: spec.brand.logoUrl } : undefined,
  };
}

export default async function PublishedSite({ params }: { params: Promise<{ slug: string }> }) {
  const spec = await load((await params).slug);
  if (!spec) notFound();
  return <SiteRenderer spec={spec} />;
}
