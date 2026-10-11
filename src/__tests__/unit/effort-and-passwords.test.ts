import { describe, expect, it, vi } from "vitest";
import { allowedEfforts, effortFor, EFFORT_INFO, EFFORTS } from "@/lib/assistant/effort";
import { parseAssistantRequest } from "@/lib/assistant/request";
import { pwnedCount, sha1Hex } from "@/lib/pwned-password";

describe("Ask BlinkSpot's thinking dial", () => {
  it("opens one more level per plan; Agency gets Max", () => {
    expect(allowedEfforts("free")).toEqual(["low", "medium"]);
    expect(allowedEfforts("starter")).toEqual(["low", "medium", "high"]);
    expect(allowedEfforts("pro")).toEqual(["low", "medium", "high", "xhigh"]);
    expect(allowedEfforts("agency")).toEqual([...EFFORTS]);
  });
  it("clamps a request to the plan and defaults to Balanced", () => {
    expect(effortFor("max", "free")).toBe("medium");
    expect(effortFor("max", "starter")).toBe("high");
    expect(effortFor("max", "agency")).toBe("max");
    expect(effortFor(undefined, "agency")).toBe("medium");
    expect(effortFor("ultra", "pro")).toBe("medium");
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
