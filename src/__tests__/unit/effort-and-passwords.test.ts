import { describe, expect, it, vi } from "vitest";
import { allowedEfforts, creditCapFor, effortFor, EFFORT_INFO, EFFORTS } from "@/lib/assistant/effort";
import { meteredCredits } from "@/lib/credits-price";
import { parseAssistantRequest } from "@/lib/assistant/request";
import { pwnedCount, sha1Hex } from "@/lib/pwned-password";

describe("Ask BlinkSpot's thinking dial", () => {
  it("includes one more level per plan; Agency includes Max", () => {
    expect(allowedEfforts("free")).toEqual(["low", "medium"]);
    expect(allowedEfforts("starter")).toEqual(["low", "medium", "high"]);
    expect(allowedEfforts("pro")).toEqual(["low", "medium", "high", "xhigh"]);
    expect(allowedEfforts("agency")).toEqual([...EFFORTS]);
  });
  it("lets anyone pick any level (above the plan it uses credits), default Balanced", () => {
    expect(effortFor("max")).toBe("max");
    expect(effortFor("high")).toBe("high");
    expect(effortFor(undefined)).toBe("medium");
    expect(effortFor("ultra")).toBe("medium");
  });
  it("caps what one message can cost; editing has a floor because it runs on Opus with pictures", () => {
    expect(EFFORTS.map((e) => creditCapFor(e, false))).toEqual([4, 8, 25, 50, 100]);
    expect(creditCapFor("low", true)).toBe(25);
    expect(creditCapFor("max", true)).toBe(100);
  });
  it("meters at 200 credits per provider dollar, between a minimum and the cap", () => {
    expect(meteredCredits(0.012, 8)).toBe(3); // 2.4 -> 3
    expect(meteredCredits(0.001, 8)).toBe(1);
    expect(meteredCredits(2, 25)).toBe(25);
    expect(meteredCredits(null, 8)).toBe(1);
    expect(meteredCredits(0.05, 25, 2)).toBe(10);
  });
  it("runs low/medium on Sonnet and deeper on Opus, weighted against the daily cap", () => {
    expect(EFFORTS.map((e) => EFFORT_INFO[e].model)).toEqual(["sonnet", "sonnet", "opus", "opus", "opus"]);
    expect(EFFORTS.map((e) => EFFORT_INFO[e].weight)).toEqual([1, 1, 2, 3, 4]);
  });
  it("parses only known levels from the browser", () => {
    const base = { messages: [{ role: "user", text: "hi" }] };
    expect(parseAssistantRequest({ ...base, effort: "xhigh" })?.effort).toBe("xhigh");
    expect(parseAssistantRequest({ ...base, effort: "ultra" })?.effort).toBeUndefined();
  });
});

describe("leaked-password check (k-anonymity)", () => {
  it("sends only the first 5 hash characters and finds the suffix", async () => {
    const hash = await sha1Hex("password123");
    const fetchImpl = vi.fn(async (url: string) => new Response(`0000000000000000000000000000000000A:3\n${hash.slice(5)}:2266543\n`, { status: 200 }));
    expect(await pwnedCount("password123", fetchImpl as unknown as typeof fetch)).toBe(2266543);
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(String(fetchImpl.mock.calls[0][0])).not.toContain(hash.slice(5));
  });
  it("returns 0 when not found and null (allow) when the service is down", async () => {
    expect(await pwnedCount("a-fresh-long-passphrase", (async () => new Response("ABC:1\n")) as unknown as typeof fetch)).toBe(0);
    expect(await pwnedCount("x", (async () => new Response("", { status: 503 })) as unknown as typeof fetch)).toBeNull();
    expect(await pwnedCount("x", (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBeNull();
  });
});
