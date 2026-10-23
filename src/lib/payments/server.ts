import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-server";
import { CREDIT_PACKS, PLAN_CREDITS, PLANS, type PlanTier } from "@/lib/plans";
import { paystack } from "./paystack";
import type { Charge, PaymentProvider, ProviderEvent } from "./types";
import { sendAlert } from "@/lib/alerts";

/**
 * Buying credits and plans (2026-10-12). The routes call these; the database function
 * fulfill_payment grants what was bought exactly once (migration 20261012_payments).
 */
export function paymentProvider(): PaymentProvider {
  return paystack;
}

type PaidTier = Exclude<PlanTier, "free">;
export type Item =
  | { id: string; kind: "credit_pack"; credits: number; usd: number; label: string }
  | { id: string; kind: "plan"; tier: PaidTier; cycle: "monthly" | "weekly"; credits: number; usd: number; label: string };

/** "pack_800" or "plan:starter:monthly". */
export function itemFor(id: unknown): Item | null {
  if (typeof id !== "string") return null;
  const pack = CREDIT_PACKS.find((p) => p.id === id);
  if (pack) return { id, kind: "credit_pack", credits: pack.credits, usd: pack.usd, label: `${pack.credits.toLocaleString("en-US")} credits` };
  const m = /^plan:(starter|pro|agency):(monthly|weekly)$/.exec(id);
  if (!m) return null;
  const tier = m[1] as PaidTier;
  const cycle = m[2] as "monthly" | "weekly";
  const card = PLANS.find((p) => p.id === tier)!;
  return { id, kind: "plan", tier, cycle, credits: PLAN_CREDITS[tier][cycle], usd: card.price[cycle], label: `BlinkSpot ${card.name} (${cycle})` };
}

/** Our plan from the provider's plan name, for renewals ("BlinkSpot Starter (monthly)"). */
export function itemForPlanName(name: string | undefined): Item | null {
  const m = /^BlinkSpot (Starter|Pro|Agency) \((monthly|weekly)\)$/.exec(name ?? "");
  return m ? itemFor(`plan:${m[1].toLowerCase()}:${m[2]}`) : null;
}

export class CheckoutError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function startCheckout(opts: { clientId: string; email: string; itemId: unknown; appUrl: string }) {
  const provider = paymentProvider();
  if (!provider.configured()) throw new CheckoutError("Online payments aren't switched on yet.", 503);
  const item = itemFor(opts.itemId);
  if (!item) throw new CheckoutError("Unknown item.");
  const reference = `bs_${randomUUID().replace(/-/g, "")}`;
  const amountMinor = provider.toMinor(item.usd);
  // Switching plans: remember the subscription this one replaces (stopped once this is paid).
  const replaces = item.kind === "plan"
    ? ((await supabaseAdmin.from("clients").select("billing_subscription_code").eq("id", opts.clientId).maybeSingle()).data?.billing_subscription_code ?? null)
    : null;
  const { error } = await supabaseAdmin.from("payments").insert({
    replaces_subscription: replaces,
    client_id: opts.clientId, provider: provider.name, kind: item.kind, item: item.id, credits: item.credits,
    plan_tier: item.kind === "plan" ? item.tier : null, billing_cycle: item.kind === "plan" ? item.cycle : null,
    amount_minor: amountMinor, currency: provider.currency(), reference, customer_email: opts.email.toLowerCase(),
  });
  if (error) throw new CheckoutError("Couldn't start the payment. Try again.", 500);
  try {
    const { url } = await provider.startCheckout({
      email: opts.email, amountMinor, reference,
      callbackUrl: `${opts.appUrl.replace(/\/$/, "")}/studio/account/billing?checkout=${encodeURIComponent(reference)}`,
      metadata: { reference, client_id: opts.clientId, item: item.id },
      ...(item.kind === "plan" ? { plan: { name: item.label, interval: item.cycle, amountMinor } } : {}),
    });
    return { url, reference };
  } catch (e) {
    console.error("checkout: provider refused", e instanceof Error ? e.message : e);
    await supabaseAdmin.from("payments").update({ status: "failed", failure: "checkout_refused" }).eq("reference", reference);
    throw new CheckoutError("The payment page couldn't open. Try again in a minute.", 502);
  }
}

type Fulfilled = { ok: boolean; already?: boolean; credits?: number; kind?: string; error?: string };

/** Settle one charge the provider reports (redirect back or webhook). Safe to call twice. */
export async function settleCharge(charge: Charge): Promise<Fulfilled> {
  const provider = paymentProvider();
  if (!charge.reference) return { ok: false, error: "no_reference" };
  const { data: row } = await supabaseAdmin.from("payments").select("id, client_id, status, kind, replaces_subscription").eq("provider", provider.name).eq("reference", charge.reference).maybeSingle();

  if (charge.status !== "success") {
    if (charge.status === "failed" && row?.status === "pending") await supabaseAdmin.from("payments").update({ status: "failed", failure: "declined", provider_payload: charge.raw as object }).eq("id", row.id);
    return { ok: false, error: charge.status };
  }

  let previousSubscription: string | null = null;
  if (!row) {
    // A plan renewal: the provider made the reference. Find the account by its customer code.
    const item = itemForPlanName(charge.planName);
    if (!item || item.kind !== "plan" || !charge.customerCode) return { ok: false, error: "unknown_reference" };
    const { data: client } = await supabaseAdmin.from("clients").select("id").eq("billing_customer_code", charge.customerCode).maybeSingle();
    if (!client?.id) return { ok: false, error: "unknown_customer" };
    await supabaseAdmin.from("payments").upsert({
      client_id: client.id, provider: provider.name, kind: "plan", item: item.id, credits: item.credits, plan_tier: item.tier, billing_cycle: item.cycle,
      amount_minor: provider.toMinor(item.usd), currency: provider.currency(), reference: charge.reference, customer_email: charge.customerEmail?.toLowerCase() ?? null,
    }, { onConflict: "provider,reference", ignoreDuplicates: true });
  } else if (row.kind === "plan" && row.status === "pending") {
    previousSubscription = row.replaces_subscription ?? null;
  }

  const { data, error } = await supabaseAdmin.rpc("fulfill_payment", {
    p_provider: provider.name, p_reference: charge.reference, p_amount_minor: charge.amountMinor, p_currency: charge.currency,
    p_payload: charge.raw as object, p_customer_code: charge.customerCode ?? null,
  });
  if (error) throw new Error(`fulfill_payment: ${error.message}`);
  const result = (data ?? { ok: false }) as Fulfilled;
  // Switching plans: the old subscription stops renewing once the new one is paid.
  if (result.ok && !result.already && previousSubscription) {
    const stopped = await provider.cancelSubscription(previousSubscription);
    if (!stopped) console.error("payments: couldn't stop the previous subscription", previousSubscription);
  }
  if (!result.ok) console.error("payments: not fulfilled", charge.reference, result.error);
  return result;
}

/** Everything the webhook can tell us. */
export async function handleProviderEvent(ev: ProviderEvent): Promise<void> {
  if (ev.type === "charge.success") { await settleCharge(ev.charge); return; }
  if (ev.type === "subscription.created" && ev.subscriptionCode) {
    let clientId: string | null = null;
    if (ev.customerCode) clientId = (await supabaseAdmin.from("clients").select("id").eq("billing_customer_code", ev.customerCode).maybeSingle()).data?.id ?? null;
    if (!clientId && ev.customerEmail) {
      const { data } = await supabaseAdmin.from("payments").select("client_id").eq("kind", "plan").eq("customer_email", ev.customerEmail.toLowerCase()).order("created_at", { ascending: false }).limit(1).maybeSingle();
      clientId = data?.client_id ?? null;
    }
    if (!clientId) { console.error("payments: subscription for an unknown customer", ev.subscriptionCode); return; }
    const next = ev.nextPaymentAt ? new Date(ev.nextPaymentAt) : null;
    await supabaseAdmin.from("clients").update({
      billing_subscription_code: ev.subscriptionCode,
      billing_status: "active",
      ...(ev.customerCode ? { billing_customer_code: ev.customerCode } : {}),
      // Two days' grace past the next charge (same as fulfill_payment).
      ...(next && !Number.isNaN(next.getTime()) ? { current_period_end: new Date(next.getTime() + 2 * 86400_000).toISOString() } : {}),
    }).eq("id", clientId);
    return;
  }
  if (ev.type === "subscription.stopped" && ev.subscriptionCode) {
    // The plan stays until its period ends; the nightly downgrader moves it to Free after that.
    await supabaseAdmin.from("clients").update({ billing_status: "cancelled" }).eq("billing_subscription_code", ev.subscriptionCode);
    return;
  }
  if (ev.type === "payment.failed" && ev.subscriptionCode) {
    await supabaseAdmin.from("clients").update({ billing_status: "paused" }).eq("billing_subscription_code", ev.subscriptionCode);
    return;
  }
  if (ev.type === "dispute") { await noteDispute(ev); return; }
}

/**
 * A card dispute (2026-10-23). Paystack gives 16 hours to answer in its dashboard, and disputes over
 * 1% of volume can switch card payments off, so the owner hears about it straight away (Telegram,
 * lib/alerts.ts) and the payment carries a note the admin dashboard lists. The note goes in
 * payments.failure: status may only be pending/paid/failed until a migration adds 'disputed'.
 */
async function noteDispute(ev: Extract<ProviderEvent, { type: "dispute" }>) {
  const amount = ev.amountMinor !== undefined ? `${ev.currency ?? ""} ${(ev.amountMinor / 100).toLocaleString("en-US")}`.trim() : "an amount";
  const due = ev.dueAt ? new Date(ev.dueAt) : null;
  const dueText = due && !Number.isNaN(due.getTime()) ? due.toISOString().slice(0, 16).replace("T", " ") + " UTC" : null;
  const note = `dispute: ${ev.stage}${ev.status ? ` (${ev.status})` : ""}${ev.resolution ? `, ${ev.resolution}` : ""}${ev.category ? `, ${ev.category}` : ""}${dueText ? `, answer by ${dueText}` : ""}`.slice(0, 300);
  if (ev.reference) await supabaseAdmin.from("payments").update({ failure: note }).eq("reference", ev.reference);
  const head = ev.stage === "resolved" ? "Card dispute closed" : ev.stage === "reminder" ? "Reminder: answer a card dispute" : "New card dispute: answer within 16 hours";
  await sendAlert(`${head}
${amount}${ev.customerEmail ? ` from ${ev.customerEmail}` : ""}${ev.reference ? `
Ref ${ev.reference}` : ""}${dueText ? `
Answer by ${dueText}` : ""}
https://dashboard.paystack.com/#/disputes
Admin: https://www.blinkspot.io/studio/admin`);
}
