"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CreditCard, Loader2, RefreshCw, Sparkles, Users, Zap } from "lucide-react";
import { useLivePresence } from "@/components/studio/presence";
import { CHEAPEST_CREDIT_USD, LOAD_LINE, loadLevel, type FeatureMargin, type Load } from "@/lib/admin";

/**
 * The owner's dashboard (Kezie, 2026-10-23: "a simple dashboard that would tell me how many people
 * are logged into the website"). Live: who is on the studio right now (the presence channel), how
 * busy it is against the capacity plan. Numbers: people, activity, work in progress and failures,
 * credits, AI cost, revenue, disputes. Owner only (the numbers come from /api/admin/stats).
 */
type Stats = {
  at: string;
  people: { total: number; tests: number; today: number; week: number; paying: number; recent: Array<{ email: string | null; company: string | null; plan: string | null; at: string }> };
  active: { day: number; month: number };
  work: { running: number; runningAll: number; stuck: number; failedHour: number; failedHourAll: number; failureCodes: Array<[string, number]> };
  credits: { spentToday: number; refundedToday: number };
  ai: { usdToday: number; usdMonth: number; features: Array<{ feature: string; calls: number; usd: number; failed: number }>; margins?: FeatureMargin[] };
  revenue: { currency: string; today: number; month: number; paymentsMonth: number };
  disputes: Array<{ reference: string; amount: number; currency: string; email: string | null; note: string; at: string | null }>;
};
const LOAD_TONE: Record<Load, string> = { quiet: "var(--s-mute)", comfortable: "var(--s-ok)", busy: "var(--s-warn)", strained: "var(--s-danger)" };
const SECTION_LABEL: Record<string, string> = { create: "Create", library: "Library", plan: "Plan", brand: "Brand", sites: "Website", account: "Account" };
const n = (v: number) => v.toLocaleString("en-US");
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export default function AdminPage() {
  const live = useLivePresence();
  const [stats, setStats] = useState<Stats | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/stats", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setDenied(d.error || "Couldn't load the numbers.");
      else { setStats(d as Stats); setDenied(null); }
    } finally { setLoading(false); }
  };
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, []);

  if (denied) return <div className="s-empty"><h3>Admin</h3><p className="text-[13px]">{denied}</p></div>;
  const running = stats?.work.runningAll ?? 0;
  const level = loadLevel(live.people, running);

  const tile = (label: string, value: string, sub?: string, tone?: string) => (
    <div className="s-card p-4 grid gap-1 min-w-0">
      <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>{label}</span>
      <b className="text-[24px] leading-tight tracking-tight" style={tone ? { color: tone } : undefined}>{value}</b>
      {sub && <span className="text-[11.5px]" style={{ color: "var(--s-soft)" }}>{sub}</span>}
    </div>
  );

  return (
    <div className="grid gap-4 mx-auto w-full max-w-[1280px]">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-[18px] font-semibold">Admin</h2>
        <span className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>Only you can see this. Test and QA accounts are left out of the people counts.</span>
        <div className="flex-1" />
        {stats && <span className="mono text-[11.5px]" style={{ color: "var(--s-mute)" }}>updated {new Date(stats.at).toLocaleTimeString()}</span>}
        <button className="s-btn ghost sm" onClick={() => void load()} disabled={loading} aria-label="Refresh">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}</button>
      </div>

      {/* Live */}
      <div className="s-card p-5 grid gap-3" style={{ borderColor: `color-mix(in oklab, ${LOAD_TONE[level]} 45%, var(--s-line))` }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: live.connected ? "var(--s-ok)" : "var(--s-mute)", boxShadow: live.connected ? "0 0 0 4px color-mix(in oklab, var(--s-ok) 25%, transparent)" : "none" }} />
          <b className="text-[13px]">Live now</b>
          <span className="s-badge" style={{ color: LOAD_TONE[level] }}>{level[0].toUpperCase() + level.slice(1)}</span>
          <span className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>{LOAD_LINE[level]}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {tile("People on BlinkSpot", live.connected ? n(live.people) : "…", `${n(live.looking)} looking at it right now · ${n(live.tabs)} tab${live.tabs === 1 ? "" : "s"}`)}
          {tile("Being made now", n(running), "pictures and videos in progress", running > 20 ? "var(--s-danger)" : running > 10 ? "var(--s-warn)" : undefined)}
          {tile("Failed in the last hour", n(stats?.work.failedHourAll ?? 0), stats?.work.failureCodes.length ? stats.work.failureCodes.map(([k, v]) => `${k} ${v}`).join(" · ") : "none", (stats?.work.failedHourAll ?? 0) > 5 ? "var(--s-danger)" : undefined)}
          {tile("Stuck over 30 min", n(stats?.work.stuck ?? 0), "second tries pick these up", (stats?.work.stuck ?? 0) > 0 ? "var(--s-warn)" : undefined)}
        </div>
        {Object.keys(live.bySection).length > 0 && (
          <div className="flex flex-wrap gap-1.5">{Object.entries(live.bySection).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="s-badge">{SECTION_LABEL[k] ?? k} · {v}</span>)}</div>
        )}
      </div>

      {!stats ? <div className="s-skel h-40" /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tile("People", n(stats.people.total), `${n(stats.people.today)} joined today · ${n(stats.people.week)} this week`)}
            {tile("On a plan", n(stats.people.paying), `of ${n(stats.people.total)} people, including plans set by hand; payments show under revenue`)}
            {tile("Active", n(stats.active.day), `in the last 24 h · ${n(stats.active.month)} this month`)}
            {tile("Revenue this month", `${stats.revenue.currency} ${n(Math.round(stats.revenue.month))}`, `${n(stats.revenue.paymentsMonth)} payments · ${stats.revenue.currency} ${n(Math.round(stats.revenue.today))} today`)}
            {tile("Credits spent today", n(Math.round(stats.credits.spentToday)), `${n(Math.round(stats.credits.refundedToday))} refunded`)}
            {tile("AI cost today", `$${stats.ai.usdToday.toFixed(2)}`, `$${stats.ai.usdMonth.toFixed(2)} this month`)}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="s-card p-4 grid gap-2 content-start">
              <b className="text-[13px] flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" style={{ color: stats.disputes.length ? "var(--s-danger)" : "var(--s-mute)" }} /> Card disputes</b>
              {stats.disputes.length ? (
                <>
                  <span className="text-[12px]" style={{ color: "var(--s-danger)" }}>Paystack gives you 16 hours to answer each one, in its dashboard, with what was delivered.</span>
                  {stats.disputes.map((d) => <div key={d.reference} className="flex items-center gap-2 text-[12.5px]"><span className="mono">{d.reference}</span><span className="flex-1 min-w-0 truncate" style={{ color: "var(--s-soft)" }}>{d.email} · {d.note}</span><b>{d.currency} {n(d.amount)}</b></div>)}
                  <a className="s-btn sm justify-self-start" href="https://dashboard.paystack.com/#/disputes" target="_blank" rel="noreferrer"><CreditCard className="h-3.5 w-3.5" /> Open Paystack disputes</a>
                </>
              ) : <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>None. If one comes in it shows here, and you get a Telegram message once the bot is set up.</span>}
            </div>
            <div className="s-card p-4 grid gap-2 content-start">
              <b className="text-[13px] flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" style={{ color: "var(--s-ai)" }} /> AI today, by feature</b>
              {stats.ai.features.length ? stats.ai.features.map((f) => (
                <div key={f.feature} className="flex items-center gap-2 text-[12.5px]"><span className="flex-1 min-w-0 truncate">{f.feature}</span><span style={{ color: "var(--s-mute)" }}>{n(f.calls)} calls{f.failed ? ` · ${f.failed} failed` : ""}</span><b className="mono">${f.usd.toFixed(2)}</b></div>
              )) : <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Nothing yet today.</span>}
            </div>
          </div>

          {/* Is every credit making money? (2026-10-25) What the AI cost per credit charged, this month. */}
          <div className="s-card p-4 grid gap-2" role="region" aria-label="Margin per credit">
            <b className="text-[13px] flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Margin per credit, this month</b>
            <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Against the cheapest credit you sell (${CHEAPEST_CREDIT_USD.toFixed(3)} in the biggest pack) after a 3.8% card fee. Plans sell credits at about twice that, so their margin is higher. Red means a feature costs more than it earns.</span>
            {(stats.ai.margins ?? []).filter((m) => m.level !== "free").map((m) => (
              <div key={m.feature} className="flex items-center gap-2 text-[12.5px]">
                <span className="flex-1 min-w-0 truncate">{m.feature}</span>
                <span style={{ color: "var(--s-mute)" }}>{n(m.runs)} runs · ${m.costPerCredit!.toFixed(4)} a credit</span>
                <span className={`s-badge ${m.level === "ok" ? "ok" : m.level === "thin" ? "warn" : "danger"}`}>{Math.round(m.margin! * 100)}%</span>
              </div>
            ))}
            {(stats.ai.margins ?? []).some((m) => m.level === "free" && m.freeUsd > 0) && (
              <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Free to people (no credits): {(stats.ai.margins ?? []).filter((m) => m.level === "free" && m.freeUsd > 0).slice(0, 6).map((m) => `${m.feature} $${m.freeUsd.toFixed(2)}`).join(" · ")}</span>
            )}
          </div>

          <div className="s-card p-4 grid gap-2">
            <b className="text-[13px] flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Newest people</b>
            {stats.people.recent.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-[12.5px] min-w-0"><span className="flex-1 min-w-0 truncate">{p.email}{p.company ? <span style={{ color: "var(--s-mute)" }}> · {p.company}</span> : null}</span><span className="s-badge">{p.plan ?? "free"}</span><span className="mono text-[11px]" style={{ color: "var(--s-mute)" }}>{ago(p.at)}</span></div>
            ))}
            <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>{n(stats.people.tests)} test and QA accounts not counted.</span>
          </div>
          <span className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--s-mute)" }}><Activity className="h-3 w-3" /> Live counts studio tabs that are open now. <Zap className="h-3 w-3" /> Busy and strained follow the capacity plan: about 10 pictures at once is comfortable for one n8n server, 20 to 30 is where it starts to fail.</span>
        </>
      )}
    </div>
  );
}
