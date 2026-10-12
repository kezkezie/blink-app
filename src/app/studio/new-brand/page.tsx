"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { getBrandAllowance } from "@/app/actions/brand";
import { BrandQuickStart } from "@/components/studio/brand/BrandQuickStart";

/** A new brand, the same two screens as sign-up (2026-10-12; the classic modal stays in Vintage). */
export default function NewBrandPage() {
  const router = useRouter();
  const { clientId } = useClient();
  const { availableBrands, setAvailableBrands, setActiveBrand } = useBrandStore();
  const [allowed, setAllowed] = useState<null | { ok: true } | { ok: false; text: string }>(null);

  useEffect(() => {
    getBrandAllowance().then((a) => {
      if ("error" in a) setAllowed({ ok: false, text: a.error });
      else if (!a.canCreate) setAllowed({ ok: false, text: `You're using ${a.used} of ${a.limit} brand${a.limit === 1 ? "" : "s"} on your plan.` });
      else setAllowed({ ok: true });
    });
  }, []);

  if (!clientId || !allowed) return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--s-mute)" }} /></div>;
  if (!allowed.ok) {
    return (
      <div className="s-empty max-w-[560px] mx-auto mt-10">
        <h3>No free brand slot</h3>
        <p className="text-[13px]">{allowed.text} Upgrade for more brands (Starter has 3), or archive one in Manage brands.</p>
        <div className="flex gap-2 justify-center mt-3"><Link href="/studio/account/billing" className="s-btn primary sm">See plans</Link><Link href="/studio/brand" className="s-btn sm">Back</Link></div>
      </div>
    );
  }
  return (
    <div className="max-w-[640px] mx-auto px-1 md:px-0 py-4 md:py-8">
      <BrandQuickStart
        clientId={clientId}
        intro="new"
        onBuild={() => router.push("/studio/brand-builder")}
        onDone={(r) => {
          const brand = { id: r.brandId, brand_name: r.name, logo_url: r.logo };
          setAvailableBrands([...availableBrands.filter((b) => b.id !== brand.id), brand]);
          setActiveBrand(brand);
          toast.success(`${r.name} is ready. Fill in products and contacts here any time.`);
          router.replace("/studio/brand");
        }}
      />
    </div>
  );
}
