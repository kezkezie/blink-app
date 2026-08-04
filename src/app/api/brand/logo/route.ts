import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase-server";
import { loadOwnedAssistedBrandContext } from "@/lib/assisted-creation-server";
import { buildLogoPrompt } from "@/lib/logo-generation";
import { LOGO_ENGINE } from "@/lib/image-engine-pricing";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function n8nWebhookBase(): string {
  const raw = process.env.N8N_WEBHOOK_BASE || process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE || "https://n8n.srv1166077.hstgr.cloud/webhook";
  try { if (new URL(raw).protocol !== "https:") return "https://n8n.srv1166077.hstgr.cloud/webhook"; } catch { return "https://n8n.srv1166077.hstgr.cloud/webhook"; }
  return raw.replace(/\/$/, "");
}

/** Pull any image URLs out of a (loose) sync workflow response. */
function extractUrls(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const candidates = [d.imageUrls, d.resultUrls, d.image_urls, d.urls];
  for (const c of candidates) {
    if (Array.isArray(c)) { const urls = c.filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u)); if (urls.length) return urls; }
  }
  return [];
}

/**
 * POST /api/brand/logo — generate a logo from the brand's context (Ideogram v3
 * Turbo). Auth → brand ownership (+context) → deduct LOGO_ENGINE credits upfront →
 * generate via the n8n logo workflow → refund on any failure. Returns candidate
 * logo URLs (accepting/saving to brand_profiles.logo_url is a separate step).
 *
 * GATED DEPENDENCY: the n8n `blink-generate-logo` workflow (Ideogram) does not
 * exist yet — building/activating it is a live workflow change. Until then this
 * route returns 502 and refunds (it never leaves the user charged).
 */
export async function POST(req: NextRequest) {
  let refund: null | (() => Promise<void>) = null;
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
    const brandId = (body as { brandId?: unknown })?.brandId;
    if (typeof brandId !== "string" || !UUID.test(brandId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    // Auth-scoped brand ownership + the exact brand context, in one call.
    const owned = await loadOwnedAssistedBrandContext(user.id, brandId);
    if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status });
    const ctx = owned.context;

    const logo = buildLogoPrompt({
      name: ctx.name,
      industry: ctx.industry,
      description: ctx.description,
      primaryColor: ctx.primaryColor,
      secondaryColor: ctx.secondaryColor,
    });
    if (!logo) return NextResponse.json({ error: "Add a brand name before generating a logo." }, { status: 400 });

    // Deduct upfront; refund on any downstream failure.
    const cost = LOGO_ENGINE.creditCost;
    const { data: deductData, error: deductError } = await supabaseAdmin.rpc("deduct_credits", {
      p_client_id: owned.clientId, p_amount: cost, p_operation: "logo_generation", p_description: "Logo generation (Ideogram v3 Turbo)",
    });
    if (deductError || deductData === false) return NextResponse.json({ error: "Insufficient credits. Please top up." }, { status: 402 });
    refund = async () => {
      try { await supabaseAdmin.rpc("refund_credits", { p_client_id: owned.clientId, p_amount: cost, p_operation: "refund", p_description: "Refund: logo generation failed" }); } catch { /* best-effort */ }
    };

    // Generate via the n8n logo workflow (Ideogram). GATED: workflow not built yet.
    let urls: string[] = [];
    try {
      const res = await fetch(`${n8nWebhookBase()}/blink-generate-logo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.N8N_WEBHOOK_SECRET ? { "x-blink-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
        },
        body: JSON.stringify({
          client_id: owned.clientId, brand_id: brandId,
          model: LOGO_ENGINE.model, provider: LOGO_ENGINE.provider,
          prompt: logo.prompt, aspect_ratio: logo.aspectRatio, magic_prompt_option: "Auto",
          is_sync: true,
        }),
      });
      if (res.ok) urls = extractUrls(await res.json().catch(() => null));
    } catch { /* handled below */ }

    if (urls.length === 0) {
      await refund();
      return NextResponse.json({ error: "Logo generation is temporarily unavailable." }, { status: 502 });
    }

    return NextResponse.json({ logoUrls: urls, cost });
  } catch {
    if (refund) await refund();
    return NextResponse.json({ error: "Unable to generate a logo" }, { status: 500 });
  }
}

/**
 * PATCH /api/brand/logo — accept a generated logo: save it to the owned brand's
 * `brand_profiles.logo_url`. Auth + ownership verified; no billing (the generation
 * was already charged). Body: { brandId, logoUrl }.
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
    const brandId = (body as { brandId?: unknown })?.brandId;
    const logoUrl = (body as { logoUrl?: unknown })?.logoUrl;
    if (typeof brandId !== "string" || !UUID.test(brandId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    if (typeof logoUrl !== "string" || logoUrl.length > 2048 || !/^https:\/\//.test(logoUrl)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    // Ownership check (also yields the canonical client id).
    const owned = await loadOwnedAssistedBrandContext(user.id, brandId);
    if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status });

    const { error } = await supabaseAdmin
      .from("brand_profiles")
      .update({ logo_url: logoUrl })
      .eq("id", brandId)
      .eq("client_id", owned.clientId);
    if (error) return NextResponse.json({ error: "Could not save the logo" }, { status: 500 });

    return NextResponse.json({ ok: true, logoUrl });
  } catch {
    return NextResponse.json({ error: "Could not save the logo" }, { status: 500 });
  }
}
