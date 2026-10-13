"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye, Loader2, LogOut, Users } from "lucide-react";
import { toast } from "sonner";
import { isSharedBrand, useBrandStore, type BrandProfile } from "@/app/store/useBrandStore";
import { ROLE_INFO, viewerCanOpen, type ShareRole } from "@/lib/brand-sharing";

/** Ask the brand list to reload (the top bar's useStudioBrands listens). */
export const reloadBrands = () => window.dispatchEvent(new Event("blink:brands"));

/** Accept an invite and make that brand the active one. Returns the brand, or throws with the reason. */
export async function acceptInvite(token: string): Promise<BrandProfile> {
  const res = await fetch("/api/brand-sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept", token }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.brand) throw new Error(data.error || "Couldn't join just now. Try again.");
  const brand: BrandProfile = data.brand;
  const { availableBrands, setAvailableBrands, setActiveBrand } = useBrandStore.getState();
  if (!availableBrands.some((b) => b.id === brand.id)) setAvailableBrands([...availableBrands, brand]);
  setActiveBrand(brand);
  return brand;
}

/**
 * While a shared brand is open: whose it is, your role, that work here uses their credits, and a
 * way out. Invites sent to your email show here too, until you accept or decline them.
 */
export function SharedBrandBar() {
  const { activeBrand, availableBrands, setActiveBrand } = useBrandStore();
  const [invites, setInvites] = useState<Array<{ token: string; role: ShareRole; brand: { name: string; logo: string | null }; inviter: string }>>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/brand-sharing?view=invites", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { invites: [] }))
      .then((d) => { if (live) setInvites(d.invites ?? []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  async function answer(token: string, accept: boolean) {
    setBusy(token);
    try {
      if (accept) {
        const brand = await acceptInvite(token);
        toast.success(`You're in. ${brand.brand_name} is open.`);
        reloadBrands();
      } else {
        await fetch("/api/brand-sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decline", token }) });
      }
      setInvites((list) => list.filter((i) => i.token !== token));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't do that. Try again.");
    } finally { setBusy(null); }
  }

  async function leave() {
    if (!isSharedBrand(activeBrand)) return;
    if (!window.confirm(`Leave ${activeBrand.brand_name}? You won't see it any more unless ${activeBrand.owner_name || "the owner"} invites you again.`)) return;
    setBusy("leave");
    const res = await fetch("/api/brand-sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave", brandId: activeBrand.id }) });
    setBusy(null);
    if (!res.ok) { toast.error("Couldn't leave just now. Try again."); return; }
    const rest = availableBrands.filter((b) => b.id !== activeBrand.id);
    useBrandStore.getState().setAvailableBrands(rest);
    setActiveBrand(rest.find((b) => !isSharedBrand(b)) ?? rest[0] ?? null);
    toast.success(`You left ${activeBrand.brand_name}.`);
    reloadBrands();
  }

  const shared = isSharedBrand(activeBrand) ? activeBrand : null;
  if (!shared && invites.length === 0) return null;
  return (
    <div className="grid gap-2 mb-4">
      {invites.map((i) => (
        <div key={i.token} className="s-card px-4 py-3 flex flex-wrap items-center gap-3" role="status" style={{ borderColor: "color-mix(in oklab, var(--s-ai) 35%, var(--s-line))" }}>
          <Users className="h-4 w-4 shrink-0" style={{ color: "var(--s-ai)" }} />
          <span className="flex-1 min-w-0 text-[13px]"><b>{i.inviter}</b> shared <b>{i.brand.name}</b> with you as {ROLE_INFO[i.role].label.toLowerCase()}.</span>
          <button className="s-btn sm ghost" disabled={!!busy} onClick={() => void answer(i.token, false)}>Decline</button>
          <button className="s-btn sm" disabled={!!busy} onClick={() => void answer(i.token, true)}>{busy === i.token ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Accept</button>
        </div>
      ))}
      {shared && (
        <div className="s-card px-4 py-2.5 flex flex-wrap items-center gap-3" data-testid="shared-brand-bar">
          {shared.role === "viewer" ? <Eye className="h-4 w-4 shrink-0" style={{ color: "var(--s-mute)" }} /> : <Users className="h-4 w-4 shrink-0" style={{ color: "var(--s-ai)" }} />}
          <span className="flex-1 min-w-0 text-[12.5px]" style={{ color: "var(--s-soft)" }}>
            <b style={{ color: "var(--s-text)" }}>{shared.brand_name}</b> is shared with you by {shared.owner_name || "its owner"}.{" "}
            {shared.role === "viewer" ? "You can look, not change anything." : "What you make here uses their credits."}
          </span>
          <span className="s-badge">{ROLE_INFO[shared.role].label}</span>
          <button className="s-btn ghost sm" disabled={busy === "leave"} onClick={() => void leave()}>{busy === "leave" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />} Leave</button>
        </div>
      )}
    </div>
  );
}

/** Viewers of a shared brand see a note instead of the pages that make or change things. */
export function ViewerGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { activeBrand } = useBrandStore();
  if (!isSharedBrand(activeBrand) || activeBrand.role !== "viewer" || viewerCanOpen(pathname)) return <>{children}</>;
  return (
    <div className="s-card p-6 grid gap-3 max-w-[560px] mx-auto mt-10 text-center justify-items-center">
      <Eye className="h-6 w-6" style={{ color: "var(--s-mute)" }} />
      <b className="text-[15px]">You can view {activeBrand.brand_name}, not make things for it</b>
      <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>
        {activeBrand.owner_name || "The owner"} shared it with you as a viewer. Ask them to make you an editor, or switch to one of your own brands.
      </p>
      <div className="flex gap-2">
        <Link href="/studio/library" className="s-btn sm">See its posts</Link>
        <Link href="/studio/plan" className="s-btn sm ghost">See the calendar</Link>
      </div>
    </div>
  );
}
