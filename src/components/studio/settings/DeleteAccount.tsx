"use client";

import { useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Modal } from "@/components/studio/Modal";
import { confirmsDeletion } from "@/lib/account-delete";

/**
 * Delete my account (Kezie, 2026-10-28: "one of the most important things we need to have").
 * Shows exactly what goes, asks for the sign-in email, then deletes everything at once
 * (/api/account/delete), signs out and clears what this device kept.
 */
type Preview = { email: string; brands: string[]; shared: string[]; posts: number; websites: number; credits: number; plan: string | null; subscription: boolean; memberOf: string[] };

/** What this browser kept for the account: drafts, kept fields, the open brand. */
async function forgetThisDevice() {
  try {
    for (const k of Object.keys(localStorage)) if (/^(kept:|draft:|blink-|motion:|sites:|plan:)/.test(k)) localStorage.removeItem(k);
    sessionStorage.clear();
  } catch { /* private mode */ }
  await new Promise<void>((done) => { try { const r = indexedDB.deleteDatabase("blinkspot-drafts"); r.onsuccess = r.onerror = r.onblocked = () => done(); } catch { done(); } });
}

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setOpen(true); setTyped(""); setPreview(null);
    const res = await fetch("/api/account/delete", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || "Couldn't load your account."); setOpen(false); return; }
    setPreview(data as Preview);
  }

  async function confirm() {
    if (!preview || !confirmsDeletion(typed, preview.email)) return;
    setBusy(true);
    const res = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: typed }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); toast.error(data.error || "Couldn't delete your account. Try again.", { duration: 12000 }); return; }
    await supabase.auth.signOut().catch(() => {});
    await forgetThisDevice();
    // A full load, not a client navigation: nothing of the account stays in memory.
    window.location.replace(new URL("/login?deleted=1", window.location.origin).toString());
  }

  const n = (v: number, one: string, many = `${one}s`) => `${v.toLocaleString()} ${v === 1 ? one : many}`;
  return (
    <section className="s-card p-5 grid gap-3 max-w-[640px]" aria-label="Delete my account" style={{ borderColor: "color-mix(in oklab, var(--s-danger) 35%, var(--s-line))" }}>
      <div>
        <h2 className="text-[16px] font-semibold">Delete my account</h2>
        <p className="text-[12.5px] mt-1" style={{ color: "var(--s-mute)" }}>Deletes your brands, posts, videos, pictures, websites and credits for good, cancels your plan and disconnects your social accounts. This can&apos;t be undone. Download anything you want to keep first.</p>
      </div>
      <button className="s-btn sm justify-self-start" style={{ color: "var(--s-danger)", borderColor: "color-mix(in oklab, var(--s-danger) 45%, var(--s-line-2))" }} onClick={() => void start()}><Trash2 className="h-3.5 w-3.5" /> Delete my account…</button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} label="Delete your account" width={480} padded>
        <div className="flex items-center justify-between mb-2">
          <b className="text-[15px]">Delete your BlinkSpot account?</b>
          <button className="s-btn ghost sm" onClick={() => setOpen(false)} disabled={busy} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {!preview ? (
          <div className="grid gap-2 py-6 justify-items-center" aria-busy="true"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--s-mute)" }} /></div>
        ) : (
          <div className="grid gap-3">
            <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>This deletes, for good and straight away:</p>
            <ul className="grid gap-1.5 text-[13px] list-disc pl-5" aria-label="What gets deleted">
              <li>{preview.brands.length ? <>{n(preview.brands.length, "brand")}: <b>{preview.brands.slice(0, 4).join(", ")}{preview.brands.length > 4 ? "…" : ""}</b></> : "Your account"}</li>
              <li>{n(preview.posts, "post")}, with their pictures and videos</li>
              {preview.websites > 0 && <li>{n(preview.websites, "website page")} (published ones go offline)</li>}
              {preview.credits > 0 && <li>{n(preview.credits, "credit")} left on the account</li>}
              <li>{preview.subscription ? <>Your <b>{preview.plan}</b> plan is cancelled: no more charges</> : "Any plan on the account"}</li>
              <li>Your connected social accounts are disconnected, and posts waiting to go out are cancelled</li>
            </ul>
            {preview.shared.length > 0 && <p className="text-[12.5px] rounded-lg p-2.5" style={{ background: "color-mix(in oklab, var(--s-warn) 10%, transparent)", color: "var(--s-soft)" }}>You share <b>{preview.shared.join(", ")}</b> with other people. They lose access to {preview.shared.length === 1 ? "it" : "them"} too.</p>}
            {preview.memberOf.length > 0 && <p className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>You&apos;ll be removed from {preview.memberOf.join(", ")}. {preview.memberOf.length === 1 ? "That brand stays" : "Those brands stay"} with {preview.memberOf.length === 1 ? "its owner" : "their owners"}.</p>}
            <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>We keep records of payments for tax, as our Privacy Policy says. Nothing else is kept.</p>
            <label className="grid gap-1.5">
              <span className="text-[12.5px]">Type <b>{preview.email}</b> to confirm</span>
              <input className="s-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-label="Your sign-in email" placeholder={preview.email} />
            </label>
            <div className="flex justify-end gap-2 mt-1">
              <button className="s-btn ghost sm" onClick={() => setOpen(false)} disabled={busy}>Keep my account</button>
              <button className="s-btn sm" style={{ background: "var(--s-danger)", color: "#fff", borderColor: "transparent" }} disabled={busy || !confirmsDeletion(typed, preview.email)} onClick={() => void confirm()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} {busy ? "Deleting everything…" : "Delete my account"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
