import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** Kezie, 2026-10-13: top-ups from Starter ($25) up; shared seats by plan, Free shares with 3. */
const { clientRow, startCheckout } = vi.hoisted(() => ({ clientRow: { current: null as Record<string, unknown> | null }, startCheckout: vi.fn() }));
vi.mock("@/lib/execution-security", () => ({ authenticateExecutionRequest: async () => ({ ok: true, value: "user-1" }) }));
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: clientRow.current, error: null }) }) }) }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "kezie@example.com" } } }) } },
  },
}));
vi.mock("@/lib/payments/server", async (orig) => ({ ...(await orig<typeof import("@/lib/payments/server")>()), startCheckout }));

import { POST } from "@/app/api/billing/checkout/route";
import { PLANS, SHARE_SEATS, canTopUp, shareSeatsFor } from "@/lib/plans";

const buy = (item: string) => POST(new NextRequest("http://x/api/billing/checkout", { method: "POST", body: JSON.stringify({ item }) }));

beforeEach(() => {
  startCheckout.mockReset();
  startCheckout.mockResolvedValue({ url: "https://checkout.paystack.com/x", reference: "ref" });
});

describe("top-ups", () => {
  it("only paid plans can buy credit packs", () => {
    expect(canTopUp("free")).toBe(false);
    expect(canTopUp(null)).toBe(false);
    for (const p of ["starter", "pro", "agency", "custom"]) expect(canTopUp(p)).toBe(true);
  });

  it("checkout refuses a pack on Free and never opens a payment", async () => {
    clientRow.current = { id: "c1", plan_tier: "free", billing_cycle: null, billing_status: null };
    const res = await buy("pack_300");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("needs_plan");
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("Free can still upgrade, and Starter can top up", async () => {
    clientRow.current = { id: "c1", plan_tier: "free", billing_cycle: null, billing_status: null };
    expect((await buy("plan:starter:monthly")).status).toBe(200);
    clientRow.current = { id: "c1", plan_tier: "starter", billing_cycle: "monthly", billing_status: "active" };
    expect((await buy("pack_800")).status).toBe(200);
    expect(startCheckout).toHaveBeenCalledTimes(2);
  });

  it("the Free card no longer promises top-ups; Starter's does", () => {
    const free = PLANS.find((p) => p.id === "free")!;
    expect(free.features.join(" ")).not.toMatch(/top up/i);
    expect(PLANS.find((p) => p.id === "starter")!.features.join(" ")).toMatch(/Top up credits any time/);
  });
});

describe("shared seats", () => {
  it("come with the owner's plan, Free 3", () => {
    expect(shareSeatsFor("free")).toBe(3);
    expect(shareSeatsFor(undefined)).toBe(3);
    expect(shareSeatsFor("starter")).toBe(SHARE_SEATS.starter);
    expect(SHARE_SEATS.free < SHARE_SEATS.starter && SHARE_SEATS.starter < SHARE_SEATS.pro && SHARE_SEATS.pro < SHARE_SEATS.agency).toBe(true);
  });

  it("each plan card says how many people", () => {
    for (const p of PLANS) expect(p.features.join(" ")).toContain(`with ${SHARE_SEATS[p.id]} people`);
  });
});
