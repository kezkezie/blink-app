import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/fetch-media/route";

/**
 * The media proxy only fetches our own storage hosts (2026-10-27: a bare endsWith let look-alike
 * names such as "evilres.cloudinary.com" through, and plain http too). Tested on the real route.
 */
const call = (url: string) => GET(new Request(`https://blinkspot.io/api/fetch-media?url=${encodeURIComponent(url)}`));

describe("fetch-media hosts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses look-alike hosts and plain http, without fetching anything", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const u of ["https://evilres.cloudinary.com/a.jpg", "https://res.cloudinary.com.evil.dev/a.jpg", "https://xhzkufspjozkgmloznkvp.supabase.co/a.mp4", "http://res.cloudinary.com/a.jpg", "https://example.com/a.jpg"]) {
      expect((await call(u)).status, u).toBe(403);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still passes our storage through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { headers: { "Content-Type": "video/mp4" } })));
    const r = await call("https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/a.mp4");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("video/mp4");
    expect((await call("https://res.cloudinary.com/demo/video/upload/a.mp4")).status).toBe(200);
  });
});
