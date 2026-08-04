import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from } }));

import {
  BRAND_CONTEXT_VERSION,
  buildBrandCreativeContext,
  loadOwnedBrandCreativeContext,
  toAssistedBrandContext,
  toDirectorBrief,
  toVideoWorkflowFields,
} from "@/lib/brand-creative-context";
import { buildAssistedBrandContext } from "@/lib/assisted-creation-server";

const CLIENT = { id: "client-1", company_name: "Fallback Co", industry: "Fallback Industry", website_url: "https://fallback.example" };
const BRAND = {
  brand_name: "Lup Space",
  company_name: "Lup Ltd",
  industry: "Home goods",
  description: "Considered blankets for slower evenings.",
  website_url: "https://lup.example",
  brand_voice: "Warm, clear, never pushy",
  tone_keywords: ["calm", "considered", 42],
  image_style: "Tactile editorial photography",
  visual_style_guide: "Warm natural light with generous negative space",
  composition_notes: "One clear focal subject",
  primary_color: "#112233",
  secondary_color: "#DDEEFF",
  accent_color: "#AA8844",
  primary_font: "Inter",
  secondary_font: "Cormorant",
  vocabulary_notes: "Prefer comfort over luxury",
  dos: "Show real lived-in rooms",
  donts: "Avoid hard-sell language",
  logo_url: "https://cdn.example/logo.png",
};

function chain(result: unknown) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  c.select = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  return c;
}

beforeEach(() => vi.clearAllMocks());

describe("buildBrandCreativeContext", () => {
  it("assembles a versioned, bounded context", () => {
    const ctx = buildBrandCreativeContext(CLIENT, BRAND, "brand-1");
    expect(ctx.schemaVersion).toBe(BRAND_CONTEXT_VERSION);
    expect(ctx.clientId).toBe("client-1");
    expect(ctx.brandId).toBe("brand-1");
    expect(ctx.name).toBe("Lup Space");
    expect(ctx.logoUrl).toBe("https://cdn.example/logo.png");
    // Non-string list entries are dropped, not coerced.
    expect(ctx.toneKeywords).toEqual(["calm", "considered"]);
  });

  it("falls back through brand → client for identity fields", () => {
    const ctx = buildBrandCreativeContext(CLIENT, { description: "x" }, "b");
    expect(ctx.name).toBe("Fallback Co");
    expect(ctx.industry).toBe("Fallback Industry");
    expect(ctx.websiteUrl).toBe("https://fallback.example");
  });

  it("bounds oversize brand text rather than forwarding it", () => {
    const ctx = buildBrandCreativeContext(CLIENT, { ...BRAND, description: "x".repeat(5_000) }, "b");
    expect(ctx.description.length).toBe(600);
  });
});

describe("assisted projection is byte-identical (Image Studio must not change)", () => {
  it("matches the shape and values the assisted builder produced before V6", () => {
    const viaShared = toAssistedBrandContext(buildBrandCreativeContext(CLIENT, BRAND, ""));
    const viaAssisted = buildAssistedBrandContext(CLIENT, BRAND);
    expect(viaAssisted).toEqual(viaShared);
    // Field ORDER matters: the context is JSON.stringify'd into the prompt.
    expect(JSON.stringify(viaAssisted)).toBe(JSON.stringify(viaShared));
  });

  it("does not leak new fields into the assisted prompt shape", () => {
    const keys = Object.keys(buildAssistedBrandContext(CLIENT, BRAND));
    expect(keys).not.toContain("schemaVersion");
    expect(keys).not.toContain("logoUrl");
    expect(keys).not.toContain("brandId");
    expect(keys).not.toContain("clientId");
  });
});

describe("toDirectorBrief", () => {
  it("includes only non-empty facts", () => {
    const brief = toDirectorBrief(buildBrandCreativeContext(CLIENT, BRAND, "b"));
    expect(brief).toContain("Brand: Lup Space");
    expect(brief).toContain("Voice: Warm, clear, never pushy");
    expect(brief).toContain("Tone: calm, considered");
  });

  it("stays short for an unfilled brand instead of emitting empty labels", () => {
    const brief = toDirectorBrief(buildBrandCreativeContext({ id: "c" }, {}, "b"));
    expect(brief).toBe("");
  });
});

describe("toVideoWorkflowFields", () => {
  it("produces canonical brand fields carrying the context version", () => {
    const fields = toVideoWorkflowFields(buildBrandCreativeContext(CLIENT, BRAND, "b"));
    expect(fields.brand_name).toBe("Lup Space");
    expect(fields.brand_context_version).toBe(BRAND_CONTEXT_VERSION);
    expect(String(fields.brand_info)).toContain("Home goods");
    expect(fields.logo_url).toBe("https://cdn.example/logo.png");
  });

  it("omits the logo when the brand has none", () => {
    const fields = toVideoWorkflowFields(buildBrandCreativeContext(CLIENT, { ...BRAND, logo_url: "" }, "b"));
    expect("logo_url" in fields).toBe(false);
  });
});

describe("loadOwnedBrandCreativeContext", () => {
  it("loads the context for an owned brand", async () => {
    from.mockReturnValueOnce(chain({ data: CLIENT, error: null }))
        .mockReturnValueOnce(chain({ data: BRAND, error: null }));
    const result = await loadOwnedBrandCreativeContext("user-1", "brand-1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.context.name).toBe("Lup Space");
  });

  it("returns an identical 404 for a missing client and a cross-tenant brand", async () => {
    from.mockReturnValueOnce(chain({ data: null, error: null }));
    expect(await loadOwnedBrandCreativeContext("user-1", "brand-1"))
      .toEqual({ ok: false, status: 404, error: "Brand not found" });

    from.mockReturnValueOnce(chain({ data: CLIENT, error: null }))
        .mockReturnValueOnce(chain({ data: null, error: null }));
    expect(await loadOwnedBrandCreativeContext("user-1", "someone-elses-brand"))
      .toEqual({ ok: false, status: 404, error: "Brand not found" });
  });

  it("scopes the brand read to the resolved client", async () => {
    const clientChain = chain({ data: CLIENT, error: null });
    const brandChain = chain({ data: BRAND, error: null });
    from.mockReturnValueOnce(clientChain).mockReturnValueOnce(brandChain);
    await loadOwnedBrandCreativeContext("user-1", "brand-1");
    expect(brandChain.eq).toHaveBeenCalledWith("client_id", "client-1");
  });

  it("returns a safe 500 on a database error", async () => {
    from.mockReturnValueOnce(chain({ data: null, error: { message: "boom" } }));
    expect(await loadOwnedBrandCreativeContext("user-1", "brand-1"))
      .toEqual({ ok: false, status: 500, error: "Unable to resolve brand context" });
  });
});
