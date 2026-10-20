"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBrandStore, isSharedBrand } from "@/app/store/useBrandStore";

/**
 * Settings > AI connections (2026-10-20): a key per AI app (Claude Code, Hermes, OpenClaw, any MCP
 * client), scoped to brands, with a monthly credit budget (200 by default). The key shows once,
 * with the setup line for each app. Stage 1: the AI can read brands, the Library and the calendar
 * and price things; making and posting come next.
 */
type Key = { id: string; name: string; prefix: string; brand_ids: string[] | null; monthly_credit_budget: number; created_at: string; last_used_at: string | null };
const URL = "https://www.blinkspot.io/api/mcp";

const setups = (token: string) => [
  { app: "Claude Code", how: "Run in a terminal:", code: `claude mcp add --transport http blinkspot ${URL} --header "Authorization: Bearer ${token}"` },
  { app: "Hermes", how: "Add to ~/.hermes/config.yaml:", code: `mcp_servers:\n  blinkspot:\n    url: "${URL}"\n    headers:\n      Authorization: "Bearer ${token}"` },
  { app: "OpenClaw", how: "In Settings > MCP (or your OpenClaw config):", code: `mcp: {\n  servers: {\n    blinkspot: {\n      url: "${URL}",\n      transport: "streamable-http",\n      headers: { Authorization: "Bearer ${token}" },\n    },\n  },\n}` },
  { app: "Any MCP app", how: "Streamable HTTP server:", code: `URL: ${URL}\nHeader: Authorization: Bearer ${token}` },
];

export function AiConnections() {
  const brands = useBrandStore((s) => s.availableBrands).filter((b) => !isSharedBrand(b));
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [making, setMaking] = useState(false);
  const [form, setForm] = useState<{ name: string; all: boolean; picked: string[]; budget: number } | null>(null);
  const [made, setMade] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/ai-connections", { cache: "no-store" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setKeys(d?.keys ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!form) return;
    setMaking(true);
    try {
      const res = await fetch("/api/ai-connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, budget: form.budget, ...(form.all ? {} : { brandIds: form.picked }) }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.token) throw new Error(d.error || "Couldn't create it.");
      setMade({ token: d.token, name: form.name }); setForm(null); void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create it."); }
    finally { setMaking(false); }
  }
  async function revoke(k: Key) {
    const res = await fetch(`/api/ai-connections?id=${k.id}`, { method: "DELETE" });
    if (res.ok) { toast.success(`${k.name} can't reach BlinkSpot any more.`); void load(); } else toast.error("Couldn't revoke it.");
  }
  const copy = (text: string, id: string) => { void navigator.clipboard?.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 1500); }); };
  const brandNames = (ids: string[] | null) => (!ids ? "All brands" : ids.map((id) => brands.find((b) => b.id === id)?.brand_name ?? "a brand").join(", "));

  return (
    <section id="ai-connections" className="s-card p-5 grid gap-4 max-w-[760px] scroll-mt-24" aria-label="AI connections">
      <div className="flex items-start gap-3">
        <Bot className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--s-ai)" }} />
        <div className="flex-1">
          <h2 className="text-[16px] font-semibold">AI connections</h2>
          <p className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>Use BlinkSpot from Claude Code, Hermes, OpenClaw or any MCP app. Each connection gets its own key, only the brands you pick and a monthly credit budget. For now it can read your brands, Library and calendar and price things; making and posting come next.</p>
        </div>
        {!form && !made && <button className="s-btn sm" onClick={() => setForm({ name: "", all: true, picked: [], budget: 200 })}><Plus className="h-3.5 w-3.5" /> New connection</button>}
      </div>

      {form && (
        <div className="rounded-xl p-4 grid gap-3" style={{ border: "1px solid var(--s-line-2)" }}>
          <label className="grid gap-1 text-[12px]" style={{ color: "var(--s-soft)" }}>Name
            <input className="s-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Claude Code on my laptop" aria-label="Connection name" maxLength={60} />
          </label>
          <div className="grid gap-1.5 text-[12px]" style={{ color: "var(--s-soft)" }}>Brands it may use
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="s-chip" aria-pressed={form.all} onClick={() => setForm({ ...form, all: true })}>All brands</button>
              {brands.map((b) => (
                <button type="button" key={b.id} className="s-chip" aria-pressed={!form.all && form.picked.includes(b.id)} onClick={() => setForm({ ...form, all: false, picked: form.picked.includes(b.id) ? form.picked.filter((x) => x !== b.id) : [...form.picked, b.id] })}>{b.brand_name}</button>
              ))}
            </div>
          </div>
          <label className="grid gap-1 text-[12px] max-w-[220px]" style={{ color: "var(--s-soft)" }}>Monthly credit budget
            <input className="s-input" type="number" min={0} max={100000} value={form.budget} onChange={(e) => setForm({ ...form, budget: Math.max(0, Number(e.target.value) || 0) })} aria-label="Monthly credit budget" />
          </label>
          <div className="flex gap-2">
            <button className="s-btn primary sm" onClick={() => void create()} disabled={making || !form.name.trim() || (!form.all && !form.picked.length)}>{making ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Create key</button>
            <button className="s-btn ghost sm" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {made && (
        <div className="rounded-xl p-4 grid gap-3" style={{ border: "1px solid var(--s-accent)", background: "color-mix(in oklab, var(--s-accent) 6%, transparent)" }} role="region" aria-label="New key">
          <b className="text-[13.5px]">{made.name}: your key</b>
          <p className="text-[12px]" style={{ color: "var(--s-soft)" }}>Copy it now: BlinkSpot keeps only a fingerprint and can&apos;t show it again. Anyone with it can read your brands, so keep it private.</p>
          <div className="flex gap-2 items-center">
            <code className="mono text-[12px] flex-1 min-w-0 truncate rounded-md px-2 py-1.5" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)" }} aria-label="Key">{made.token}</code>
            <button className="s-btn sm" onClick={() => copy(made.token, "key")}>{copied === "key" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy</button>
          </div>
          {setups(made.token).map((s) => (
            <div key={s.app} className="grid gap-1">
              <span className="text-[12px]"><b>{s.app}</b> <span style={{ color: "var(--s-mute)" }}>{s.how}</span></span>
              <div className="flex gap-2 items-start">
                <pre className="mono text-[11.5px] flex-1 min-w-0 overflow-x-auto rounded-md p-2 m-0" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)", whiteSpace: "pre" }}>{s.code}</pre>
                <button className="s-btn ghost sm" onClick={() => copy(s.code, s.app)} aria-label={`Copy the ${s.app} setup`}>{copied === s.app ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
              </div>
            </div>
          ))}
          <button className="s-btn ghost sm justify-self-start" onClick={() => setMade(null)}>Done</button>
        </div>
      )}

      {keys === null ? <div className="s-skel h-12" /> : keys.length === 0 && !form && !made ? (
        <p className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>No connections yet.</p>
      ) : (
        <div className="grid gap-1.5">
          {keys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2" style={{ border: "1px solid var(--s-line)" }}>
              <div className="flex-1 min-w-[200px] grid">
                <b className="text-[13px]">{k.name} <span className="mono text-[11px]" style={{ color: "var(--s-mute)" }}>{k.prefix}…</span></b>
                <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>{brandNames(k.brand_ids)} · {k.monthly_credit_budget} credits a month · {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleDateString()}` : "not used yet"}</span>
              </div>
              <button className="s-btn ghost sm" onClick={() => void revoke(k)} aria-label={`Revoke ${k.name}`}><Trash2 className="h-3.5 w-3.5" /> Revoke</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
