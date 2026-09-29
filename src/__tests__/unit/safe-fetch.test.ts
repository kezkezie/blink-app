import { describe, expect, it, vi } from "vitest";
import { isPublicAddress, validatePublicUrl, safeFetchText } from "@/lib/safe-fetch";

const resolverFor = (map: Record<string, string[]>) => async (host: string) => {
  if (!(host in map)) throw new Error("ENOTFOUND");
  return map[host].map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
};

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "0.0.0.0", "100.64.0.1", "::1", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::",
  ])("rejects internal address %s", (a) => {
    expect(isPublicAddress(a)).toBe(false);
  });

  it.each(["8.8.8.8", "104.18.2.3", "172.32.0.1", "2606:4700::1111"])("accepts public address %s", (a) => {
    expect(isPublicAddress(a)).toBe(true);
  });
});

describe("validatePublicUrl", () => {
  const resolve = resolverFor({ "example.com": ["93.184.216.34"], "evil.internal": ["10.1.2.3"], "mixed.example": ["93.184.216.34", "127.0.0.1"] });

  it("accepts a public https and http URL", async () => {
    expect((await validatePublicUrl("https://example.com/about", resolve)).ok).toBe(true);
    expect((await validatePublicUrl("http://example.com", resolve)).ok).toBe(true);
  });

  it.each([
    ["cloud metadata IP", "http://169.254.169.254/latest/meta-data/"],
    ["localhost", "http://127.0.0.1:3000/"],
    ["a hostname resolving to a private IP", "https://evil.internal/"],
    ["a hostname with ANY private address (rebinding-style)", "https://mixed.example/"],
    ["a non-http scheme", "file:///etc/passwd"],
    ["a data URL", "data:text/html,hi"],
    ["credentials in the URL", "https://user:pass@example.com/"],
    ["a non-standard port", "https://example.com:8443/"],
    ["garbage", "not a url"],
    ["an unresolvable host", "https://nope.invalid/"],
  ])("rejects %s", async (_l, url) => {
    expect((await validatePublicUrl(url, resolve)).ok).toBe(false);
  });
});

describe("safeFetchText", () => {
  const resolve = resolverFor({ "example.com": ["93.184.216.34"], "internal.example": ["10.0.0.9"] });

  it("fetches a public page", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<title>Hi</title>", { status: 200 }));
    const r = await safeFetchText("https://example.com/", { resolve, fetchImpl });
    expect(r).toEqual({ ok: true, text: "<title>Hi</title>" });
    expect(fetchImpl.mock.calls[0][1].redirect).toBe("manual");
  });

  it("never fetches a private URL at all", async () => {
    const fetchImpl = vi.fn();
    expect((await safeFetchText("http://169.254.169.254/", { resolve, fetchImpl })).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("re-validates every redirect hop and refuses a redirect into the internal network", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://internal.example/admin" } }));
    const r = await safeFetchText("https://example.com/", { resolve, fetchImpl });
    expect(r.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows a public redirect", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/home" } }))
      .mockResolvedValueOnce(new Response("home", { status: 200 }));
    expect(await safeFetchText("https://example.com/", { resolve, fetchImpl })).toEqual({ ok: true, text: "home" });
  });

  it("stops after too many redirects", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(null, { status: 302, headers: { location: "https://example.com/loop" } }));
    expect((await safeFetchText("https://example.com/", { resolve, fetchImpl, maxRedirects: 3 })).ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("caps the body instead of reading an unbounded page into memory", async () => {
    const big = "x".repeat(50_000);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(big, { status: 200 }));
    const r = await safeFetchText("https://example.com/", { resolve, fetchImpl, maxBytes: 1000 });
    expect(r.ok).toBe(true);
    expect(r.ok && r.text.length).toBe(1000);
  });
});
