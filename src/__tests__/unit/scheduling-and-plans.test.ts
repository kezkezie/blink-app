import { afterEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from } }));

import { accountsForPost, cancelPendingPost, isCancellable } from "@/lib/social-schedule";
import { isPaidPlan, planOf, PLANS, SIGNUP_CREDITS, TOP_UP } from "@/lib/plans";
import { localLabel, localToUtc, runAssistantTool } from "@/lib/assistant/tools";
import { parseAssistantRequest } from "@/lib/assistant/request";

/** A chainable Supabase query stub that resolves to `result`. */
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "not", "or", "gte", "lt", "order", "limit"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return q;
}

afterEach(() => { vi.restoreAllMocks(); from.mockReset(); });

describe("posting goes only to the post's own brand", () => {
  const accounts = [
    { postforme_account_id: "pfm-a-ig", platform: "instagram", brand_id: "A" },
    { postforme_account_id: "pfm-b-ig", platform: "instagram", brand_id: "B" },
    { postforme_account_id: "pfm-shared-tt", platform: "tiktok", brand_id: "A" },
    { postforme_account_id: "pfm-shared-tt", platform: "TikTok", brand_id: "B" },
    { postforme_account_id: null, platform: "youtube", brand_id: "A" },
  ];
  it("brand A's Instagram post does not go to brand B's Instagram", () => {
    expect(accountsForPost(accounts, ["instagram"], "A")).toEqual(["pfm-a-ig"]);
  });
  it("one account serving two brands is sent once; missing ids are dropped", () => {
    expect(accountsForPost(accounts, ["tiktok", "youtube"], "B")).toEqual(["pfm-shared-tt"]);
    expect(accountsForPost(accounts, ["tiktok"], null)).toEqual(["pfm-shared-tt"]);
  });
});

describe("moving or removing a queued post cancels the earlier one", () => {
  it("only posts that haven't started publishing are cancellable", () => {
    expect(isCancellable("scheduled")).toBe(true);
    expect(isCancellable("draft")).toBe(true);
    expect(isCancellable("processing")).toBe(false);
    expect(isCancellable("processed")).toBe(false);
  });
  it("cancels a scheduled post, refuses one that is publishing, treats a missing one as gone", async () => {
    const calls: string[] = [];
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url.split("/v1")[1]}`);
      if (url.endsWith("/p1")) return init?.method === "DELETE" ? respond(200, { success: true }) : respond(200, { status: "scheduled" });
      if (url.endsWith("/p2")) return respond(200, { status: "processing" });
      return respond(404, {});
    }));
    expect(await cancelPendingPost("k", "p1")).toEqual({ outcome: "cancelled", status: "scheduled" });
    expect(await cancelPendingPost("k", "p2")).toEqual({ outcome: "published", status: "processing" });
    expect(await cancelPendingPost("k", "p3")).toEqual({ outcome: "gone" });
    expect(await cancelPendingPost("k", null)).toEqual({ outcome: "none" });
    expect(calls).toEqual(["GET /social-posts/p1", "DELETE /social-posts/p1", "GET /social-posts/p2", "GET /social-posts/p3"]);
    vi.unstubAllGlobals();
  });
});

describe("plans (Kezie, 2026-10-11)", () => {
  it("free is free; hand-made custom/enterprise accounts count as paid", () => {
    expect(planOf(undefined)).toBe("free");
    expect(planOf("made-up")).toBe("free");
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("starter")).toBe(true);
    expect(isPaidPlan("custom")).toBe(true);
  });
  it("free gets credits once, not every month; the top-up keeps a margin over the $0.005 credit cost", () => {
    const free = PLANS.find((p) => p.id === "free")!;
    expect(free.credits.monthly).toBe(`${SIGNUP_CREDITS} credits to start`);
    // Credits are never monthly on Free (Ask's included messages are, since 2026-10-20).
    expect(free.features.filter((f) => /credit/i.test(f)).join(" ")).not.toMatch(/a month|monthly/);
    expect(free.features.join(" ")).toMatch(/Ask BlinkSpot, 30 messages a month/);
    expect(TOP_UP.usd / (TOP_UP.credits * 0.005)).toBeGreaterThanOrEqual(1.5);
  });
});

describe("Ask BlinkSpot plans posts in the user's own time", () => {
  it("converts local wall-clock times with the browser offset (Nairobi is UTC+3 → offset -180)", () => {
    expect(localToUtc("2026-10-14T18:30", -180)?.toISOString()).toBe("2026-10-14T15:30:00.000Z");
    expect(localLabel("2026-10-14T15:30:00.000Z", -180)).toBe("Wed 14 Oct, 18:30");
    expect(localLabel("2026-10-14T15:30:00.000Z", -180, true)).toBe("2026-10-14 18:30");
  });
  it("rejects malformed and impossible dates", () => {
    expect(localToUtc("tomorrow at 6", 0)).toBeNull();
    expect(localToUtc("2026-11-31T10:00", 0)).toBeNull();
    expect(localToUtc("2026-10-14T25:00", 0)).toBeNull();
  });
  it("accepts a sane time zone from the browser and drops junk", () => {
    const base = { messages: [{ role: "user", text: "plan my week" }] };
    expect(parseAssistantRequest({ ...base, tz: "Africa/Nairobi", tzOffset: -180 })).toMatchObject({ tz: "Africa/Nairobi", tzOffset: -180 });
    const bad = parseAssistantRequest({ ...base, tz: "<script>", tzOffset: 99999 });
    expect(bad?.tz).toBeUndefined();
    expect(bad?.tzOffset).toBeUndefined();
  });
  it("propose_schedule keeps only this brand's posts and future times, and changes nothing itself", async () => {
    const id1 = "11111111-1111-4111-8111-111111111111", id2 = "22222222-2222-4222-8222-222222222222", foreign = "33333333-3333-4333-8333-333333333333";
    from.mockReturnValue(query({ data: [
      { id: id1, caption: "Fresh mango juice", caption_short: null, status: "approved", scheduled_at: null, target_platforms: { instagram: { enabled: true } } },
      { id: id2, caption: "Weekend offer", caption_short: null, status: "draft", scheduled_at: null, target_platforms: null },
    ] }));
    const soon = new Date(Date.now() + 2 * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${soon.getUTCFullYear()}-${pad(soon.getUTCMonth() + 1)}-${pad(soon.getUTCDate())}T18:30`;
    const out = await runAssistantTool("propose_schedule", {
      summary: "Two evening posts",
      posts: [{ id: id1, at: local }, { id: id2, at: "2020-01-01T10:00" }, { id: foreign, at: local }],
    }, { clientId: "c1", brandId: "b1", tzOffset: 0 });
    expect(out.action?.kind).toBe("apply_schedule");
    expect(out.action?.schedule).toHaveLength(1);
    expect(out.action?.schedule?.[0]).toMatchObject({ id: id1, at: `${local}:00.000Z` });
    expect(out.content).toMatch(/Skipped/);
    expect(out.content).toMatch(/nothing changes until the user presses it/);
    // Only reads: the tool never updates content.
    expect(from).toHaveBeenCalledTimes(1);
  });
});
