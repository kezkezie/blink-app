"use client";

import { useEffect, useState } from "react";
import { Archive, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { archiveBrand, deleteBrandPermanently, listArchivedBrands, restoreBrand } from "@/app/actions/brand";
import { useBrandStore } from "@/app/store/useBrandStore";

type Row = { id: string; brand_name: string; logo_url: string | null; archived?: boolean; updated_at?: string | null };

/**
 * One place to look after brands: archive (pause a client, keep everything), restore, or delete
 * forever (type the name to confirm). Archived brands used to vanish with no way back.
 */
export function ManageBrands({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { availableBrands, activeBrand, setActiveBrand } = useBrandStore();
  const [archived, setArchived] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [typed, setTyped] = useState("");

  const load = () => listArchivedBrands().then((r) => setArchived("brands" in r ? r.brands.map((b) => ({ ...b, archived: true })) : []));
  useEffect(() => { if (open) void load(); }, [open]);
  if (!open) return null;

  async function run(id: string, fn: () => Promise<{ error?: string }>, ok: string) {
    setBusy(id);
    const r = await fn();
    setBusy(null);
    if (r.error) { toast.error(r.error); return false; }
    toast.success(ok);
    onChanged();
    await load();
    return true;
  }

  const rows: Row[] = [...availableBrands.map((b) => ({ ...b, archived: false })), ...(archived ?? [])];
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" style={{ background: "rgba(0,0,0,.6)" }} onClick={onClose}>
      <div className="s-card w-full max-w-[560px] max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Manage brands">
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--s-line)" }}>
          <b className="text-sm">Manage brands</b>
          <button className="s-btn ghost sm" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-3 grid gap-1">
          {rows.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-2 py-2 rounded-lg" style={{ background: b.archived ? "transparent" : "var(--s-bg)" }}>
              <span className="h-8 w-8 rounded-md overflow-hidden grid place-items-center shrink-0" style={{ background: "#fff", opacity: b.archived ? 0.5 : 1 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.logo_url ? <img src={b.logo_url} alt="" className="h-full w-full object-contain p-0.5" /> : <span className="text-xs font-bold text-black">{(b.brand_name || "?").charAt(0)}</span>}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ color: b.archived ? "var(--s-soft)" : "var(--s-text)" }}>{b.brand_name || "Unnamed brand"}</div>
                <div className="text-[11px]" style={{ color: "var(--s-mute)" }}>{b.archived ? "Archived · posts and settings kept" : activeBrand?.id === b.id ? "Working on it now" : "Active"}</div>
              </div>
              {b.archived ? (
                <button className="s-btn sm" disabled={busy === b.id} onClick={() => run(b.id, () => restoreBrand(b.id), `${b.brand_name} is back.`)}>
                  {busy === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                </button>
              ) : (
                <button className="s-btn ghost sm" disabled={busy === b.id} title="Pause this brand: it leaves your lists, everything is kept" onClick={async () => {
                  const done = await run(b.id, () => archiveBrand(b.id), `${b.brand_name} archived. Restore it any time here.`);
                  if (done && activeBrand?.id === b.id) setActiveBrand(availableBrands.find((x) => x.id !== b.id) ?? null);
                }}>
                  <Archive className="h-3.5 w-3.5" /> Archive
                </button>
              )}
              <button className="s-btn ghost sm" style={{ color: "var(--s-danger)" }} onClick={() => { setDeleting(b); setTyped(""); }} aria-label={`Delete ${b.brand_name} forever`}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {archived === null && <div className="px-2 py-2 text-xs flex items-center gap-2" style={{ color: "var(--s-mute)" }}><Loader2 className="h-3 w-3 animate-spin" /> Loading archived brands…</div>}
        </div>
        <p className="px-4 pb-4 text-[11px] leading-relaxed" style={{ color: "var(--s-mute)" }}>
          <b>Archive</b> when a client pauses: the brand leaves your lists but its posts, schedule and settings are kept, and it frees a slot on your plan. <b>Delete</b> removes the brand and all its posts for good.
        </p>

        {deleting && (
          <div className="mx-3 mb-3 p-3 rounded-xl grid gap-2" style={{ border: "1px solid color-mix(in oklab, var(--s-danger) 50%, var(--s-line))", background: "color-mix(in oklab, var(--s-danger) 6%, var(--s-bg))" }}>
            <b className="text-sm">Delete {deleting.brand_name} forever?</b>
            <p className="text-xs" style={{ color: "var(--s-soft)" }}>This removes the brand, all its posts and schedules, and its social connections. It can&apos;t be undone. Billing history is kept. Type <b>{deleting.brand_name}</b> to confirm.</p>
            <input className="s-input" data-no-mic value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={deleting.brand_name} aria-label="Type the brand name to confirm" />
            <div className="flex gap-2 justify-end">
              <button className="s-btn ghost sm" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="s-btn sm" style={{ background: "var(--s-danger)", color: "#fff", borderColor: "transparent" }}
                disabled={typed.trim().toLowerCase() !== (deleting.brand_name || "").trim().toLowerCase() || busy === deleting.id}
                onClick={async () => {
                  const target = deleting;
                  setBusy(target.id);
                  const r = await deleteBrandPermanently(target.id, typed);
                  setBusy(null);
                  if (r.error) { toast.error(r.error); return; }
                  toast.success(`${target.brand_name} deleted (${r.removed?.posts ?? 0} posts).`);
                  setArchived((prev) => prev?.filter((x) => x.id !== target.id) ?? prev);
                  if (activeBrand?.id === target.id) setActiveBrand(availableBrands.find((x) => x.id !== target.id) ?? null);
                  setDeleting(null);
                  onChanged();
                  await load();
                }}>
                {busy === deleting.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete forever
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
