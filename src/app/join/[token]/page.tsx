"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Briefcase, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AuthShell } from "@/components/auth/AuthShell";
import { acceptInvite } from "@/components/studio/sharing/SharedBrand";
import { ROLE_INFO, type ShareRole } from "@/lib/brand-sharing";
import { UI_COOKIE } from "@/lib/studio-routes";

type Preview = { brand: { name: string; logo: string | null }; inviter: string; role: ShareRole; status: "open" | "used" | "expired" | "revoked" | "archived"; emailHint: string | null };

const CLOSED: Record<Exclude<Preview["status"], "open">, string> = {
  used: "This link has already been used. Each link lets one person in. Ask for a new one.",
  expired: "This invite has expired. Ask for a new one.",
  revoked: "This invite was cancelled. Ask for a new one if you still need access.",
  archived: "That brand isn't available any more.",
};

/**
 * Accept a shared brand (2026-10-13). Anyone with the link sees whose brand it is and the role; to
 * join they sign in or create a free account (and come straight back here), then one tap.
 */
export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [joining, setJoining] = useState(false);
  const here = `/join/${token}`;

  useEffect(() => {
    fetch(`/api/brand-sharing?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (r.ok) setPreview(d); else setError(d.error || "This invite link isn't valid."); })
      .catch(() => setError("Couldn't load the invite. Check your connection and try again."));
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, [token]);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      await acceptInvite(token);
      // Shared brands live in the new look.
      document.cookie = `${UI_COOKIE}=studio; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      router.push("/studio");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join just now. Try again.");
      setJoining(false);
    }
  }

  if (!preview && !error) return <div className="min-h-dvh grid place-items-center" style={{ background: "#0C0D0F" }}><Loader2 className="h-6 w-6 animate-spin text-white/50" /></div>;

  const open = preview?.status === "open";
  return (
    <AuthShell
      title={preview ? `Join ${preview.brand.name}` : "Invite link"}
      subtitle={preview ? `${preview.inviter} invited you to work on ${preview.brand.name} on BlinkSpot.` : "Something's not right with this link."}
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
              <span className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>As {ROLE_INFO[preview.role].label.toLowerCase()}: {ROLE_INFO[preview.role].line.replace("your credits", `${preview.inviter}'s credits`)}</span>
            </div>
          </div>
        )}
        {preview && !open && <p className="text-[13.5px]" style={{ color: "var(--s-warn)" }}>{CLOSED[preview.status as Exclude<Preview["status"], "open">]}</p>}
        {preview?.emailHint && open && <p className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>This invite is for {preview.emailHint}. Use that email to join.</p>}
        {error && <p className="text-[13.5px]" role="alert" style={{ color: "var(--s-danger)" }}>{error}</p>}
        {open && signedIn && (
          <button className="s-btn primary justify-center" style={{ height: 44 }} disabled={joining} onClick={() => void join()}>
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Join {preview.brand.name} <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {open && signedIn === false && (
          <Link href={`/get-started?redirect=${encodeURIComponent(here)}`} className="s-btn primary justify-center" style={{ height: 44 }}>
            Create a free account to join <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        {!open && signedIn && <Link href="/studio" className="s-btn justify-center" style={{ height: 44 }}>Go to the studio</Link>}
        <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>You&apos;ll only see this brand. {preview?.inviter ?? "The owner"} can remove access any time, and you can leave whenever you like.</p>
      </div>
    </AuthShell>
  );
}
