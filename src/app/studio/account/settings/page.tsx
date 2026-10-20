"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Unplug, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { isSharedBrand, useBrandStore } from "@/app/store/useBrandStore";
import { Modal } from "@/components/studio/Modal";
import { PlatformGlyph } from "@/components/studio/plan/PlatformGlyph";
import { FormSkeleton } from "@/components/studio/Skeletons";

/**
 * Settings & social accounts in the studio look (2026-10-11; classic stays at /dashboard/settings).
 * Each brand has its own social accounts (posts only go to the post's brand). Connecting goes through
 * PostForMe; it sends people back here with ?success=account_connected, and we sync.
 * The classic page sent the private connect link to a third-party QR-code site; this one offers
 * "copy link" for opening it on a phone instead.
 */
type Social = { id: string; platform: string; account_name: string | null; is_active: boolean; connected_at: string; postforme_account_id: string | null };

const PLATFORMS: Array<{ id: string; label: string; note?: string }> = [
  { id: "instagram", label: "Instagram", note: "Business or creator account" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "facebook", label: "Facebook", note: "A Page you manage" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "pinterest", label: "Pinterest" },
  { id: "threads", label: "Threads" },
  { id: "bluesky", label: "Bluesky" },
];
const norm = (p: string) => (p === "x" ? "twitter" : p.toLowerCase());

function SettingsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { ownClientId: clientId, loading } = useClient();
  const { activeBrand } = useBrandStore();
  const [socials, setSocials] = useState<Social[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [auth, setAuth] = useState<{ platform: string; url: string } | null>(null);
  const [removing, setRemoving] = useState<Social | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [profile, setProfile] = useState({ contact_name: "", contact_email: "", contact_phone: "" });
  const [savedProfile, setSavedProfile] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase.from("clients").select("contact_name, contact_email, contact_phone").eq("id", clientId).maybeSingle();
    if (data) { const p = { contact_name: data.contact_name ?? "", contact_email: data.contact_email ?? "", contact_phone: data.contact_phone ?? "" }; setProfile(p); setSavedProfile(JSON.stringify(p)); }
    if (isSharedBrand(activeBrand)) {
      // A shared brand's accounts belong to its owner; members see which are connected, no tokens.
      const { data: s } = await supabase.rpc("brand_platforms", { p_brand: activeBrand.id });
      setSocials(((s ?? []) as Array<{ platform: string; account_name: string | null }>).map((a, i) => ({ id: `shared-${i}`, platform: a.platform, account_name: a.account_name, is_active: true, connected_at: null, postforme_account_id: null }) as unknown as Social));
    } else if (activeBrand) {
      const { data: s } = await supabase.from("social_accounts").select("id, platform, account_name, is_active, connected_at, postforme_account_id").eq("brand_id", activeBrand.id).order("connected_at");
      setSocials((s ?? []) as Social[]);
    } else setSocials([]);
  }, [clientId, activeBrand]);
  useEffect(() => { void load(); }, [load]);

  const sync = useCallback(async (quiet = false) => {
    if (!clientId || !activeBrand) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/social-accounts/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, brandId: activeBrand.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't sync your accounts.");
      await load();
      const n = data.accounts?.length ?? 0;
      if (!quiet || n) toast.success(n ? `${n} account${n === 1 ? "" : "s"} connected for ${activeBrand.brand_name}.` : "No connected accounts found yet.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't sync your accounts."); }
    finally { setSyncing(false); }
  }, [clientId, activeBrand, load]);

  // Back from PostForMe's connect screen.
  useEffect(() => {
    if (!clientId || !activeBrand || search.get("success") !== "account_connected") return;
    const failed = search.get("isSuccess") === "false" || search.get("error");
    if (failed) toast.error(`${search.get("provider") || "The"} connection didn't finish${search.get("error") ? `: ${decodeURIComponent(search.get("error")!).replace(/\+/g, " ")}` : "."}`);
    else void sync();
    router.replace("/studio/account/settings", { scroll: false });
  }, [clientId, activeBrand, search, sync, router]);

  async function connect(platform: string) {
    if (!clientId || !activeBrand) return;
    setConnecting(platform);
    try {
      const res = await fetch("/api/social-accounts/auth-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform, clientId, brandId: activeBrand.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't start the connection.");
      setAuth({ platform, url: data.url });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start the connection."); }
    finally { setConnecting(null); }
  }
  async function disconnect(s: Social) {
    setBusy(s.id);
    try {
      const res = await fetch("/api/social-accounts/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: s.postforme_account_id, supabaseAccountId: s.id }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't disconnect it.");
      setSocials((x) => x?.filter((y) => y.id !== s.id) ?? x);
      toast.success("Disconnected. Scheduled posts for it won't go out.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't disconnect it."); }
    finally { setBusy(null); setRemoving(null); }
  }
  async function saveProfile() {
    if (!clientId) return;
    setSaving(true);
    const { error: authError } = await supabase.auth.updateUser({ data: { full_name: profile.contact_name } });
    const { error } = await supabase.from("clients").update({ contact_name: profile.contact_name, contact_phone: profile.contact_phone }).eq("id", clientId);
    setSaving(false);
    if (error || authError) { toast.error("Couldn't save your details."); return; }
    setSavedProfile(JSON.stringify(profile));
    toast.success("Saved.");
    router.refresh();
  }

  if (loading || socials === null) return <FormSkeleton />;
  const shared = isSharedBrand(activeBrand);
  const byPlatform = (p: string) => socials.filter((s) => norm(s.platform) === p);
  const connectedCount = socials.filter((s) => s.is_active).length;
  const profileDirty = JSON.stringify(profile) !== savedProfile;

  return (
    <div className="grid gap-8 s-reading max-w-[1000px]">
      <section id="socials" className="scroll-mt-24">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <h2 className="text-[18px] font-semibold">Social accounts</h2>
            <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>{shared ? <>For <b style={{ color: "var(--s-text)" }}>{activeBrand.brand_name}</b>, shared with you by {activeBrand.owner_name || "its owner"}. Only they can connect or remove its accounts; you can post to the ones below.</> : activeBrand ? <>For <b style={{ color: "var(--s-text)" }}>{activeBrand.brand_name}</b>. Each brand has its own accounts, and posts only go to their own brand&apos;s.</> : "Pick a brand in the top bar first."}</p>
          </div>
          <div className="flex-1" />
          <span className="s-pill"><b>{connectedCount}</b> connected</span>
          {!shared && <button className="s-btn sm" disabled={syncing || !activeBrand} onClick={() => void sync()}>{syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync</button>}
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORMS.map((p) => {
            const accounts = byPlatform(p.id);
            const on = accounts.some((a) => a.is_active);
            return (
              <div key={p.id} className="s-card p-4 grid gap-3 content-start" style={{ borderColor: on ? "color-mix(in oklab, var(--s-ok) 35%, var(--s-line))" : undefined }}>
                <div className="flex items-center gap-2.5">
                  <span className="h-9 w-9 rounded-lg grid place-items-center shrink-0" style={{ background: on ? "color-mix(in oklab, var(--s-ok) 14%, transparent)" : "var(--s-raised)", color: on ? "var(--s-ok)" : "var(--s-soft)" }}><PlatformGlyph platform={p.id} size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <b className="text-[14px] block">{p.label}</b>
                    <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>{on ? "Connected" : p.note ?? "Not connected"}</span>
                  </div>
                  {on && <Check className="h-4 w-4" style={{ color: "var(--s-ok)" }} />}
                </div>
                {accounts.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)" }}>
                    <span className="flex-1 min-w-0 truncate">{a.account_name || "Account"}</span>
                    {!a.is_active && <span className="s-badge warn">inactive</span>}
                    {!shared && <button className="s-btn ghost sm" style={{ height: 24 }} disabled={busy === a.id} onClick={() => setRemoving(a)} aria-label={`Disconnect ${a.account_name || p.label}`}>{busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />}</button>}
                  </div>
                ))}
                {!shared && <button className={`s-btn sm${on ? " ghost" : ""}`} disabled={!activeBrand || connecting === p.id} onClick={() => connect(p.id)}>
                  {connecting === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{on ? "Add another" : `Connect ${p.label}`}
                </button>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="s-card p-5 grid gap-4 max-w-[640px]">
        <div>
          <h2 className="text-[16px] font-semibold">Your details</h2>
          <p className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>For your account and receipts. Not shown on your content.</p>
        </div>
        <label className="grid gap-1.5"><span className="s-label" style={{ margin: 0 }}>Name</span><input className="s-input" value={profile.contact_name} onChange={(e) => setProfile({ ...profile, contact_name: e.target.value })} aria-label="Name" /></label>
        <label className="grid gap-1.5"><span className="s-label" style={{ margin: 0 }}>Sign-in email</span><input className="s-input" value={profile.contact_email} readOnly aria-label="Sign-in email" style={{ color: "var(--s-soft)" }} /></label>
        <label className="grid gap-1.5"><span className="s-label" style={{ margin: 0 }}>Phone</span><input className="s-input" inputMode="tel" value={profile.contact_phone} onChange={(e) => setProfile({ ...profile, contact_phone: e.target.value })} placeholder="Optional" aria-label="Phone" /></label>
        <button className="s-btn primary justify-self-start" disabled={!profileDirty || saving} onClick={saveProfile}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</button>
      </section>

      <Modal open={!!auth} onClose={() => setAuth(null)} label="Connect an account" width={460} padded>
        {auth && (
          <>
            <div className="flex items-center justify-between mb-2"><b className="text-[15px] flex items-center gap-2"><PlatformGlyph platform={auth.platform} size={16} /> Connect {PLATFORMS.find((p) => p.id === auth.platform)?.label}</b><button className="s-btn ghost sm" onClick={() => setAuth(null)} aria-label="Close"><X className="h-4 w-4" /></button></div>
            <p className="text-[13px] mb-4" style={{ color: "var(--s-soft)" }}>You&apos;ll sign in on {PLATFORMS.find((p) => p.id === auth.platform)?.label} and allow BlinkSpot to post for {activeBrand?.brand_name}. You come back here when it&apos;s done.</p>
            <div className="grid gap-2">
              <button className="s-btn primary" onClick={() => { window.location.href = auth.url; }}><ExternalLink className="h-4 w-4" /> Continue</button>
              <button className="s-btn" onClick={() => { void navigator.clipboard?.writeText(auth.url).then(() => toast.success("Link copied. Open it on the phone that has the app signed in.")); }}><Copy className="h-4 w-4" /> Copy link for your phone</button>
            </div>
            <p className="text-[11.5px] mt-3" style={{ color: "var(--s-mute)" }}>The link works once and only for this brand. Don&apos;t share it.</p>
          </>
        )}
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} label="Disconnect account" width={420} padded>
        <b className="text-sm">Disconnect {removing?.account_name || "this account"}?</b>
        <p className="text-[13px] mt-2" style={{ color: "var(--s-soft)" }}>Posts scheduled for it won&apos;t go out. You can connect it again any time.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button className="s-btn ghost sm" onClick={() => setRemoving(null)}>Cancel</button>
          <button className="s-btn sm" style={{ background: "var(--s-danger)", color: "#fff", borderColor: "transparent" }} disabled={!removing || busy === removing.id} onClick={() => removing && disconnect(removing)}>Disconnect</button>
        </div>
      </Modal>
    </div>
  );
}

export default function Page() {
  return <Suspense><SettingsPage /></Suspense>;
}
