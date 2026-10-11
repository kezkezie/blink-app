"use client";

import { useEffect, useState } from "react";
import { Check, Coins, Loader2, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { PLANS, TOP_UP, planOf, type PlanTier } from "@/lib/plans";
import { formatCredits } from "@/components/studio/hooks";

/**
 * Billing & credits in the studio look (2026-10-11; the classic page stays at /dashboard/billing).
 * Prices and promises come from lib/plans.ts, the same list the homepage shows. Online checkout
 * (Paystack) isn't live yet, so upgrading and topping up are an email to the team.
 */
type Txn = { id: string; amount: number; description: string | null; operation: string; created_at: string };
const ORDER: PlanTier[] = ["free", "starter", "pro", "agency"];
const mail = (subject: string) => `mailto:info@blinkspot.io?subject=${encodeURIComponent(subject)}`;

export default function BillingPage() {
  const { clientId, loading } = useClient();
  const [plan, setPlan] = useState<PlanTier | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "weekly">("monthly");
  const [allTxns, setAllTxns] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    Promise.all([
      supabase.from("clients").select("plan_tier").eq("id", clientId).maybeSingle(),
      supabase.from("credit_balances").select("balance").eq("client_id", clientId).maybeSingle(),
      supabase.from("credit_transactions").select("id, amount, description, operation, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(25),
    ]).then(([c, b, t]) => {
      if (cancelled) return;
      setPlan(planOf(c.data?.plan_tier));
      setBalance(b.data?.balance ?? 0);
      setTxns((t.data ?? []) as Txn[]);
    });
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading || plan === null) return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--s-mute)" }} /></div>;
  const current = PLANS.find((p) => p.id === plan)!;
  const rank = ORDER.indexOf(plan);

  return (
    <div className="grid gap-8 s-reading">
      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
        <div className="s-card p-5 flex flex-col gap-2">
          <span className="s-label">Your plan</span>
          <div className="flex items-baseline gap-3 flex-wrap">
            <b className="text-[26px] font-semibold tracking-tight">{current.name}</b>
            <span className="text-[13px]" style={{ color: "var(--s-soft)" }}>{current.price.monthly ? `$${current.price.monthly} a month` : "Free"} · {current.brands} brand{current.brands === 1 ? "" : "s"} · {current.credits.monthly}</span>
          </div>
          <ul className="grid gap-1.5 mt-2">
            {current.features.map((f) => <li key={f} className="text-[13px] flex gap-2" style={{ color: "var(--s-soft)" }}><Check className="h-4 w-4 shrink-0 mt-px" style={{ color: "var(--s-ok)" }} />{f}</li>)}
          </ul>
        </div>
        <div className="s-card p-5 flex flex-col gap-3">
          <span className="s-label">Credits</span>
          <div className="flex items-baseline gap-2"><Coins className="h-5 w-5 self-center" style={{ color: "var(--s-accent)" }} /><b className="text-[30px] font-semibold tracking-tight mono">{formatCredits(balance)}</b><span className="text-[13px]" style={{ color: "var(--s-mute)" }}>left</span></div>
          <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>The price is on every button before you press it. Failed renders are refunded automatically.</p>
          <div className="flex-1" />
          <a href={mail(`Top up: ${TOP_UP.credits} credits for $${TOP_UP.usd}`)} className="s-btn primary justify-between"><span>Top up {TOP_UP.credits.toLocaleString("en-US")} credits</span><span className="cost">${TOP_UP.usd}</span></a>
        </div>
      </div>

      <section>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-[18px] font-semibold">Plans</h2>
          <div className="flex-1" />
          <div className="s-seg" role="group" aria-label="Billing cycle">
            <button aria-pressed={cycle === "monthly"} onClick={() => setCycle("monthly")}>Monthly</button>
            <button aria-pressed={cycle === "weekly"} onClick={() => setCycle("weekly")}>Weekly</button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => {
            const isCurrent = p.id === plan;
            const up = ORDER.indexOf(p.id) > rank;
            return (
              <div key={p.id} className="s-card p-5 flex flex-col gap-3" style={{ borderColor: isCurrent ? "var(--s-accent)" : p.popular ? "var(--s-line-2)" : undefined }}>
                <div className="flex items-center gap-2"><b className="text-[15px]">{p.name}</b>{p.popular && <span className="s-badge ai">most picked</span>}{isCurrent && <span className="s-badge ok">current</span>}</div>
                <div className="flex items-baseline gap-1"><b className="text-[28px] font-semibold tracking-tight">${p.price[cycle]}</b><span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{p.price[cycle] ? `/ ${cycle === "monthly" ? "month" : "week"}` : ""}</span></div>
                <p className="text-[13px] mono" style={{ color: "var(--s-text)" }}>{p.credits[cycle]}</p>
                <p className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>{p.note}</p>
                <ul className="grid gap-1.5 flex-1 content-start">
                  {p.features.map((f) => <li key={f} className="text-[12.5px] flex gap-2" style={{ color: "var(--s-soft)" }}><Check className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "var(--s-ok)" }} />{f}</li>)}
                </ul>
                {isCurrent ? <span className="s-btn" aria-disabled="true" style={{ opacity: 0.6 }}>Your plan</span>
                  : p.id === "free" ? <span className="text-[12px] text-center" style={{ color: "var(--s-mute)" }}>Included with every account</span>
                  : <a href={mail(`${up ? "Upgrade" : "Change"} to ${p.name} (${cycle})`)} className={`s-btn${up ? " primary" : ""}`}>{up ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}</a>}
              </div>
            );
          })}
        </div>
        <p className="text-[12.5px] mt-3 flex items-center gap-1.5" style={{ color: "var(--s-mute)" }}><Mail className="h-3.5 w-3.5" /> Online checkout is on its way. Until then, email us from your account address and we switch you over the same day.</p>
      </section>

      <section>
        <h3 className="s-section-h">Recent credit activity</h3>
        {txns && txns.length ? (
          <div className="s-card divide-y" style={{ borderColor: "var(--s-line)" }}>
            {(allTxns ? txns : txns.slice(0, 8)).map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderColor: "var(--s-line)" }}>
                <span className="text-[13px] flex-1 min-w-0 truncate" style={{ color: "var(--s-soft)" }}>{(t.description || t.operation).replace(/\s*\[vid:[^\]]*\]/, "")}</span>
                <span className="text-[11.5px] shrink-0" style={{ color: "var(--s-mute)" }}>{new Date(t.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                <b className="mono text-[13px] w-16 text-right shrink-0" style={{ color: t.amount > 0 ? "var(--s-ok)" : "var(--s-text)" }}>{t.amount > 0 ? "+" : ""}{t.amount}</b>
              </div>
            ))}
            {!allTxns && txns.length > 8 && <button className="w-full text-[12.5px] py-2.5" style={{ color: "var(--s-soft)" }} onClick={() => setAllTxns(true)}>Show all {txns.length}</button>}
          </div>
        ) : <div className="s-empty"><h3>No credit activity yet</h3><p className="text-[13px]">What you make, and any refunds, will show here.</p></div>}
      </section>
    </div>
  );
}
