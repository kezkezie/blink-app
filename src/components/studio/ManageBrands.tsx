"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArrowLeftRight, Loader2, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { archiveBrand, deleteBrandPermanently, getBrandAllowance, listArchivedBrands, restoreBrand, swapBrands } from "@/app/actions/brand";
import { useBrandStore } from "@/app/store/useBrandStore";
import { Modal } from "./Modal";

type Row = { id: string; brand_name: string; logo_url: string | null; archived?: boolean; updated_at?: string | null };
type Allowance = { used: number; limit: number; canCreate: boolean; plan: string };

const PLAN_LABEL: Record<string, string> = { free: "Free", starter: "Starter", pro: "Pro", agency: "Agency" };

function Logo({ b, dim }: { b: Row; dim?: boolean }) {
  return (
    <span className="h-9 w-9 rounded-lg overflow-hidden grid place-items-center shrink-0" style={{ background: "#fff", opacity: dim ? 0.55 : 1 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {b.logo_url ? <img src={b.logo_url} alt="" className="h-full w-full object-contain p-0.5" /> : <span className="text-xs font-bold text-black">{(b.brand_name || "?").charAt(0)}</span>}
    </span>
  );
}

/**
 * Look after brands in one place: how many your plan allows, the ones you're working on, and the
 * archived ones (a client on pause, everything kept). When the plan is full, "Swap in" archives the
 * brand you pick and brings the other back in one step. Delete forever needs the name typed.
 */
export function ManageBrands({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { availableBrands, activeBrand, setActiveBrand } = useBrandStore();
  const [archived, setArchived] = useState<Row[] | null>(null);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [swapping, setSwapping] = useState<Row | null>(null);
  const [typed, setTyped] = useState("");

  const load = useCallback(() => Promise.all([listArchivedBrands(), getBrandAllowance()]).then(([list, a]) => {
    setArchived("brands" in list ? list.brands.map((b) => ({ ...b, archived: true })) : []);
    if (!("error" in a)) setAllowance(a);
  }), []);
  useEffect(() => { if (open) void load(); }, [open, load]);
  const close = () => { setSwapping(null); setDeleting(null); onClose(); };

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

  const full = !!allowance && allowance.used >= allowance.limit;
  const over = !!allowance && allowance.used > allowance.limit;
  const active: Row[] = availableBrands.map((b) => ({ ...b, archived: false }));
  const pct = allowance ? Math.min(100, (allowance.used / Math.max(1, allowance.limit)) * 100) : 0;

  return (
    <Modal open={open} onClose={close} label="Manage brands" width={600}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--s-line)" }}>
        <div>
          <b className="text-[15px]">Your brands</b>
          {allowance && (
            <p className="text-[12px] mt-0.5" style={{ color: "var(--s-mute)" }}>
              {allowance.used} of {allowance.limit} active on the {PLAN_LABEL[allowance.plan] ?? allowance.plan} plan
            </p>
          )}
        </div>
        <button className="s-btn ghost sm" onClick={close} aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      {allowance && (
        <div className="px-5 pt-4">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--s-line)" }} aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? "var(--s-warn)" : full ? "var(--s-accent)" : "var(--s-ok)" }} />
          </div>
          <p className="text-[12px] mt-2 leading-relaxed" style={{ color: "var(--s-soft)" }}>
            {over
              ? `You have ${allowance.used - allowance.limit} more active than your plan allows. Everything still works; new brands and restores wait until you archive or upgrade.`
              : full
                ? "Your plan is full. Archive a brand you're not working on to free a slot, or swap an archived one back in."
                : `${allowance.limit - allowance.used} free slot${allowance.limit - allowance.used === 1 ? "" : "s"}.`}
            {" "}<Link href="/studio/account/billing" className="underline" onClick={close}>See plans</Link>
          </p>
        </div>
      )}

      <div className="p-3 pt-4">
        <p className="s-label px-2">Working on</p>
        <div className="grid gap-1">
          {active.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-2 py-2 rounded-lg" style={{ background: "var(--s-bg)" }}>
              <Logo b={b} />
              <button className="flex-1 min-w-0 text-left" onClick={() => { setActiveBrand(b); toast.success(`Working on ${b.brand_name}`); }} title="Switch to this brand">
                <div className="text-sm truncate">{b.brand_name || "Unnamed brand"}</div>
                <div className="text-[11px]" style={{ color: activeBrand?.id === b.id ? "var(--s-accent)" : "var(--s-mute)" }}>{activeBrand?.id === b.id ? "Open now" : "Active · click to switch"}</div>
              </button>
              {swapping ? (
                <button className="s-btn sm" disabled={!!busy} onClick={async () => {
                  const target = swapping;
                  const done = await run(b.id, () => swapBrands(b.id, target.id), `${b.brand_name} archived, ${target.brand_name} is back.`);
                  if (done) { setSwapping(null); if (activeBrand?.id === b.id) setActiveBrand({ id: target.id, brand_name: target.brand_name, logo_url: target.logo_url }); }
                }}>
                  {busy === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />} Swap out
                </button>
              ) : (
                <button className="s-btn ghost sm" disabled={busy === b.id} title="Pause this brand: it leaves your lists, everything is kept" onClick={async () => {
                  const done = await run(b.id, () => archiveBrand(b.id), `${b.brand_name} archived. It's under Archived whenever you want it back.`);
                  if (done && activeBrand?.id === b.id) setActiveBrand(availableBrands.find((x) => x.id !== b.id) ?? null);
                }}>
                  {busy === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />} Archive
                </button>
              )}
              <button className="s-btn ghost sm" style={{ color: "var(--s-danger)" }} onClick={() => { setDeleting(b); setTyped(""); }} aria-label={`Delete ${b.brand_name} forever`}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {active.length === 0 && <p className="px-2 py-2 text-xs" style={{ color: "var(--s-mute)" }}>No active brands.</p>}
        </div>

        {swapping && (
          <div className="mx-2 mt-2 px-3 py-2 rounded-lg flex items-center gap-2 text-[12px]" style={{ background: "color-mix(in oklab, var(--s-accent) 10%, transparent)", color: "var(--s-text)" }}>
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--s-accent)" }} />
            <span className="flex-1">Pick the brand to archive so <b>{swapping.brand_name}</b> can come back.</span>
            <button className="s-btn ghost sm" onClick={() => setSwapping(null)}>Cancel</button>
          </div>
        )}

        <p className="s-label px-2 mt-5">Archived {archived ? `(${archived.length})` : ""}</p>
        <div className="grid gap-1">
          {archived === null && <div className="px-2 py-2 text-xs flex items-center gap-2" style={{ color: "var(--s-mute)" }}><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>}
          {archived?.length === 0 && <p className="px-2 py-1 text-xs" style={{ color: "var(--s-mute)" }}>Nothing archived. Archive a brand when a client pauses; its posts and settings stay.</p>}
          {archived?.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-2 py-2 rounded-lg" style={{ border: "1px dashed var(--s-line-2)" }}>
              <Logo b={b} dim />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ color: "var(--s-soft)" }}>{b.brand_name || "Unnamed brand"}</div>
                <div className="text-[11px]" style={{ color: "var(--s-mute)" }}>Archived · posts and settings kept</div>
              </div>
              {full ? (
                <button className="s-btn sm" disabled={!!busy || active.length === 0} onClick={() => setSwapping(b)} aria-pressed={swapping?.id === b.id}>
                  <ArrowLeftRight className="h-3.5 w-3.5" /> Swap in
                </button>
              ) : (
                <button className="s-btn sm primary" disabled={busy === b.id} onClick={() => run(b.id, () => restoreBrand(b.id), `${b.brand_name} is back.`)}>
                  {busy === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                </button>
              )}
              <button className="s-btn ghost sm" style={{ color: "var(--s-danger)" }} onClick={() => { setDeleting(b); setTyped(""); }} aria-label={`Delete ${b.brand_name} forever`}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      </div>

      {deleting && (
        <div className="mx-4 mb-3 p-3 rounded-xl grid gap-2" style={{ border: "1px solid color-mix(in oklab, var(--s-danger) 50%, var(--s-line))", background: "color-mix(in oklab, var(--s-danger) 6%, var(--s-bg))" }}>
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

      <div className="px-5 py-3 flex items-center gap-2 text-[11.5px]" style={{ borderTop: "1px solid var(--s-line)", color: "var(--s-mute)" }}>
        <span className="flex-1"><b>Archive</b> pauses a client and frees a slot. <b>Delete</b> removes everything for good.</span>
        <Link href="/studio/brand-builder" className="s-btn ghost sm" onClick={close}><Sparkles className="h-3.5 w-3.5" /> New brand</Link>
      </div>
    </Modal>
  );
}
