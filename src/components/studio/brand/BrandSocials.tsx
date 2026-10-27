"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Share2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { AutoPostBetaNote, BetaTag } from "@/components/studio/AutoPostBeta";

/**
 * Where this brand posts (2026-10-20: auto-posting has to follow the brand). The accounts
 * connected for this brand only, and the way to connect more (Settings > Social accounts, which
 * connects through Post For Me for the brand that's open).
 */
export function BrandSocials({ brandId, brandName, shared }: { brandId: string; brandName: string; shared: boolean }) {
  const [list, setList] = useState<Array<{ platform: string; account_name: string | null }> | null>(null);
  const { ownClientId } = useClient();
  const [checked, setChecked] = useState(0);
  // A quiet check with Post For Me first (2026-10-21), so an account connected elsewhere shows here.
  useEffect(() => {
    if (shared || !ownClientId) return;
    let alive = true;
    void fetch("/api/social-accounts/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: ownClientId, brandId }) })
      .catch(() => null).finally(() => { if (alive) setChecked((n) => n + 1); });
    return () => { alive = false; };
  }, [brandId, shared, ownClientId]);
  useEffect(() => {
    let alive = true;
    const q = shared
      ? supabase.rpc("brand_platforms", { p_brand: brandId })
      : supabase.from("social_accounts").select("platform, account_name").eq("brand_id", brandId).eq("is_active", true);
    void Promise.resolve(q).then(({ data }) => { if (alive) setList(((data ?? []) as Array<{ platform: string; account_name: string | null }>)); }, () => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [brandId, shared, checked]);
  return (
    <section id="socials" className="s-card p-5 md:p-6 scroll-mt-24">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[220px]">
          <h3 className="text-[16px] font-semibold flex items-center gap-2"><Share2 className="h-4 w-4" style={{ color: "var(--s-ai)" }} /> Where {brandName} posts <BetaTag /></h3>
          <p className="text-[13px] mt-1" style={{ color: "var(--s-soft)" }}>Posts on the calendar go out by themselves to this brand&apos;s own accounts, and only to them. Each brand connects its own.</p>
          <AutoPostBetaNote className="mt-1.5" />
        </div>
        {!shared && <Link href="/studio/account/settings#socials" className="s-btn primary sm">Connect accounts</Link>}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {list === null ? <span className="s-skel h-7 w-40" /> : list.length ? list.map((a) => <span key={`${a.platform}-${a.account_name}`} className="s-chip" aria-pressed="true">{a.platform}{a.account_name ? ` · ${a.account_name}` : ""}</span>)
          : <span className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>None yet. {shared ? "Only the owner can connect them." : "Connect Instagram, TikTok, Facebook, LinkedIn, X, YouTube and more."}</span>}
      </div>
    </section>
  );
}
