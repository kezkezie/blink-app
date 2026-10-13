import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { brandAccess, ownClientId } from "@/lib/brand-access";
import { SHARE_LIMIT, isShareRole, maskEmail, normaliseEmail, type ShareRole } from "@/lib/brand-sharing";

/**
 * Shared brands (Kezie, 2026-10-13: "two people working on one brand at the same time").
 * The owner shares a brand by link (one person per link) or by email (shown to that person when
 * they sign in). Editors make, edit and schedule with the owner's credits; viewers look.
 *   GET  ?token=…      invite preview for /join (no sign-in needed: brand, inviter, role, status)
 *   GET  ?brandId=…    who has access (owner) or your own access (member)
 *   GET  ?view=invites invites sent to your email
 *   POST { action: invite | revoke | set_role | remove | leave | accept | decline, … }
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

type InviteRow = { id: string; brand_id: string; token: string; email: string | null; role: ShareRole; created_by: string; created_at: string; expires_at: string; accepted_at: string | null; revoked_at: string | null };

function inviteStatus(i: Pick<InviteRow, "accepted_at" | "revoked_at" | "expires_at">) {
  if (i.revoked_at) return "revoked" as const;
  if (i.accepted_at) return "used" as const;
  if (new Date(i.expires_at).getTime() < Date.now()) return "expired" as const;
  return "open" as const;
}

function appOrigin(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return configured && /^https?:\/\//.test(configured) ? configured : new URL(request.url).origin;
}

async function ownerName(clientId: string) {
  const { data } = await supabaseAdmin.from("clients").select("contact_name, company_name").eq("id", clientId).maybeSingle();
  return (data?.contact_name as string | null)?.trim() || (data?.company_name as string | null)?.trim() || "The owner";
}

async function userEmail(userId: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return { email: normaliseEmail(data.user?.email ?? ""), name: (data.user?.user_metadata?.full_name as string | undefined)?.trim() || null, createdAt: data.user?.created_at ?? null };
}

async function brandSummary(brandId: string) {
  const { data } = await supabaseAdmin.from("brand_profiles").select("id, brand_name, logo_url, client_id, is_active").eq("id", brandId).maybeSingle();
  return data as { id: string; brand_name: string | null; logo_url: string | null; client_id: string; is_active: boolean | null } | null;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token) {
    if (!TOKEN.test(token)) return bad("This invite link isn't valid.", 404);
    const { data: invite } = await supabaseAdmin.from("brand_invites").select("*").eq("token", token).maybeSingle();
    if (!invite) return bad("This invite link isn't valid.", 404);
    const brand = await brandSummary(invite.brand_id);
    if (!brand) return bad("This invite link isn't valid.", 404);
    return NextResponse.json({
      brand: { name: brand.brand_name || "A brand", logo: brand.logo_url },
      inviter: await ownerName(brand.client_id),
      role: invite.role,
      status: brand.is_active === false ? "archived" : inviteStatus(invite),
      emailHint: invite.email ? maskEmail(invite.email) : null,
    });
  }

  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return bad(auth.error, auth.status);

  if (url.searchParams.get("view") === "invites") {
    const { email, createdAt } = await userEmail(auth.value);
    if (!email || !createdAt) return NextResponse.json({ invites: [] });
    // Sign-up doesn't confirm emails, so an account made after the invite could belong to anyone
    // using that address: it gets in only with the link the owner sent. Accounts that already
    // existed see their invites here.
    const { data } = await supabaseAdmin.from("brand_invites").select("*").eq("email", email).gt("created_at", createdAt).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(10);
    const own = await ownClientId(auth.value);
    const invites = [];
    for (const i of (data ?? []) as InviteRow[]) {
      const brand = await brandSummary(i.brand_id);
      if (!brand || brand.is_active === false || brand.client_id === own) continue;
      const { data: already } = await supabaseAdmin.from("brand_members").select("role").eq("brand_id", i.brand_id).eq("user_id", auth.value).maybeSingle();
      if (already) continue;
      invites.push({ token: i.token, role: i.role, brand: { name: brand.brand_name || "A brand", logo: brand.logo_url }, inviter: await ownerName(brand.client_id) });
    }
    return NextResponse.json({ invites });
  }

  const brandId = url.searchParams.get("brandId") ?? "";
  if (!UUID.test(brandId)) return bad("Invalid request");
  const access = await brandAccess(auth.value, brandId);
  if (!access) return bad("Brand not found.", 404);
  if (access.role !== "owner") {
    return NextResponse.json({ role: access.role, ownerName: await ownerName(access.clientId) });
  }
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabaseAdmin.from("brand_members").select("user_id, role, created_at").eq("brand_id", brandId).order("created_at"),
    supabaseAdmin.from("brand_invites").select("*").eq("brand_id", brandId).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
  ]);
  const people = await Promise.all((members ?? []).map(async (m) => {
    const who = await userEmail(m.user_id as string);
    return { userId: m.user_id, role: m.role, since: m.created_at, email: who.email || null, name: who.name };
  }));
  const origin = appOrigin(request);
  return NextResponse.json({
    role: "owner",
    limit: SHARE_LIMIT,
    members: people,
    invites: ((invites ?? []) as InviteRow[]).map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at, link: `${origin}/join/${i.token}` })),
  });
}

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 8_000)) return bad("Request too large", 413);
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return bad(auth.error, auth.status);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("Invalid request"); }
  const action = body.action;

  if (action === "accept" || action === "decline") {
    const token = typeof body.token === "string" ? body.token : "";
    if (!TOKEN.test(token)) return bad("This invite link isn't valid.", 404);
    const { data } = await supabaseAdmin.from("brand_invites").select("*").eq("token", token).maybeSingle();
    const invite = data as InviteRow | null;
    if (!invite) return bad("This invite link isn't valid.", 404);
    const status = inviteStatus(invite);
    if (status === "revoked") return bad("This invite was cancelled. Ask for a new one.", 410);
    if (status === "expired") return bad("This invite has expired. Ask for a new one.", 410);
    const me = await userEmail(auth.value);
    if (invite.email && invite.email !== me.email) {
      return bad(`This invite is for ${maskEmail(invite.email)}. Sign in with that email to accept it.`, 403);
    }
    const brand = await brandSummary(invite.brand_id);
    if (!brand || brand.is_active === false) return bad("That brand isn't available any more.", 410);
    const own = await ownClientId(auth.value);
    if (brand.client_id === own) return bad("This is your own brand, so you already have it.", 409);
    const { data: existing } = await supabaseAdmin.from("brand_members").select("role").eq("brand_id", brand.id).eq("user_id", auth.value).maybeSingle();

    if (action === "decline") {
      if (!invite.email) return NextResponse.json({ ok: true }); // a link is just not used
      await supabaseAdmin.from("brand_invites").update({ revoked_at: new Date().toISOString() }).eq("id", invite.id).is("accepted_at", null);
      return NextResponse.json({ ok: true });
    }

    if (status === "used" && !existing) return bad("This invite has already been used. Each link lets one person in; ask for a new one.", 410);
    if (!existing) {
      // Claim the invite first, so two people racing on one link can't both get in.
      const { data: claimed } = await supabaseAdmin.from("brand_invites")
        .update({ accepted_by: auth.value, accepted_at: new Date().toISOString() })
        .eq("id", invite.id).is("accepted_at", null).is("revoked_at", null).select("id");
      if (!claimed?.length) return bad("This invite has already been used. Each link lets one person in; ask for a new one.", 410);
      const { error } = await supabaseAdmin.from("brand_members").insert({ brand_id: brand.id, user_id: auth.value, role: invite.role, invited_by: invite.created_by });
      if (error) {
        await supabaseAdmin.from("brand_invites").update({ accepted_by: null, accepted_at: null }).eq("id", invite.id);
        return bad("Couldn't join just now. Try again.", 500);
      }
    }
    const role = (existing?.role as ShareRole | undefined) ?? invite.role;
    return NextResponse.json({
      brand: { id: brand.id, brand_name: brand.brand_name || "Brand", logo_url: brand.logo_url, client_id: brand.client_id, role, owner_name: await ownerName(brand.client_id) },
      already: !!existing,
    });
  }

  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;

  if (action === "leave") {
    if (!brandId) return bad("Invalid request");
    await supabaseAdmin.from("brand_members").delete().eq("brand_id", brandId).eq("user_id", auth.value);
    return NextResponse.json({ ok: true });
  }

  // Everything else is the owner managing who has access.
  if (action === "revoke") {
    const inviteId = typeof body.inviteId === "string" && UUID.test(body.inviteId) ? body.inviteId : null;
    if (!inviteId) return bad("Invalid request");
    const { data: invite } = await supabaseAdmin.from("brand_invites").select("brand_id").eq("id", inviteId).maybeSingle();
    const access = invite ? await brandAccess(auth.value, invite.brand_id as string) : null;
    if (access?.role !== "owner") return bad("Invite not found.", 404);
    await supabaseAdmin.from("brand_invites").update({ revoked_at: new Date().toISOString() }).eq("id", inviteId).is("accepted_at", null);
    return NextResponse.json({ ok: true });
  }

  if (!brandId) return bad("Invalid request");
  const access = await brandAccess(auth.value, brandId);
  if (access?.role !== "owner") return bad("Only the brand's owner can change who has access.", 403);
  if (!access.active) return bad("Restore this brand before sharing it.", 409);

  if (action === "invite") {
    const role: ShareRole = isShareRole(body.role) ? body.role : "editor";
    const email = typeof body.email === "string" && body.email.trim() ? normaliseEmail(body.email) : null;
    if (email === "") return bad("That email doesn't look right.");
    const [{ count: memberCount }, { count: inviteCount }] = await Promise.all([
      supabaseAdmin.from("brand_members").select("user_id", { count: "exact", head: true }).eq("brand_id", brandId),
      supabaseAdmin.from("brand_invites").select("id", { count: "exact", head: true }).eq("brand_id", brandId).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()),
    ]);
    if ((memberCount ?? 0) + (inviteCount ?? 0) >= SHARE_LIMIT) {
      return bad(`A brand can be shared with up to ${SHARE_LIMIT} people (open invites count). Remove someone or cancel an invite first.`, 409);
    }
    if (email) {
      const me = await userEmail(auth.value);
      if (email === me.email) return bad("That's your own email.");
      const { data: open } = await supabaseAdmin.from("brand_invites").select("id").eq("brand_id", brandId).eq("email", email).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).limit(1);
      if (open?.length) return bad("There's already an open invite for that email.", 409);
    }
    const token = randomBytes(32).toString("base64url");
    const { data, error } = await supabaseAdmin.from("brand_invites").insert({ brand_id: brandId, token, email, role, created_by: auth.value }).select("id, email, role, expires_at").single();
    if (error || !data) return bad("Couldn't create the invite. Try again.", 500);
    return NextResponse.json({ invite: { id: data.id, email: data.email, role: data.role, expiresAt: data.expires_at, link: `${appOrigin(request)}/join/${token}` } });
  }

  const userId = typeof body.userId === "string" && UUID.test(body.userId) ? body.userId : null;
  if (!userId) return bad("Invalid request");
  if (action === "set_role") {
    if (!isShareRole(body.role)) return bad("Invalid request");
    const { data } = await supabaseAdmin.from("brand_members").update({ role: body.role }).eq("brand_id", brandId).eq("user_id", userId).select("user_id");
    return data?.length ? NextResponse.json({ ok: true }) : bad("They don't have access to this brand.", 404);
  }
  if (action === "remove") {
    await supabaseAdmin.from("brand_members").delete().eq("brand_id", brandId).eq("user_id", userId);
    return NextResponse.json({ ok: true });
  }
  return bad("Invalid request");
}
