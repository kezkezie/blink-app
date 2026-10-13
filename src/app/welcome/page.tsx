"use client";

import "@/app/studio/studio.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { Dictation } from "@/components/studio/Dictation";
import { BrandQuickStart } from "@/components/studio/brand/BrandQuickStart";
import { acceptInvite } from "@/components/studio/sharing/SharedBrand";
import { ROLE_INFO, type ShareRole } from "@/lib/brand-sharing";
import { toast } from "sonner";

/**
 * After sign-up (2026-10-12): two screens, not six. A website or Instagram fills the brand in, the
 * person checks one card, and they're in. Products, contacts and the rest wait for the Brand page.
 * People without a brand go to the brand builder. Skipping lands in the studio with "Create your
 * brand" waiting.
 */
export default function WelcomePage() {
  const router = useRouter();
  const { ownClientId: clientId, loading } = useClient();
  const { setActiveBrand, setAvailableBrands } = useBrandStore();
  const [firstName, setFirstName] = useState("");
  const [invites, setInvites] = useState<Array<{ token: string; role: ShareRole; brand: { name: string; logo: string | null }; inviter: string }>>([]);
  const [joining, setJoining] = useState<string | null>(null);

  // Signed out → sign in. Already set up (has a brand) → straight into the studio.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace("/login?redirect=/welcome"); return; }
      setFirstName(String(user.user_metadata?.full_name || "").split(" ")[0]);
    });
  }, [router]);
  useEffect(() => {
    if (!clientId) return;
    // A brand of their own, or one someone shared with them, means they're set up.
    Promise.all([
      supabase.from("brand_profiles").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("is_active", true),
      supabase.rpc("my_shared_brands"),
    ]).then(([own, shared]) => {
      if ((own.count ?? 0) > 0 || ((shared.data as unknown[] | null)?.length ?? 0) > 0) router.replace("/studio");
    });
    // Invited by email: offer the shared brand before asking them to set up their own.
    fetch("/api/brand-sharing?view=invites", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { invites: [] }))
      .then((d) => setInvites(d.invites ?? []))
      .catch(() => {});
  }, [clientId, router]);

  async function join(token: string) {
    setJoining(token);
    try {
      await acceptInvite(token);
      await done();
      router.replace("/studio");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't join just now. Try again.");
      setJoining(null);
    }
  }

  const done = () => supabase.auth.updateUser({ data: { onboarding_completed: true } }).catch(() => {});

  if (loading || !clientId) return <div className="studio min-h-dvh grid place-items-center" style={{ background: "var(--s-bg)" }}><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--s-mute)" }} /></div>;
  return (
    <div className="studio min-h-dvh" style={{ background: "radial-gradient(90% 60% at 50% -10%, color-mix(in oklab, var(--s-accent) 9%, transparent), transparent 60%), var(--s-bg)", color: "var(--s-text)" }}>
      <header className="flex items-center gap-3 px-6 py-5 max-w-[880px] mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark-lime.png" alt="BlinkSpot" className="h-8 w-8 object-contain" />
        <div className="flex-1" />
        <Link href="/studio" onClick={() => void done()} className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>Skip for now</Link>
      </header>
      <main className="max-w-[640px] mx-auto px-6 pb-20 pt-4 md:pt-10">
        {invites.length > 0 && (
          <div className="grid gap-2 mb-8">
            {invites.map((i) => (
              <div key={i.token} className="s-card p-4 flex flex-wrap items-center gap-3" style={{ borderColor: "color-mix(in oklab, var(--s-ai) 35%, var(--s-line))" }}>
                <span className="flex-1 min-w-0 text-[14px]"><b>{i.inviter}</b> shared <b>{i.brand.name}</b> with you as {ROLE_INFO[i.role].label.toLowerCase()}.</span>
                <button className="s-btn primary sm" disabled={!!joining} onClick={() => void join(i.token)}>
                  {joining === i.token ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Join {i.brand.name}
                </button>
              </div>
            ))}
            <p className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>Or set up a brand of your own below.</p>
          </div>
        )}
        <BrandQuickStart
          clientId={clientId}
          firstName={firstName}
          intro="signup"
          onBuild={async () => { await done(); router.push("/studio/brand-builder"); }}
          onDone={async (r) => {
            await done();
            const brand = { id: r.brandId, brand_name: r.name, logo_url: r.logo };
            setAvailableBrands([brand]);
            setActiveBrand(brand);
            router.replace(r.style === "auto" ? "/studio?welcome=auto" : "/studio?welcome=pro");
          }}
        />
      </main>
      <Dictation />
    </div>
  );
}
