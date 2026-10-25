import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-server";
import { SiteRenderer } from "@/components/sites/SiteRenderer";
import type { SiteSpec } from "@/lib/sites/spec";
import { workspaceNeedsStamp } from "@/lib/stamp-server";

/** A brand's published landing page: blinkspot.io/s/<slug>. Only published sites are served. */
export const revalidate = 60;

async function loadSite(slug: string): Promise<{ spec: SiteSpec; clientId: string } | null> {
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) return null;
  // The published snapshot, not the draft the builder autosaves to.
  const { data } = await supabaseAdmin.from("sites").select("published_spec, client_id").eq("slug", slug).eq("published", true).maybeSingle();
  const spec = data?.published_spec as SiteSpec | undefined;
  return spec && Array.isArray(spec.sections) ? { spec, clientId: data!.client_id as string } : null;
}
const load = async (slug: string) => (await loadSite(slug))?.spec ?? null;

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
  const site = await loadSite((await params).slug);
  if (!site) notFound();
  // A free account's page carries a small "Made with BlinkSpot" badge (lib/stamp.ts).
  const badge = await workspaceNeedsStamp(site.clientId);
  return (
    <>
      <SiteRenderer spec={site.spec} />
      {badge && (
        <a href="https://www.blinkspot.io/?ref=site" target="_blank" rel="noopener" data-blink-badge
          style={{ position: "fixed", right: 14, bottom: 14, zIndex: 2147483647, display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px 7px 9px", borderRadius: 999, background: "rgba(12,13,15,.86)", color: "#fff", font: "600 12.5px/1 system-ui, -apple-system, sans-serif", textDecoration: "none", border: "1px solid rgba(255,255,255,.18)", boxShadow: "0 4px 14px rgba(0,0,0,.25)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-lime.png" alt="" width={16} height={16} style={{ height: 16, width: 16, objectFit: "contain" }} />Made with BlinkSpot
        </a>
      )}
    </>
  );
}
