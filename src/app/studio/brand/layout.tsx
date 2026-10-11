"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brain, Archive, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BrandRefinementModal } from "@/components/brand/BrandRefinementModal";
import { archiveBrand } from "@/app/actions/brand";
import { useBrandStore } from "@/app/store/useBrandStore";

/**
 * Brand = the brand's DNA (identity, colours, fonts, voice, logo) plus "Teach the AI" (the classic
 * "Refine AI Brain") and archiving, which used to hide in the top bar and the brand menu.
 */
export default function BrandLayout({ children }: { children: React.ReactNode }) {
  const { activeBrand, availableBrands, setActiveBrand, setAvailableBrands } = useBrandStore();
  const [teaching, setTeaching] = useState(false);
  const [armed, setArmed] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function onArchive() {
    if (!activeBrand) return;
    if (!armed) { setArmed(true); return; }
    setArchiving(true);
    try {
      const result = await archiveBrand(activeBrand.id);
      if (result.error) throw new Error(result.error);
      const rest = availableBrands.filter((b) => b.id !== activeBrand.id);
      setAvailableBrands(rest);
      setActiveBrand(rest[0] ?? null);
      toast.success(`Archived "${activeBrand.brand_name || "Unnamed"}". Restore it any time from the brand menu → Manage brands.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not archive the brand. Please try again.");
    } finally {
      setArchiving(false);
      setArmed(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-6 max-w-[1180px] mx-auto">
        <span className="h-12 w-12 rounded-xl grid place-items-center overflow-hidden shrink-0" style={{ background: activeBrand?.logo_url ? "#fff" : "var(--s-raised)", border: "1px solid var(--s-line-2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {activeBrand?.logo_url ? <img src={activeBrand.logo_url} alt="" className="max-w-[80%] max-h-[80%] object-contain" /> : <span className="text-[16px] font-bold">{(activeBrand?.brand_name || "?").charAt(0)}</span>}
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: "var(--s-mute)" }}>Brand DNA</p>
          <h2 className="text-[22px] font-semibold leading-tight">{activeBrand?.brand_name || "No brand selected"}</h2>
        </div>
        <div className="flex-1" />
        <Link href="/studio/brand-builder" className="s-btn ghost"><Sparkles className="h-4 w-4" /> Build a new brand</Link>
        {activeBrand && (
          <>
            <button className="s-btn ai" onClick={() => setTeaching(true)}>
              <Brain className="h-4 w-4" /> Teach the AI
            </button>
            <button className="s-btn ghost" onClick={onArchive} disabled={archiving} style={armed ? { color: "var(--s-danger)" } : undefined}>
              {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              {armed ? "Archive? Click again" : "Archive brand"}
            </button>
          </>
        )}
      </div>
      <div className="max-w-[1180px] mx-auto">{children}</div>
      <BrandRefinementModal open={teaching} onOpenChange={setTeaching} />
    </>
  );
}
