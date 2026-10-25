import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-server";
import { isTestEmail, nairobiDayStart, nairobiMonthStart, marginByFeature } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * The owner's numbers (2026-10-23): people, sign-ups, who's been active, work in progress and
 * failures, credits and AI cost, revenue and disputes. Owner only; test and QA accounts are kept
 * out. Who is on the site this second comes from the live channel in the page itself.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.status === 401 ? "Sign in first." : "This page is for the BlinkSpot owner." }, { status: admin.status });

  const now = new Date();
  const today = nairobiDayStart(now), week = nairobiDayStart(now, 6), month = nairobiMonthStart(now);
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString(), dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const halfHourAgo = new Date(now.getTime() - 30 * 60_000).toISOString();

  const [clientsQ, usageQ, runningQ, stuckQ, failedQ, txQ, paidQ, disputesQ] = await Promise.all([
    supabaseAdmin.from("clients").select("id, contact_email, company_name, plan_tier, created_at").order("created_at", { ascending: false }).limit(5000),
    supabaseAdmin.from("ai_usage").select("client_id, feature, usd, credits_charged, ok, created_at").gte("created_at", month).limit(20000),
    supabaseAdmin.from("content").select("id, client_id, content_type", { count: "exact" }).in("generation_state", ["queued", "preparing", "generating"]).gte("updated_at", halfHourAgo).limit(500),
    supabaseAdmin.from("content").select("id", { count: "exact", head: true }).in("generation_state", ["queued", "preparing", "generating"]).lt("updated_at", halfHourAgo),
    supabaseAdmin.from("content").select("id, client_id, content_type, generation_error_code", { count: "exact" }).eq("generation_state", "failed").gte("updated_at", hourAgo).limit(500),
    supabaseAdmin.from("credit_transactions").select("client_id, amount, operation, created_at").gte("created_at", today).limit(20000),
    supabaseAdmin.from("payments").select("client_id, kind, item, amount_minor, currency, paid_at").eq("status", "paid").gte("paid_at", month).limit(5000),
    supabaseAdmin.from("payments").select("reference, amount_minor, currency, customer_email, failure, paid_at").like("failure", "dispute%").order("paid_at", { ascending: false }).limit(20),
  ]);

  const clients = clientsQ.data ?? [];
  const real = clients.filter((c) => !isTestEmail(c.contact_email as string | null));
  const realIds = new Set(real.map((c) => c.id as string));
  const isReal = (id: unknown) => typeof id === "string" && realIds.has(id);
  const usage = (usageQ.data ?? []).filter((u) => isReal(u.client_id));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const usdToday = sum(usage.filter((u) => String(u.created_at) >= today).map((u) => Number(u.usd) || 0));
  const usdMonth = sum(usage.map((u) => Number(u.usd) || 0));
  const features: Record<string, { calls: number; usd: number; failed: number }> = {};
  for (const u of usage.filter((x) => String(x.created_at) >= today)) {
    const f = (features[String(u.feature)] ??= { calls: 0, usd: 0, failed: 0 });
    f.calls += 1; f.usd += Number(u.usd) || 0; if (u.ok === false) f.failed += 1;
  }
  const tx = (txQ.data ?? []).filter((t) => isReal(t.client_id));
  const paid = (paidQ.data ?? []).filter((p) => isReal(p.client_id));
  const paidToday = paid.filter((p) => String(p.paid_at) >= today);
  const currency = String(paid[0]?.currency ?? "KES");

  return NextResponse.json({
    at: now.toISOString(),
    people: { total: real.length, tests: clients.length - real.length, today: real.filter((c) => String(c.created_at) >= today).length, week: real.filter((c) => String(c.created_at) >= week).length,
      paying: real.filter((c) => c.plan_tier && c.plan_tier !== "free").length,
      recent: real.slice(0, 8).map((c) => ({ email: c.contact_email, company: c.company_name, plan: c.plan_tier, at: c.created_at })) },
    active: { day: new Set(usage.filter((u) => String(u.created_at) >= dayAgo).map((u) => u.client_id)).size, month: new Set(usage.map((u) => u.client_id)).size },
    work: { running: (runningQ.data ?? []).filter((r) => isReal(r.client_id)).length, runningAll: runningQ.count ?? 0, stuck: stuckQ.count ?? 0,
      failedHour: (failedQ.data ?? []).filter((r) => isReal(r.client_id)).length, failedHourAll: failedQ.count ?? 0,
      failureCodes: Object.entries((failedQ.data ?? []).reduce<Record<string, number>>((m, r) => { const k = String(r.generation_error_code ?? "unknown"); m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5) },
    credits: { spentToday: -sum(tx.filter((t) => t.operation === "debit" || Number(t.amount) < 0).map((t) => Math.min(0, Number(t.amount)))), refundedToday: sum(tx.filter((t) => t.operation === "refund").map((t) => Math.abs(Number(t.amount)))) },
    ai: { margins: marginByFeature(usage), usdToday: Number(usdToday.toFixed(2)), usdMonth: Number(usdMonth.toFixed(2)), features: Object.entries(features).sort((a, b) => b[1].usd - a[1].usd).slice(0, 8).map(([k, v]) => ({ feature: k, ...v, usd: Number(v.usd.toFixed(3)) })) },
    revenue: { currency, today: sum(paidToday.map((p) => Number(p.amount_minor) / 100)), month: sum(paid.map((p) => Number(p.amount_minor) / 100)), paymentsMonth: paid.length },
    disputes: (disputesQ.data ?? []).map((d) => ({ reference: d.reference, amount: Number(d.amount_minor) / 100, currency: d.currency, email: d.customer_email, note: d.failure, at: d.paid_at })),
  });
}
