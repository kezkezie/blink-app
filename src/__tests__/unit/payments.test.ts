import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Payments (2026-10-12): Paystack behind one provider interface. The database function
 * fulfill_payment (attack-tested in SQL) grants once; these test what reaches it.
 */
const db = vi.hoisted(() => ({
  payments: new Map<string, Record<string, unknown>>(),
  clients: new Map<string, Record<string, unknown>>(),
  rpc: vi.fn(),
  upserts: [] as Record<string, unknown>[],
  updates: [] as Array<{ table: string; patch: Record<string, unknown>; where: [string, unknown] }>,
}));
vi.mock("@/lib/supabase-server", () => {
  const rowsOf = (t: string) => (t === "payments" ? db.payments : db.clients);
  const query = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const match = () => [...rowsOf(table).values()].filter((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: match()[0] ?? null }),
      insert: async (row: Record<string, unknown>) => { rowsOf(table).set(String(row.reference ?? row.id), { status: "pending", ...row }); return { error: null }; },
      upsert: async (row: Record<string, unknown>) => { db.upserts.push(row); if (!db.payments.has(String(row.reference))) db.payments.set(String(row.reference), { status: "pending", ...row }); return { error: null }; },
      update: (patch: Record<string, unknown>) => ({ eq: async (k: string, v: unknown) => { db.updates.push({ table, patch, where: [k, v] }); for (const r of rowsOf(table).values()) if (r[k] === v) Object.assign(r, patch); return { error: null }; } }),
    };
    return q;
  };
  return { supabaseAdmin: { from: query, rpc: db.rpc } };
});

import { itemFor, itemForPlanName, settleCharge, handleProviderEvent } from "@/lib/payments/server";
import { validPaystackSignature, paystack } from "@/lib/payments/paystack";
import { POST as webhook } from "@/app/api/webhooks/paystack/route";

const KEY = "sk_test_abc123";
const sign = (body: string) => createHmac("sha512", KEY).update(body).digest("hex");
const fetchMock = vi.fn();

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = KEY;
  delete process.env.PAYSTACK_CURRENCY;
  db.payments.clear(); db.clients.clear(); db.upserts = []; db.updates = [];
  db.rpc.mockReset().mockResolvedValue({ data: { ok: true, credits: 800, kind: "credit_pack" }, error: null });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("what can be bought", () => {
  it("credit packs and plans, priced from the one plan list", () => {
    expect(itemFor("pack_300")).toMatchObject({ kind: "credit_pack", credits: 300, usd: 3 });
    expect(itemFor("pack_5000")).toMatchObject({ credits: 5000, usd: 40 });
    expect(itemFor("plan:starter:monthly")).toMatchObject({ kind: "plan", tier: "starter", credits: 1500, usd: 27, label: "BlinkSpot Starter (monthly)" });
    expect(itemFor("plan:agency:weekly")).toMatchObject({ credits: 1500, usd: 29 });
    expect(itemFor("plan:free:monthly")).toBeNull();
    expect(itemFor("pack_1")).toBeNull();
    expect(itemForPlanName("BlinkSpot Pro (weekly)")).toMatchObject({ tier: "pro", cycle: "weekly", credits: 750 });
    expect(itemForPlanName("Someone else's plan")).toBeNull();
  });
  it("prices in the account's currency (USD by default; KES needs a rate)", () => {
    expect(paystack.toMinor(8)).toBe(800);
    process.env.PAYSTACK_CURRENCY = "KES";
    process.env.PAYSTACK_FX_PER_USD = "129";
    expect(paystack.toMinor(8)).toBe(103200);
    delete process.env.PAYSTACK_FX_PER_USD;
    expect(() => paystack.toMinor(8)).toThrow(/FX/);
  });
});

describe("webhook signature", () => {
  it("accepts Paystack's HMAC-SHA512 and refuses anything else", () => {
    const body = '{"event":"charge.success"}';
    expect(validPaystackSignature(body, sign(body), KEY)).toBe(true);
    expect(validPaystackSignature(body + " ", sign(body), KEY)).toBe(false);
    expect(validPaystackSignature(body, null, KEY)).toBe(false);
    expect(validPaystackSignature(body, "deadbeef", KEY)).toBe(false);
  });
  it("the route refuses an unsigned event before touching the database", async () => {
    const res = await webhook(new NextRequest("http://localhost/api/webhooks/paystack", { method: "POST", body: JSON.stringify({ event: "charge.success", data: { reference: "bs_x", status: "success", amount: 800, currency: "USD" } }) }));
    expect(res.status).toBe(401);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("a signed charge.success reaches fulfill_payment with the reported amount", async () => {
    db.payments.set("bs_1", { id: "p1", client_id: "c1", status: "pending", kind: "credit_pack", provider: "paystack", reference: "bs_1" });
    const body = JSON.stringify({ event: "charge.success", data: { reference: "bs_1", status: "success", amount: 800, currency: "usd", customer: { customer_code: "CUS_1" } } });
    const res = await webhook(new NextRequest("http://localhost/api/webhooks/paystack", { method: "POST", body, headers: { "x-paystack-signature": sign(body) } }));
    expect(res.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith("fulfill_payment", expect.objectContaining({ p_provider: "paystack", p_reference: "bs_1", p_amount_minor: 800, p_currency: "USD", p_customer_code: "CUS_1" }));
  });
});

describe("settling charges", () => {
  const charge = (over: Record<string, unknown> = {}) => ({ status: "success" as const, reference: "bs_1", amountMinor: 800, currency: "USD", raw: {}, ...over });

  it("a declined charge marks the row failed and grants nothing", async () => {
    db.payments.set("bs_1", { id: "p1", client_id: "c1", status: "pending", kind: "credit_pack", provider: "paystack", reference: "bs_1" });
    expect((await settleCharge(charge({ status: "failed" }))).ok).toBe(false);
    expect(db.payments.get("bs_1")!.status).toBe("failed");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("a renewal (a reference Paystack made) is matched by customer code and gets its own row", async () => {
    db.clients.set("c1", { id: "c1", billing_customer_code: "CUS_9" });
    await settleCharge(charge({ reference: "T_renew_1", amountMinor: 2700, customerCode: "CUS_9", planName: "BlinkSpot Starter (monthly)" }));
    expect(db.upserts[0]).toMatchObject({ client_id: "c1", kind: "plan", plan_tier: "starter", billing_cycle: "monthly", credits: 1500, amount_minor: 2700, reference: "T_renew_1" });
    expect(db.rpc).toHaveBeenCalledWith("fulfill_payment", expect.objectContaining({ p_reference: "T_renew_1" }));
  });

  it("an unknown reference without a known plan and customer is never granted", async () => {
    expect(await settleCharge(charge({ reference: "T_x", planName: "BlinkSpot Starter (monthly)", customerCode: "CUS_nobody" }))).toMatchObject({ ok: false, error: "unknown_customer" });
    expect(await settleCharge(charge({ reference: "T_y" }))).toMatchObject({ ok: false, error: "unknown_reference" });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("switching plans stops the old subscription once the new one is paid, not before", async () => {
    db.payments.set("bs_2", { id: "p2", client_id: "c1", status: "pending", kind: "plan", provider: "paystack", reference: "bs_2", replaces_subscription: "SUB_old" });
    db.rpc.mockResolvedValue({ data: { ok: true, kind: "plan", credits: 3000 }, error: null });
    fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify({ status: true, data: url.endsWith("/subscription/SUB_old") ? { email_token: "tok" } : {} })));
    await settleCharge(charge({ reference: "bs_2", amountMinor: 4900 }));
    const calls = fetchMock.mock.calls.map(([u, init]) => `${(init as RequestInit | undefined)?.method ?? "GET"} ${u}`);
    expect(calls).toEqual(["GET https://api.paystack.co/subscription/SUB_old", "POST https://api.paystack.co/subscription/disable"]);
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({ code: "SUB_old", token: "tok" });
  });

  it("an already-granted payment doesn't stop anything again", async () => {
    db.payments.set("bs_3", { id: "p3", client_id: "c1", status: "pending", kind: "plan", provider: "paystack", reference: "bs_3", replaces_subscription: "SUB_old" });
    db.rpc.mockResolvedValue({ data: { ok: true, already: true, kind: "plan" }, error: null });
    await settleCharge(charge({ reference: "bs_3" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("subscription events", () => {
  it("a new subscription is saved on the account with two days' grace past the next charge", async () => {
    db.clients.set("c1", { id: "c1", billing_customer_code: "CUS_1" });
    await handleProviderEvent({ type: "subscription.created", subscriptionCode: "SUB_1", customerCode: "CUS_1", nextPaymentAt: "2026-11-12T08:00:00.000Z" });
    expect(db.clients.get("c1")).toMatchObject({ billing_subscription_code: "SUB_1", billing_status: "active", current_period_end: "2026-11-14T08:00:00.000Z" });
  });
  it("a stopped subscription keeps the plan until the period ends (the nightly downgrader does the rest)", async () => {
    db.clients.set("c1", { id: "c1", plan_tier: "pro", billing_subscription_code: "SUB_1" });
    await handleProviderEvent({ type: "subscription.stopped", subscriptionCode: "SUB_1" });
    expect(db.clients.get("c1")).toMatchObject({ plan_tier: "pro", billing_status: "cancelled" });
  });
});
