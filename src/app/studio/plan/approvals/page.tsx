"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MessageSquareWarning, Pencil, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { triggerWorkflow } from "@/lib/workflows";
import { useBrandStore } from "@/app/store/useBrandStore";
import { cleanCaption, MediaThumb, resolveMedia, timeAgo } from "@/components/studio/media";
import { Modal } from "@/components/studio/Modal";
import type { Content } from "@/types/database";

/**
 * Approvals in the studio look (the classic page was a white card that ignored the theme).
 * Two lists: what is waiting for a yes, and recent drafts you can send for approval, because
 * nothing in the app used to put a post in the queue, so it was always empty.
 */
type Row = Content & { brand_name?: string };

export default function ApprovalsPage() {
  const { clientId, loading: clientLoading } = useClient();
  const { activeBrand, availableBrands } = useBrandStore();
  const [scope, setScope] = useState<"brand" | "all">("brand");
  const [pending, setPending] = useState<Row[] | null>(null);
  const [drafts, setDrafts] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [reason, setReason] = useState("");

  const brandName = useMemo(() => Object.fromEntries(availableBrands.map((b) => [b.id, b.brand_name])), [availableBrands]);
  const load = useCallback(async () => {
    if (!clientId) return;
    const base = () => {
      let q = supabase.from("content").select("*").eq("client_id", clientId);
      if (scope === "brand" && activeBrand) q = q.eq("brand_id", activeBrand.id);
      return q;
    };
    const [p, d] = await Promise.all([
      base().eq("status", "pending_approval").order("created_at", { ascending: false }).limit(60),
      base().eq("status", "draft").order("created_at", { ascending: false }).limit(12),
    ]);
    if (p.error || d.error) toast.error("Couldn't load approvals. Try again.");
    setPending(((p.data ?? []) as Row[]));
    setDrafts(((d.data ?? []) as Row[]).filter((c) => resolveMedia(c).url || c.caption));
  }, [clientId, scope, activeBrand]);
  useEffect(() => { void load(); }, [load]);

  async function setStatus(item: Row, status: "approved" | "rejected" | "pending_approval", extra: Record<string, unknown> = {}) {
    setBusy(item.id);
    const { error } = await supabase.from("content").update({ status, ...extra }).eq("id", item.id).eq("client_id", clientId!);
    setBusy(null);
    if (error) { toast.error("Couldn't update the post."); return false; }
    return true;
  }
  async function approve(item: Row) {
    if (!(await setStatus(item, "approved", { approved_at: new Date().toISOString(), approved_by: "admin" }))) return;
    void triggerWorkflow("blink-approval-response", { client_id: clientId, post_id: item.id, action: "approved" }).catch(() => {});
    toast.success("Approved. It's ready to schedule in the Calendar.");
    setPending((prev) => prev?.filter((c) => c.id !== item.id) ?? prev);
  }
  async function reject() {
    if (!rejecting || !reason.trim()) return;
    const item = rejecting;
    if (!(await setStatus(item, "rejected", { rejection_reason: reason.trim() }))) return;
    void triggerWorkflow("blink-approval-response", { client_id: clientId, post_id: item.id, action: "rejected", reason: reason.trim() }).catch(() => {});
    toast.success("Sent back with your note.");
    setRejecting(null); setReason("");
    setPending((prev) => prev?.filter((c) => c.id !== item.id) ?? prev);
  }
  async function send(item: Row) {
    if (!(await setStatus(item, "pending_approval"))) return;
    toast.success("Sent for approval.");
    setDrafts((prev) => prev?.filter((c) => c.id !== item.id) ?? prev);
    setPending((prev) => [{ ...item, status: "pending_approval" } as Row, ...(prev ?? [])]);
  }

  if (clientLoading || pending === null) {
    return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--s-mute)" }} /></div>;
  }

  const Card = ({ item, kind }: { item: Row; kind: "pending" | "draft" }) => {
    const m = resolveMedia(item);
    return (
      <div className="s-card overflow-hidden flex flex-col">
        <div className="relative bg-black" style={{ aspectRatio: "4 / 3" }}>
          <MediaThumb url={m.url} isVideo={m.isVideo} poster={m.poster} />
          {scope === "all" && item.brand_id && <span className="s-badge absolute left-2 top-2" style={{ background: "rgba(0,0,0,.6)", color: "#fff" }}>{brandName[item.brand_id] ?? "Brand"}</span>}
        </div>
        <div className="p-3 grid gap-2 flex-1 content-start">
          <p className="text-[13px] leading-snug line-clamp-3" style={{ color: item.caption ? "var(--s-text)" : "var(--s-mute)" }}>{cleanCaption(item.caption) || "No caption yet"}</p>
          <p className="text-[11px]" style={{ color: "var(--s-mute)" }}>{item.content_type} · {timeAgo(item.created_at)}</p>
        </div>
        <div className="p-3 pt-0 flex gap-1.5">
          {kind === "pending" ? (
            <>
              <button className="s-btn primary sm flex-1" disabled={busy === item.id} onClick={() => approve(item)}>
                {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
              </button>
              <button className="s-btn sm" disabled={busy === item.id} onClick={() => { setRejecting(item); setReason(""); }}><MessageSquareWarning className="h-3.5 w-3.5" /> Changes</button>
              <Link href={`/studio/library/${item.id}`} className="s-btn ghost sm" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></Link>
            </>
          ) : (
            <button className="s-btn sm flex-1" disabled={busy === item.id} onClick={() => send(item)}>
              {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send for approval
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[18px] font-semibold">Waiting for a yes</h2>
          <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>{pending.length ? `${pending.length} post${pending.length === 1 ? "" : "s"} to review.` : "Nothing waiting right now."} Approved posts are ready to schedule.</p>
        </div>
        <div className="flex-1" />
        <div className="flex gap-1.5" role="group" aria-label="Which brands">
          <button className="s-chip" aria-pressed={scope === "brand"} onClick={() => setScope("brand")}>{activeBrand?.brand_name ?? "This brand"}</button>
          <button className="s-chip" aria-pressed={scope === "all"} onClick={() => setScope("all")}>All brands</button>
        </div>
      </div>

      {pending.length > 0 ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{pending.map((c) => <Card key={c.id} item={c} kind="pending" />)}</div>
      ) : (
        <div className="s-card px-6 py-10 text-center">
          <div className="mx-auto h-11 w-11 rounded-full grid place-items-center mb-3" style={{ background: "color-mix(in oklab, var(--s-ok) 14%, transparent)" }}><Check className="h-5 w-5" style={{ color: "var(--s-ok)" }} /></div>
          <b className="text-[15px]">All caught up</b>
          <p className="text-[13px] mt-1 max-w-[420px] mx-auto" style={{ color: "var(--s-soft)" }}>Send a draft below when you want a second pair of eyes (a client, a manager) before it&apos;s scheduled.</p>
        </div>
      )}

      {drafts && drafts.length > 0 && (
        <section>
          <h3 className="s-section-h">Recent drafts <Link href="/studio/library" className="s-btn ghost sm normal-case tracking-normal">All in Library →</Link></h3>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{drafts.map((c) => <Card key={c.id} item={c} kind="draft" />)}</div>
        </section>
      )}

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} label="Ask for changes" width={480} padded>
        <div className="flex items-center justify-between mb-3"><b className="text-sm">What should change?</b><button className="s-btn ghost sm" onClick={() => setRejecting(null)} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <textarea className="s-input" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Use the green bottle, and make the price bigger" aria-label="What should change" />
        <div className="flex justify-end gap-2 mt-3">
          <button className="s-btn ghost sm" onClick={() => setRejecting(null)}>Cancel</button>
          <button className="s-btn sm primary" disabled={!reason.trim() || busy === rejecting?.id} onClick={reject}>
            {busy === rejecting?.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareWarning className="h-3.5 w-3.5" />} Send back
          </button>
        </div>
      </Modal>
    </div>
  );
}
