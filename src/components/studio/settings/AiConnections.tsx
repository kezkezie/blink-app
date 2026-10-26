"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBrandStore, isSharedBrand } from "@/app/store/useBrandStore";

/**
 * Settings > AI connections (2026-10-20): a key per AI app (Claude Code, Hermes, OpenClaw, any MCP
 * client), scoped to brands, with a monthly credit budget (200 by default). The key shows once,
 * with the setup line for each app. It can always read brands, the Library and the calendar and
 * price things; "Can make things" lets it make images, videos, carousels and captions within the
 * budget, "Can post" lets it approve, schedule and publish (2026-10-21).
 */
type Key = { id: string; name: string; prefix: string; brand_ids: string[] | null; permissions?: string[]; monthly_credit_budget: number; created_at: string; last_used_at: string | null };
const PERMS = [
  { id: "spend", label: "Can make things", line: "Images, videos, carousels and captions, within its monthly budget" },
  { id: "post", label: "Can post", line: "Approve, schedule and publish on this brand's connected accounts" },
] as const;
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
  const [form, setForm] = useState<{ name: string; all: boolean; picked: string[]; budget: number; perms: string[] } | null>(null);
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
      const res = await fetch("/api/ai-connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, budget: form.budget, permissions: form.perms, ...(form.all ? {} : { brandIds: form.picked }) }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.token) throw new Error(d.error || "Couldn't create it.");
      setMade({ token: d.token, name: form.name }); setForm(null); void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create it."); }
    finally { setMaking(false); }
  }
  async function setPerm(k: Key, perm: string, on: boolean) {
    const next = [...new Set([...(k.permissions ?? ["read"]).filter((p) => p !== perm), ...(on ? [perm] : [])])];
    setKeys((ks) => ks?.map((x) => (x.id === k.id ? { ...x, permissions: next } : x)) ?? ks);
    const res = await fetch("/api/ai-connections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: k.id, permissions: next }) });
    if (!res.ok) { toast.error("Couldn't change it."); void load(); }
  }
  async function revoke(k: Key) {
    const res = await fetch(`/api/ai-connections?id=${k.id}`, { method: "DELETE" });
    if (res.ok) { toast.success(`${k.name} can't reach BlinkSpot any more.`); void load(); } else toast.error("Couldn't revoke it.");
  }
  const copy = (text: string, id: string) => { void navigator.clipboard?.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 1500); }); };
  const brandNames = (ids: string[] | null) => (!ids ? "All brands" : ids.map((id) => brands.find((b) => b.id === id)?.brand_name ?? "a brand").join(", "));

  return (
    <section id="ai-connections" className="s-card p-5 grid gap-4 min-w-0 scroll-mt-24" style={{ gridTemplateColumns: "minmax(0, 1fr)" }} aria-label="AI connections">
      <div className="flex items-start gap-3">
        <Bot className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--s-ai)" }} />
        <div className="flex-1">
          <h2 className="text-[16px] font-semibold">AI connections</h2>
          <p className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>Use BlinkSpot from Claude, Claude Code, Hermes, OpenClaw or any MCP app. Each connection gets its own key, only the brands you pick and a monthly credit budget. It can always read your brands, Library and calendar and price things. Turn on making (images, videos, carousels, captions) and posting per connection.</p>
        </div>
        {!form && !made && <button className="s-btn sm" onClick={() => setForm({ name: "", all: true, picked: [], budget: 200, perms: ["spend"] })}><Plus className="h-3.5 w-3.5" /> New connection</button>}
      </div>

      {/* Claude subscribers sign in instead of pasting a key (Kezie, 2026-10-26; lib/oauth.ts). Steps from support.claude.com. */}
      <div className="rounded-xl p-4 grid gap-2" style={{ border: "1px solid var(--s-line-2)", background: "var(--s-bg)" }} aria-label="Connect Claude">
        <b className="text-[13.5px]">Have Claude? Connect it, no key needed</b>
        <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>Claude does the thinking on your own Claude plan (Free has one custom connector; Pro, Max, Team and Enterprise more). Pictures and videos it makes use your BlinkSpot credits.</p>
        <ol className="grid gap-1.5 text-[12.5px] list-decimal pl-5" style={{ color: "var(--s-soft)" }}>
          <li>In Claude (claude.ai, the desktop app or the phone app), open <b style={{ color: "var(--s-text)" }}>Customize &gt; Connectors</b>, click <b style={{ color: "var(--s-text)" }}>+ Add</b>, then <b style={{ color: "var(--s-text)" }}>Add custom connector</b>.</li>
          <li>Name it <b style={{ color: "var(--s-text)" }}>BlinkSpot</b> and paste this URL:
            <span className="flex items-center gap-2 mt-1"><code className="mono text-[11.5px] px-2 py-1 rounded" style={{ background: "var(--s-raised)" }}>{URL}</code>
              <button className="s-btn ghost sm" onClick={() => copy(URL, "claude-url")} aria-label="Copy the connector URL">{copied === "claude-url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button></span></li>
          <li>Click <b style={{ color: "var(--s-text)" }}>Add</b>, then <b style={{ color: "var(--s-text)" }}>Connect</b>. Sign in to BlinkSpot, pick the brands and what Claude may do, and press <b style={{ color: "var(--s-text)" }}>Allow</b>.</li>
          <li>In a chat, click <b style={{ color: "var(--s-text)" }}>+ &gt; Connectors</b>, turn on BlinkSpot, and ask: &ldquo;Make a launch poster for my brand&rdquo; or &ldquo;Plan next week&apos;s posts&rdquo;.</li>
        </ol>
        <p className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Team and Enterprise: an owner adds it in Organization settings &gt; Connectors first. Claude Code: <span className="mono">claude mcp add --transport http blinkspot {URL}</span>, then sign in from <span className="mono">/mcp</span>. It shows below as &ldquo;Claude (signed in)&rdquo;, with Revoke.</p>
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
          <div className="grid gap-1.5 text-[12px]" style={{ color: "var(--s-soft)" }}>What it may do
            {PERMS.map((p) => (
              <label key={p.id} className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={form.perms.includes(p.id)} onChange={(e) => setForm({ ...form, perms: e.target.checked ? [...form.perms, p.id] : form.perms.filter((x) => x !== p.id) })} style={{ accentColor: "var(--s-accent)" }} aria-label={p.label} />
                <span><b style={{ color: "var(--s-text)" }}>{p.label}</b> · {p.line}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="s-btn primary sm" onClick={() => void create()} disabled={making || !form.name.trim() || (!form.all && !form.picked.length)}>{making ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Create key</button>
            <button className="s-btn ghost sm" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {made && (
        <div className="rounded-xl p-4 grid gap-3 min-w-0" style={{ gridTemplateColumns: "minmax(0, 1fr)", border: "1px solid var(--s-accent)", background: "color-mix(in oklab, var(--s-accent) 6%, transparent)" }} role="region" aria-label="New key">
          <b className="text-[13.5px]">{made.name}: your key</b>
          <p className="text-[12px]" style={{ color: "var(--s-soft)" }}>Copy it now: BlinkSpot keeps only a fingerprint and can&apos;t show it again. Anyone with it can use your brands the way you allowed, so keep it private and never paste it in a screenshot or chat. If it leaks, revoke it and make a new one.</p>
          <div className="flex gap-2 items-center">
            <code className="mono text-[12px] flex-1 min-w-0 truncate rounded-md px-2 py-1.5" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)" }} aria-label="Key">{made.token}</code>
            <button className="s-btn sm" onClick={() => copy(made.token, "key")}>{copied === "key" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy</button>
          </div>
          {setups(made.token).map((s) => (
            <div key={s.app} className="grid gap-1 min-w-0">
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
              <div className="flex gap-1.5" role="group" aria-label={`What ${k.name} may do`}>
                {PERMS.map((p) => {
                  const on = (k.permissions ?? []).includes(p.id);
                  return <button key={p.id} className="s-chip" aria-pressed={on} title={p.line} onClick={() => void setPerm(k, p.id, !on)}>{p.label}</button>;
                })}
              </div>
              <button className="s-btn ghost sm" onClick={() => void revoke(k)} aria-label={`Revoke ${k.name}`}><Trash2 className="h-3.5 w-3.5" /> Revoke</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
