"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Briefcase, Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AuthShell } from "@/components/auth/AuthShell";
import { useBrandStore } from "@/app/store/useBrandStore";
import { UI_COOKIE } from "@/lib/studio-routes";

type Preview = {
  brand: { name: string; logo: string | null }; from: string; emailHint: string; keepAccess: boolean;
  status: "open" | "done" | "expired" | "cancelled" | "archived"; counts: { posts: number; products: number };
};

const CLOSED: Record<Exclude<Preview["status"], "open">, string> = {
  done: "This brand has already been handed over.",
  expired: "This handover link has expired. Ask for a new one.",
  cancelled: "This handover was cancelled.",
  archived: "That brand isn't available any more.",
};

/**
 * Accept a brand handed to you (2026-10-16). Says exactly what moves and what changes (your credits
 * from now on, one of your brand slots, social accounts to connect again), then one tap.
 */
export default function TransferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const here = `/transfer/${token}`;

  useEffect(() => {
    fetch(`/api/brand-transfer?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (r.ok) setPreview(d); else setError(d.error || "This link isn't valid."); })
      .catch(() => setError("Couldn't load the handover. Check your connection and try again."));
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, [token]);

  async function act(action: "accept" | "decline") {
    setBusy(action); setError(null);
    try {
      const res = await fetch("/api/brand-transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, token }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Something went wrong. Try again.");
      if (action === "decline") { setPreview((p) => (p ? { ...p, status: "cancelled" } : p)); return; }
      const { availableBrands, setAvailableBrands, setActiveBrand } = useBrandStore.getState();
      const brand = { ...d.brand, role: "owner" as const };
      setAvailableBrands([...availableBrands.filter((b) => b.id !== brand.id), brand]);
      setActiveBrand(brand);
      document.cookie = `${UI_COOKIE}=studio; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      router.push("/studio/brand");
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(null); }
  }

  if (!preview && !error) return <div className="min-h-dvh grid place-items-center" style={{ background: "#0C0D0F" }}><Loader2 className="h-6 w-6 animate-spin text-white/50" /></div>;
  const open = preview?.status === "open";
  return (
    <AuthShell
      title={preview ? `Take over ${preview.brand.name}` : "Brand handover"}
      subtitle={preview ? `${preview.from} wants to hand ${preview.brand.name} to you on BlinkSpot.` : "Something's not right with this link."}
      footer={signedIn === false && open ? <>Already have an account? <Link href={`/login?redirect=${encodeURIComponent(here)}`} className="underline" style={{ color: "var(--s-text)" }}>Sign in</Link></> : undefined}
    >
      <div className="grid gap-4">
        {preview && (
          <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)" }}>
            <span className="h-11 w-11 rounded-lg overflow-hidden grid place-items-center shrink-0" style={{ background: "#fff" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview.brand.logo ? <img src={preview.brand.logo} alt="" className="h-full w-full object-contain p-1" /> : <Briefcase className="h-5 w-5 text-black/60" />}
            </span>
            <div className="min-w-0">
              <b className="block truncate">{preview.brand.name}</b>
              <span className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>{preview.counts.posts} post{preview.counts.posts === 1 ? "" : "s"} · {preview.counts.products} product{preview.counts.products === 1 ? "" : "s"}</span>
            </div>
          </div>
        )}
        {preview && open && (
          <ul className="grid gap-1.5 text-[13px]" style={{ color: "var(--s-soft)" }}>
            {[
              "The brand becomes yours: its posts, products, website, research and settings.",
              "From now on, what's made for it uses your credits, and it takes one of your brand slots.",
              "Social accounts aren't handed over: connect your own in Settings.",
              preview.keepAccess ? `${preview.from} stays on as an editor (you can remove them any time).` : `${preview.from} won't have access any more.`,
            ].map((t) => <li key={t} className="flex gap-2"><Check className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--s-ok)" }} />{t}</li>)}
          </ul>
        )}
        {preview && !open && <p className="text-[13.5px]" style={{ color: "var(--s-warn)" }}>{CLOSED[preview.status as Exclude<Preview["status"], "open">]}</p>}
        {preview && open && <p className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>This handover is for {preview.emailHint}. Use that email.</p>}
        {error && <p className="text-[13.5px]" role="alert" style={{ color: "var(--s-danger)" }}>{error}</p>}
        {open && signedIn && (
          <div className="grid gap-2">
            <button className="s-btn primary justify-center" style={{ height: 44 }} disabled={!!busy} onClick={() => void act("accept")}>
              {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Accept {preview.brand.name} <ArrowRight className="h-4 w-4" />
            </button>
            <button className="s-btn ghost justify-center" disabled={!!busy} onClick={() => void act("decline")}>{busy === "decline" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} No thanks</button>
          </div>
        )}
        {open && signedIn === false && (
          <Link href={`/get-started?redirect=${encodeURIComponent(here)}`} className="s-btn primary justify-center" style={{ height: 44 }}>
            Create a free account to accept <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        {!open && signedIn && <Link href="/studio" className="s-btn justify-center" style={{ height: 44 }}>Go to the studio</Link>}
      </div>
    </AuthShell>
  );
}
