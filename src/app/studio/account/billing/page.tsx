"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Coins, CreditCard, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { CREDIT_PACKS, PLANS, TOP_UP_NEEDS_PLAN, canTopUp, planOf, type PlanTier } from "@/lib/plans";
import { formatCredits } from "@/components/studio/hooks";
import { creditsByBrand, type LedgerLine } from "@/lib/credits-by-brand";
import { FormSkeleton } from "@/components/studio/Skeletons";
import { track } from "@/lib/analytics";

/**
 * Billing & credits in the studio look (2026-10-11; the classic page stays at /dashboard/billing).
 * Prices and promises come from lib/plans.ts, the same list the homepage shows.
 * 2026-10-12: credit packs and plans by subscription, paid on Paystack's own page. 2026-10-13:
 * packs from Starter up (Free upgrades).
 * (lib/payments). Until PAYSTACK_SECRET_KEY is set, the buttons fall back to an email.
 */
type Txn = { id: string; amount: number; description: string | null; operation: string; created_at: string; brand_id: string | null };
const ORDER: PlanTier[] = ["free", "starter", "pro", "agency"];
const mail = (subject: string) => `mailto:info@blinkspot.io?subject=${encodeURIComponent(subject)}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

type Sub = { status: string | null; cycle: string | null; periodEnd: string | null; online: boolean };
type PayStatus = { online: boolean; test?: boolean; currency?: string | null; fxPerUsd?: number | null; loaded?: boolean };

function BillingPage() {
  const { ownClientId: clientId, loading } = useClient();
  const router = useRouter();
  const search = useSearchParams();
  const [plan, setPlan] = useState<PlanTier | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [byBrand, setByBrand] = useState<Array<{ brandId: string | null; used: number }> | null>(null);
  const [brandNames, setBrandNames] = useState<Record<string, string>>({});
  const [cycle, setCycle] = useState<"monthly" | "weekly">("monthly");
  const [allTxns, setAllTxns] = useState(false);
  const [pay, setPay] = useState<PayStatus>({ online: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetch("/api/billing/status", { cache: "no-store" }).then((r) => r.json()).then((d: PayStatus) => setPay({ ...d, loaded: true })).catch(() => setPay({ online: false, loaded: true }));
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    Promise.all([
      supabase.from("clients").select("plan_tier, billing_status, billing_cycle, current_period_end, billing_subscription_code").eq("id", clientId).maybeSingle(),
      supabase.from("credit_balances").select("balance").eq("client_id", clientId).maybeSingle(),
      supabase.from("credit_transactions").select("id, amount, description, operation, created_at, brand_id").eq("client_id", clientId).order("created_at", { ascending: false }).limit(25),
      // Credits by brand, last 30 days (2026-10-14).
      supabase.from("credit_transactions").select("amount, brand_id, operation, description").eq("client_id", clientId).gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(5000),
      supabase.from("brand_profiles").select("id, brand_name").eq("client_id", clientId),
    ]).then(([c, b, t, m, names]) => {
      if (cancelled) return;
      setPlan(planOf(c.data?.plan_tier));
      setSub({ status: c.data?.billing_status ?? null, cycle: c.data?.billing_cycle ?? null, periodEnd: c.data?.current_period_end ?? null, online: !!c.data?.billing_subscription_code });
      setBalance(b.data?.balance ?? 0);
      setTxns((t.data ?? []) as Txn[]);
      setByBrand(creditsByBrand((m.data ?? []) as LedgerLine[]));
      setBrandNames(Object.fromEntries((names.data ?? []).map((n) => [n.id as string, (n.brand_name as string) || "Brand"])));
    });
    return () => { cancelled = true; };
  }, [clientId, tick]);

  // Back from the checkout page: confirm the payment (it can take a few seconds to settle).
  const returned = search.get("checkout");
  useEffect(() => {
    if (!returned || !clientId) return;
    let stop = false;
    const t0 = Date.now();
    const id = toast.loading("Confirming your payment…");
    const check = async () => {
      const r = await fetch(`/api/billing/verify?reference=${encodeURIComponent(returned)}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ status: "pending" }));
      if (stop) return;
      if (r.status === "paid") {
        toast.success(r.kind === "plan" ? `You're on ${String(r.plan).replace(/^./, (c: string) => c.toUpperCase())}. ${r.credits.toLocaleString("en-US")} credits added.` : `${r.credits.toLocaleString("en-US")} credits added. Thank you!`, { id });
        setTick((n) => n + 1);
      } else if (r.status === "failed") {
        toast.error(r.error || "The payment didn't go through. Nothing was charged.", { id });
      } else if (Date.now() - t0 < 30_000) { setTimeout(check, 2500); return; }
      else toast.info("Still confirming. If you were charged, the credits appear here within a few minutes.", { id });
      router.replace("/studio/account/billing", { scroll: false });
    };
    void check();
    return () => { stop = true; };
  }, [returned, clientId, router]);

  const checkout = useCallback(async (item: string, fallbackSubject: string) => {
    track("checkout_started", { item });
    // Never fall back to email just because the status hasn't arrived yet.
    if (!pay.loaded) { toast.info("One moment, opening payments…"); return; }
    if (!pay.online) { window.location.href = mail(fallbackSubject); return; }
    setBusy(item);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't open the payment page.");
      window.location.href = data.url;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't open the payment page."); setBusy(null); }
  }, [pay.online, pay.loaded]);

  const manage = useCallback(async () => {
    setBusy("manage");
    try {
      const res = await fetch("/api/billing/manage", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't open the subscription page.");
      window.location.href = data.url;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't open the subscription page."); setBusy(null); }
  }, []);

  if (loading || plan === null) return <FormSkeleton />;
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
          {plan !== "free" && sub?.periodEnd && (
            <p className="text-[12.5px] mt-1" style={{ color: sub.status === "cancelled" || sub.status === "paused" ? "var(--s-warn, #f5a524)" : "var(--s-mute)" }}>
              {sub.status === "cancelled" ? `Cancelled: stays ${current.name} until ${fmtDate(sub.periodEnd)}, then Free.` : sub.status === "paused" ? `The last renewal didn't go through. Update your card before ${fmtDate(sub.periodEnd)} to keep ${current.name}.` : `Renews by ${fmtDate(sub.periodEnd)}.`}
            </p>
          )}
          {sub?.online && <button className="s-btn sm self-start mt-1" disabled={busy === "manage"} onClick={manage}>{busy === "manage" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} Manage subscription</button>}
        </div>
        <div className="s-card p-5 flex flex-col gap-3">
          <span className="s-label">Credits</span>
          <div className="flex items-baseline gap-2"><Coins className="h-5 w-5 self-center" style={{ color: "var(--s-accent)" }} /><b className="text-[30px] font-semibold tracking-tight mono">{formatCredits(balance)}</b><span className="text-[13px]" style={{ color: "var(--s-mute)" }}>left</span></div>
          <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>Credits pay for every AI feature, on every plan. The price is on each button before you press it; failed renders are refunded automatically. Credits never expire.</p>
          <div className="flex-1" />
          {!canTopUp(plan) && (
            <div className="rounded-lg p-3 grid gap-2" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)" }} role="note">
              <p className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>{TOP_UP_NEEDS_PLAN}</p>
              <a href="#plans" className="s-btn sm primary self-start">See plans</a>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2" style={!canTopUp(plan) ? { opacity: 0.5 } : undefined}>
            {CREDIT_PACKS.map((p) => (
              <button key={p.id} className={`s-btn justify-between${p.id === "pack_800" && canTopUp(plan) ? " primary" : ""}`} disabled={!!busy || !canTopUp(plan)} onClick={() => checkout(p.id, `Top up: ${p.credits} credits for $${p.usd}`)} aria-label={`Buy ${p.credits} credits for $${p.usd}`}>
                <span className="flex items-center gap-1.5">{busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{p.credits.toLocaleString("en-US")}{"note" in p && <span className="text-[10.5px]" style={{ opacity: 0.75 }}>{p.note}</span>}</span>
                <span className="cost">${p.usd}</span>
              </button>
            ))}
          </div>
          {pay.online && pay.currency && pay.currency !== "USD" && <p className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Prices are in dollars; Paystack charges the same amount in {pay.currency}{pay.fxPerUsd ? ` (${pay.fxPerUsd.toLocaleString("en-US")} per $1, so $8 is ${pay.currency} ${(8 * pay.fxPerUsd).toLocaleString("en-US")})` : ""}.</p>}
          {pay.test && <span className="s-badge self-start">Test mode: use a Paystack test card</span>}
        </div>
      </div>

      <section id="plans" className="scroll-mt-20">
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
                  : <button className={`s-btn${up ? " primary" : ""}`} disabled={!!busy} onClick={() => checkout(`plan:${p.id}:${cycle}`, `${up ? "Upgrade" : "Change"} to ${p.name} (${cycle})`)}>{busy === `plan:${p.id}:${cycle}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{up ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}</button>}
              </div>
            );
          })}
        </div>
        {pay.online
          ? <p className="text-[12.5px] mt-3 flex items-center gap-1.5" style={{ color: "var(--s-mute)" }}><CreditCard className="h-3.5 w-3.5" /> Paid securely on Paystack&apos;s page. Plans renew automatically and add their credits each time; cancel any time from Manage subscription.</p>
          : <p className="text-[12.5px] mt-3 flex items-center gap-1.5" style={{ color: "var(--s-mute)" }}><Mail className="h-3.5 w-3.5" /> Online checkout is on its way. Until then, email us from your account address and we switch you over the same day.</p>}
      </section>

      <section>
        {byBrand && byBrand.length > 0 && (
          <div className="mb-6">
            <h3 className="s-section-h">Credits by brand · last 30 days</h3>
            <div className="s-card p-4 grid gap-2.5" aria-label="Credits by brand">
              {byBrand.map((r) => (
                <div key={r.brandId ?? "none"} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center">
                  <span className="text-[13px] truncate" style={{ color: r.brandId ? "var(--s-text)" : "var(--s-mute)" }}>{r.brandId ? brandNames[r.brandId] ?? "A deleted brand" : "Not tied to a brand (account, or before 14 Oct)"}</span>
                  <b className="mono text-[13px] text-right">{r.used.toLocaleString("en-US")} cr</b>
                  <div className="col-span-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--s-line)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, (r.used / byBrand[0].used) * 100)}%`, background: r.brandId ? "var(--s-accent)" : "var(--s-mute)" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <h3 className="s-section-h">Recent credit activity</h3>
        {txns && txns.length ? (
          <div className="s-card divide-y" style={{ borderColor: "var(--s-line)" }}>
            {(allTxns ? txns : txns.slice(0, 8)).map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderColor: "var(--s-line)" }}>
                <span className="text-[13px] flex-1 min-w-0 truncate" style={{ color: "var(--s-soft)" }}>{(t.description || t.operation).replace(/\s*\[[a-z]+:[^\]]*\]/g, "")}{t.brand_id && brandNames[t.brand_id] && <span style={{ color: "var(--s-mute)" }}> · {brandNames[t.brand_id]}</span>}</span>
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

export default function Page() {
  return <Suspense><BillingPage /></Suspense>;
}
