import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { brandAccess, ownClientId } from "@/lib/brand-access";
import { maskEmail, normaliseEmail } from "@/lib/brand-sharing";
import { getLimitForTier } from "@/lib/limits";

/**
 * Hand a brand to another account (Kezie, 2026-10-16; migration 20261016_brand_transfer).
 *   GET  ?token=…      what the link offers (brand, from, status), for /transfer/<token>
 *   GET  ?brandId=…    the owner's open offer for that brand, if any
 *   POST { action: offer, brandId, email, keepAccess, confirmName } | { action: cancel, brandId }
 *   POST { action: accept | decline, token }
 * Accepting needs the link AND being signed in with the email it was offered to (sign-up doesn't
 * confirm emails, so the email alone proves nothing), and a free brand slot on the new owner's plan.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

type Offer = { id: string; brand_id: string; from_client: string; to_email: string; token: string; keep_access: boolean; created_by: string; created_at: string; expires_at: string; accepted_at: string | null; cancelled_at: string | null };
const offerStatus = (o: Offer) => (o.cancelled_at ? "cancelled" : o.accepted_at ? "done" : new Date(o.expires_at).getTime() < Date.now() ? "expired" : "open");

function appOrigin(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return configured && /^https?:\/\//.test(configured) ? configured : new URL(request.url).origin;
}
async function emailOf(userId: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return normaliseEmail(data.user?.email ?? "");
}
async function ownerName(clientId: string) {
  const { data } = await supabaseAdmin.from("clients").select("contact_name, company_name").eq("id", clientId).maybeSingle();
  return (data?.contact_name as string | null)?.trim() || (data?.company_name as string | null)?.trim() || "Someone";
}
async function scheduledCount(brandId: string, clientId: string) {
  const { count } = await supabaseAdmin.from("content").select("id", { count: "exact", head: true })
    .eq("brand_id", brandId).eq("client_id", clientId).or(`status.eq.scheduled,scheduled_at.gt.${new Date().toISOString()}`);
  return count ?? 0;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token) {
    if (!TOKEN.test(token)) return bad("This link isn't valid.", 404);
    const { data } = await supabaseAdmin.from("brand_transfers").select("*").eq("token", token).maybeSingle();
    const offer = data as Offer | null;
    if (!offer) return bad("This link isn't valid.", 404);
    const { data: brand } = await supabaseAdmin.from("brand_profiles").select("brand_name, logo_url, client_id, is_active").eq("id", offer.brand_id).maybeSingle();
    if (!brand) return bad("This link isn't valid.", 404);
    const [{ count: posts }, { count: products }] = await Promise.all([
      supabaseAdmin.from("content").select("id", { count: "exact", head: true }).eq("brand_id", offer.brand_id),
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }).eq("brand_id", offer.brand_id),
    ]);
    const status = brand.is_active === false ? "archived" : brand.client_id !== offer.from_client && !offer.accepted_at ? "cancelled" : offerStatus(offer);
    return NextResponse.json({ brand: { name: brand.brand_name || "A brand", logo: brand.logo_url }, from: await ownerName(offer.from_client), emailHint: maskEmail(offer.to_email), keepAccess: offer.keep_access, status, counts: { posts: posts ?? 0, products: products ?? 0 } });
  }
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return bad(auth.error, auth.status);
  const brandId = url.searchParams.get("brandId") ?? "";
  if (!UUID.test(brandId)) return bad("Invalid request");
  const access = await brandAccess(auth.value, brandId);
  if (access?.role !== "owner") return bad("Brand not found.", 404);
  const { data } = await supabaseAdmin.from("brand_transfers").select("*").eq("brand_id", brandId).is("accepted_at", null).is("cancelled_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1);
  const offer = (data?.[0] as Offer | undefined) ?? null;
  return NextResponse.json({ offer: offer ? { email: offer.to_email, keepAccess: offer.keep_access, expiresAt: offer.expires_at, link: `${appOrigin(request)}/transfer/${offer.token}` } : null, scheduled: await scheduledCount(brandId, access.clientId) });
}

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 4_000)) return bad("Request too large", 413);
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return bad(auth.error, auth.status);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("Invalid request"); }

  if (body.action === "accept" || body.action === "decline") {
    const token = typeof body.token === "string" ? body.token : "";
    if (!TOKEN.test(token)) return bad("This link isn't valid.", 404);
    const { data } = await supabaseAdmin.from("brand_transfers").select("*").eq("token", token).maybeSingle();
    const offer = data as Offer | null;
    if (!offer) return bad("This link isn't valid.", 404);
    const status = offerStatus(offer);
    if (status === "cancelled") return bad("This handover was cancelled.", 410);
    if (status === "expired") return bad("This handover link has expired. Ask for a new one.", 410);
    if (status === "done") return bad("This brand has already been handed over.", 410);
    const email = await emailOf(auth.value);
    if (email !== offer.to_email) return bad(`This brand is being handed to ${maskEmail(offer.to_email)}. Sign in with that email to accept it.`, 403);
    if (body.action === "decline") {
      await supabaseAdmin.from("brand_transfers").update({ cancelled_at: new Date().toISOString() }).eq("id", offer.id).is("accepted_at", null);
      return NextResponse.json({ ok: true });
    }
    const to = await ownClientId(auth.value);
    if (!to) return bad("Finish setting up your account first (open BlinkSpot once), then use the link again.", 409);
    if (to === offer.from_client) return bad("This is already your brand.", 409);
    const { data: client } = await supabaseAdmin.from("clients").select("plan_tier").eq("id", to).single();
    const limit = getLimitForTier(client?.plan_tier).maxBrands;
    const { count: used } = await supabaseAdmin.from("brand_profiles").select("id", { count: "exact", head: true }).eq("client_id", to).eq("is_active", true);
    if ((used ?? 0) >= limit) return NextResponse.json({ error: `Your plan has room for ${limit} active brand${limit === 1 ? "" : "s"} and you have ${used}. Archive one or upgrade, then accept.`, code: "no_slot" }, { status: 409 });
    if (await scheduledCount(offer.brand_id, offer.from_client)) return bad("This brand still has posts on the calendar. Ask the owner to take them off the calendar first, then accept.", 409);
    // Claim the offer first, so it can only be accepted once.
    const { data: claimed } = await supabaseAdmin.from("brand_transfers").update({ accepted_by: auth.value, accepted_at: new Date().toISOString() })
      .eq("id", offer.id).is("accepted_at", null).is("cancelled_at", null).select("id");
    if (!claimed?.length) return bad("This brand has already been handed over.", 410);
    const { data: moved, error } = await supabaseAdmin.rpc("transfer_brand", {
      p_brand: offer.brand_id, p_from: offer.from_client, p_to: to, p_old_owner: offer.created_by, p_new_owner: auth.value, p_keep_access: offer.keep_access,
    });
    if (error) {
      await supabaseAdmin.from("brand_transfers").update({ accepted_by: null, accepted_at: null }).eq("id", offer.id);
      return bad(/scheduled/.test(error.message) ? "This brand still has posts on the calendar. Ask the owner to take them off the calendar first." : "Couldn't move the brand just now. Nothing changed; try again.", 409);
    }
    const { data: brand } = await supabaseAdmin.from("brand_profiles").select("id, brand_name, logo_url").eq("id", offer.brand_id).single();
    return NextResponse.json({ brand, moved });
  }

  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  if (!brandId) return bad("Invalid request");
  const access = await brandAccess(auth.value, brandId);
  if (access?.role !== "owner") return bad("Only the brand's owner can hand it over.", 403);

  if (body.action === "cancel") {
    await supabaseAdmin.from("brand_transfers").update({ cancelled_at: new Date().toISOString() }).eq("brand_id", brandId).is("accepted_at", null).is("cancelled_at", null);
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "offer") return bad("Invalid request");
  if (!access.active) return bad("Restore this brand before handing it over.", 409);
  const email = typeof body.email === "string" ? normaliseEmail(body.email) : "";
  if (!email) return bad("That email doesn't look right.");
  if (email === await emailOf(auth.value)) return bad("That's your own email.");
  const { data: brand } = await supabaseAdmin.from("brand_profiles").select("brand_name").eq("id", brandId).single();
  if (String(body.confirmName ?? "").trim().toLowerCase() !== String(brand?.brand_name ?? "").trim().toLowerCase()) return bad("Type the brand's name exactly to confirm.");
  const scheduled = await scheduledCount(brandId, access.clientId);
  if (scheduled) return bad(`${scheduled} post${scheduled === 1 ? " is" : "s are"} still on the calendar. Take ${scheduled === 1 ? "it" : "them"} off first: they'd publish through your accounts.`, 409);
  await supabaseAdmin.from("brand_transfers").update({ cancelled_at: new Date().toISOString() }).eq("brand_id", brandId).is("accepted_at", null).is("cancelled_at", null);
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await supabaseAdmin.from("brand_transfers")
    .insert({ brand_id: brandId, from_client: access.clientId, to_email: email, token, keep_access: body.keepAccess !== false, created_by: auth.value })
    .select("expires_at").single();
  if (error || !data) return bad("Couldn't prepare the handover. Try again.", 500);
  return NextResponse.json({ offer: { email, keepAccess: body.keepAccess !== false, expiresAt: data.expires_at, link: `${appOrigin(request)}/transfer/${token}` } });
}
