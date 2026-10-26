"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AuthShell } from "@/components/auth/AuthShell";
import { DEFAULT_KEY_BUDGET } from "@/lib/mcp/keys";

/**
 * "Connect BlinkSpot" from Claude (or another AI app): the consent screen of the OAuth sign-in
 * (lib/oauth.ts). The person sees which app asks and where it goes back to, picks the brands and
 * what it may do (read always; make things spends credits; posting is separate), and a monthly budget.
 */
type Brand = { id: string; brand_name: string };
const CAN = [
  { id: "spend", label: "Make pictures, videos, carousels and motion graphics", line: "Spends credits, up to the monthly budget below." },
  { id: "post", label: "Approve, schedule and post", line: "Only on the brand's own connected accounts." },
] as const;

function Consent() {
  const q = useSearchParams();
  const ask = useMemo(() => ({
    clientId: q.get("client_id") ?? "", redirectUri: q.get("redirect_uri") ?? "", state: q.get("state") ?? undefined,
    challenge: q.get("code_challenge") ?? "", method: q.get("code_challenge_method") ?? "", responseType: q.get("response_type") ?? "",
  }), [q]);
  const [app, setApp] = useState<{ name: string; host: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [can, setCan] = useState<Set<string>>(new Set(["spend"]));
  const [budget, setBudget] = useState(DEFAULT_KEY_BUDGET);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    (async () => {
      if (ask.responseType !== "code") { setError("This sign-in link isn't valid. Start connecting again from the app."); return; }
      const r = await fetch(`/api/oauth/authorize?client_id=${encodeURIComponent(ask.clientId)}&redirect_uri=${encodeURIComponent(ask.redirectUri)}`, { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (off) return;
      if (!r.ok) { setError(d.error || "This sign-in link isn't valid."); return; }
      setApp(d);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.replace(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
      const { data: client } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
      const { data: rows } = client ? await supabase.from("brand_profiles").select("id, brand_name").eq("client_id", client.id).eq("is_active", true).order("created_at") : { data: [] };
      if (off) return;
      setBrands((rows ?? []) as Brand[]);
      setPicked(new Set(((rows ?? []) as Brand[]).map((b) => b.id)));
    })().catch(() => setError("Couldn't load this sign-in. Try again."));
    return () => { off = true; };
  }, [ask]);

  const back = (params: Record<string, string>) => {
    const u = new URL(ask.redirectUri);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (ask.state) u.searchParams.set("state", ask.state);
    window.location.href = u.toString();
  };

  async function allow() {
    if (!brands?.length || !picked.size) return;
    setBusy(true); setError(null);
    const all = picked.size === brands.length;
    const r = await fetch("/api/oauth/authorize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: ask.clientId, redirect_uri: ask.redirectUri, code_challenge: ask.challenge, code_challenge_method: ask.method, state: ask.state, permissions: ["read", ...can], brandIds: all ? null : [...picked], budget }),
    }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok || !d?.redirect) { setBusy(false); setError(d?.error || "Couldn't connect. Try again."); return; }
    window.location.href = d.redirect;
  }

  return (
    <AuthShell
      title={app ? `Connect ${app.name} to BlinkSpot` : "Connect an AI app"}
      subtitle={app ? `${app.name} will use your BlinkSpot brands from its own chats. You choose what it can do, and you can disconnect it any time in Settings > AI connections.` : "Checking the sign-in link…"}
    >
      <div className="grid gap-4">
        {error && <p className="text-[13.5px]" role="alert" style={{ color: "var(--s-danger)" }}>{error}</p>}
        {app && !brands && !error && <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--s-soft)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading your brands…</div>}
        {app && brands && (
          <>
            <div className="flex items-start gap-2 rounded-xl p-3 text-[12.5px]" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)", color: "var(--s-soft)" }}>
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--s-ok)" }} />
              <span>After you allow it, you go back to <b style={{ color: "var(--s-text)" }}>{app.host}</b>. Only allow apps you started connecting yourself.</span>
            </div>
            <fieldset className="grid gap-1.5">
              <legend className="text-[12px] mb-1" style={{ color: "var(--s-mute)" }}>Brands it can use</legend>
              {brands.length === 0 && <p className="text-[13px]" style={{ color: "var(--s-warn)" }}>You don&apos;t have a brand yet. Make one in BlinkSpot first.</p>}
              {brands.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-[13.5px] cursor-pointer">
                  <input type="checkbox" checked={picked.has(b.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n; })} /> {b.brand_name}
                </label>
              ))}
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="text-[12px] mb-1" style={{ color: "var(--s-mute)" }}>What it can do</legend>
              <span className="flex items-center gap-2 text-[13.5px]"><Check className="h-4 w-4" style={{ color: "var(--s-ok)" }} /> See your brands, Library, prices and calendar</span>
              {CAN.map((c) => (
                <label key={c.id} className="grid gap-0.5 cursor-pointer">
                  <span className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={can.has(c.id)} onChange={(e) => setCan((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} /> {c.label}</span>
                  <span className="text-[11.5px] pl-6" style={{ color: "var(--s-mute)" }}>{c.line}</span>
                </label>
              ))}
            </fieldset>
            {can.has("spend") && (
              <label className="grid gap-1 text-[12.5px]" style={{ color: "var(--s-soft)" }}>
                Monthly budget (credits)
                <input className="s-input" type="number" min={0} max={100000} value={budget} onChange={(e) => setBudget(Math.max(0, Math.min(100_000, Math.round(Number(e.target.value) || 0))))} aria-label="Monthly budget in credits" />
              </label>
            )}
            <div className="grid gap-2">
              <button className="s-btn primary justify-center" style={{ height: 44 }} disabled={busy || !picked.size} onClick={() => void allow()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Allow
              </button>
              <button className="s-btn justify-center" style={{ height: 40 }} disabled={busy} onClick={() => back({ error: "access_denied" })}>Don&apos;t allow</button>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export default function AuthorizePage() {
  return <Suspense fallback={null}><Consent /></Suspense>;
}
