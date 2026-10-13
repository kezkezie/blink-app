"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, Mail, MessageCircle, Trash2, UserMinus, Users, X } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Modal } from "../Modal";
import { ROLE_INFO, whatsappShareUrl, type ShareRole } from "@/lib/brand-sharing";

const PLAN_NAME: Record<string, string> = { free: "Free", starter: "Starter", pro: "Pro", agency: "Agency" };

type Member = { userId: string; role: ShareRole; email: string | null; name: string | null; since: string };
type Invite = { id: string; email: string | null; role: ShareRole; expiresAt: string; link: string };
type Sharing = { members: Member[]; invites: Invite[]; limit: number; plan: string };

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/brand-sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

function days(iso: string) {
  const d = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
  return d <= 1 ? "1 day" : `${d} days`;
}

function CopyLink({ link, brandName, role }: { link: string; brandName: string; role: ShareRole }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast.error("Couldn't copy. Select the link and copy it."); }
  };
  return (
    <div className="grid gap-2">
      <input className="s-input font-mono text-[12px]" readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="s-btn sm" onClick={() => void copy()}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy link"}</button>
        <a className="s-btn sm ghost" href={whatsappShareUrl(link, brandName, role)} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" /> Send on WhatsApp</a>
      </div>
    </div>
  );
}

/**
 * Share a brand (2026-10-13). The owner picks Editor or Viewer, then makes a link (one person, 14
 * days) or invites an email (that person sees it when they sign in). Below: who has access, with
 * their role and a Remove, and the invites nobody has used yet.
 */
export function SharePanel({ open, onClose, brandId, brandName }: { open: boolean; onClose: () => void; brandId: string; brandName: string }) {
  const [data, setData] = useState<Sharing | null>(null);
  const [role, setRole] = useState<ShareRole>("editor");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Invite | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/brand-sharing?brandId=${brandId}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || "Couldn't load who has access."); return; }
    setData({ members: body.members ?? [], invites: body.invites ?? [], limit: body.limit ?? 3, plan: body.plan ?? "free" });
  }, [brandId]);
  useEffect(() => { if (open) { setFresh(null); void load(); } }, [open, load]);

  async function run(key: string, body: Record<string, unknown>, ok?: string) {
    setBusy(key);
    try {
      const r = await call(body);
      if (ok) toast.success(ok);
      await load();
      return r;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
      return null;
    } finally { setBusy(null); }
  }

  async function invite(withEmail: boolean) {
    const r = await run(withEmail ? "email" : "link", { action: "invite", brandId, role, ...(withEmail ? { email } : {}) });
    if (r?.invite) { setFresh(r.invite); if (withEmail) setEmail(""); }
  }

  const used = data ? data.members.length + data.invites.length : 0;
  const full = !!data && used >= data.limit;

  return (
    <Modal open={open} onClose={onClose} label={`Share ${brandName}`} width={600}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--s-line)" }}>
        <div>
          <b className="text-[15px]">Share {brandName}</b>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--s-mute)" }}>Work on this brand together. They only see this brand, nothing else in your account.</p>
        </div>
        <button className="s-btn ghost sm" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      <div className="px-5 py-4 grid gap-4 max-h-[70vh] overflow-y-auto">
        <div className="grid gap-2">
          <span className="s-label !mb-0">They can</span>
          <div className="s-seg w-fit" role="group" aria-label="Role">
            {(["editor", "viewer"] as const).map((r) => (
              <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}>{ROLE_INFO[r].label}</button>
            ))}
          </div>
          <p className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>{ROLE_INFO[role].line}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-end">
          <label className="grid gap-1.5 min-w-0">
            <span className="s-label !mb-0">Invite by email</span>
            <input className="s-input" type="email" placeholder="brian@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Their email"
              onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) void invite(true); }} />
          </label>
          <button type="button" className="s-btn" disabled={!email.trim() || !!busy || full} onClick={() => void invite(true)}>
            {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Invite
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="h-px flex-1" style={{ background: "var(--s-line)" }} />
          <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>or</span>
          <span className="h-px flex-1" style={{ background: "var(--s-line)" }} />
        </div>
        <button type="button" className="s-btn w-fit" disabled={!!busy || full} onClick={() => void invite(false)}>
          {busy === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Create an invite link
        </button>
        {data && (
          <p className="text-[12px]" style={{ color: full ? "var(--s-warn)" : "var(--s-mute)" }}>
            {used} of {data.limit} people on your {PLAN_NAME[data.plan] ?? "current"} plan (open invites count).{" "}
            {full && (data.plan === "agency"
              ? "Remove someone or cancel an invite to add more."
              : <>Remove someone, or <Link href="/studio/account/billing#plans" className="underline" onClick={onClose}>upgrade</Link> to share with more.</>)}
          </p>
        )}

        {fresh && (
          <div className="s-card p-4 grid gap-2.5" style={{ borderColor: "color-mix(in oklab, var(--s-ok) 35%, var(--s-line))" }}>
            <p className="text-[13px]">
              {fresh.email
                ? <>Invite ready for <b>{fresh.email}</b>. If they already use BlinkSpot, they&apos;ll see it when they sign in. If they&apos;re new, send them this link to join:</>
                : <>Link ready ({ROLE_INFO[fresh.role].label.toLowerCase()}). It lets <b>one person</b> in and works for {days(fresh.expiresAt)}.</>}
            </p>
            <CopyLink link={fresh.link} brandName={brandName} role={fresh.role} />
          </div>
        )}

        <div className="grid gap-2">
          <span className="s-label !mb-0 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Who has access</span>
          {!data ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--s-mute)" }} /> : (
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)" }}>
                <span className="flex-1">You</span><span className="s-badge">Owner</span>
              </div>
              {data.members.map((m) => (
                <div key={m.userId} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)" }}>
                  <span className="flex-1 min-w-0 truncate">{m.name ? <>{m.name} <span style={{ color: "var(--s-mute)" }}>{m.email}</span></> : m.email || "Someone"}</span>
                  <select className="s-input !h-8 !w-auto text-[12.5px]" value={m.role} aria-label={`Role for ${m.email || m.name || "member"}`} disabled={busy === m.userId}
                    onChange={(e) => void run(m.userId, { action: "set_role", brandId, userId: m.userId, role: e.target.value }, "Role changed.")}>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button className="s-btn ghost sm" aria-label={`Remove ${m.email || m.name || "member"}`} disabled={busy === m.userId}
                    onClick={() => void run(m.userId, { action: "remove", brandId, userId: m.userId }, "Removed. They can't open this brand any more.")}>
                    {busy === m.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
              {data.members.length === 0 && <p className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>Only you, so far.</p>}
            </div>
          )}
        </div>

        {!!data?.invites.length && (
          <div className="grid gap-2">
            <span className="s-label !mb-0">Waiting to be used</span>
            {data.invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)" }}>
                <span className="flex-1 min-w-0 truncate">{i.email || "Invite link"} <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>· {ROLE_INFO[i.role].label} · {days(i.expiresAt)} left</span></span>
                <button className="s-btn ghost sm" aria-label="Copy this invite link" onClick={() => void navigator.clipboard.writeText(i.link).then(() => toast.success("Link copied."), () => toast.error("Couldn't copy."))}><Copy className="h-3.5 w-3.5" /></button>
                <button className="s-btn ghost sm" aria-label={`Cancel invite ${i.email || "link"}`} disabled={busy === i.id}
                  onClick={() => { if (fresh?.id === i.id) setFresh(null); void run(i.id, { action: "revoke", inviteId: i.id }, "Invite cancelled."); }}>
                  {busy === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>
          Editors use your credits, and everything they make stays in this brand. They can&apos;t see your other brands, billing or settings, and only you can connect social accounts. Remove anyone any time.
        </p>
      </div>
    </Modal>
  );
}
