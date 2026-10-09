import { describe, expect, it } from "vitest";
import { bestPinImage, isPinterestShortLink, pinterestPinId, remixPrompt } from "@/lib/inspo";
import { safeFetchBytes } from "@/lib/safe-fetch";

const publicDns = async () => [{ address: "151.101.0.84", family: 4 }];
const privateDns = async () => [{ address: "10.0.0.5", family: 4 }];

describe("Inspo Remix links", () => {
  it("reads pin ids from any Pinterest pin URL", () => {
    expect(pinterestPinId("https://www.pinterest.com/pin/116249234128127549/")).toBe("116249234128127549");
    expect(pinterestPinId("https://za.pinterest.com/pin/cool-poster-ideas--946460296530523283/")).toBe("946460296530523283");
    expect(pinterestPinId("https://pinterest.co.uk/pin/123456789/")).toBe("123456789");
    expect(pinterestPinId("https://evilpinterest.com/pin/123456789/")).toBeNull();
    expect(pinterestPinId("https://www.pinterest.com/kezie/boards/")).toBeNull();
    expect(isPinterestShortLink("https://pin.it/1aBcDeF")).toBe(true);
    expect(isPinterestShortLink("https://pin.it.evil.com/x")).toBe(false);
  });

  it("takes the largest rendition and asks for the original", () => {
    const payload = { data: [{ images: {
      "236x": { url: "https://i.pinimg.com/236x/87/53/13/a.jpg", width: 236 },
      "564x": { url: "https://i.pinimg.com/564x/87/53/13/a.jpg", width: 564 },
    } }] };
    expect(bestPinImage(payload)).toBe("https://i.pinimg.com/originals/87/53/13/a.jpg");
    expect(bestPinImage({ data: [] })).toBeNull();
  });

  it("keeps the look but never the other brand", () => {
    const p = remixPrompt("Mama Njeri Kitchen", "Weekend offer: 20% off pilau");
    expect(p).toMatch(/same layout and composition/);
    expect(p).toMatch(/never copy the original brand, its logo or its words/);
    expect(p).toMatch(/Mama Njeri Kitchen/);
    expect(p).toMatch(/It is for: Weekend offer/);
    expect(remixPrompt("X", "  ")).not.toMatch(/It is for/);
  });
});

describe("safeFetchBytes", () => {
  it("refuses private addresses (no SSRF through a pasted link)", async () => {
    const r = await safeFetchBytes("http://internal.example/secret.png", { resolve: privateDns, fetchImpl: async () => new Response("x") });
    expect(r).toEqual({ ok: false, reason: "address not public" });
  });

  it("re-checks every redirect hop", async () => {
    const fetchImpl = async (url: string | URL | Request) => String(url).includes("start")
      ? new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } })
      : new Response("never");
    const resolve = async (host: string) => (host === "169.254.169.254" ? [{ address: "169.254.169.254", family: 4 }] : publicDns());
    const r = await safeFetchBytes("https://cdn.example/start.png", { resolve, fetchImpl: fetchImpl as typeof fetch });
    expect(r.ok).toBe(false);
  });

  it("returns the bytes and type, and refuses bodies over the cap instead of truncating", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const ok = await safeFetchBytes("https://cdn.example/a.png", { resolve: publicDns, fetchImpl: (async () => new Response(png, { headers: { "content-type": "image/png; charset=binary" } })) as typeof fetch });
    expect(ok).toMatchObject({ ok: true, contentType: "image/png" });
    if (ok.ok) expect(Array.from(ok.bytes)).toEqual(Array.from(png));
    const big = await safeFetchBytes("https://cdn.example/a.png", { resolve: publicDns, maxBytes: 4, fetchImpl: (async () => new Response(png)) as typeof fetch });
    expect(big).toEqual({ ok: false, reason: "too large" });
  });
});
