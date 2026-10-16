import { supabaseAdmin } from "@/lib/supabase-server";
import { BRAND_HEADER } from "@/lib/brand-header";

/**
 * Shared brands (2026-10-13). A brand lives in its owner's workspace (client). People the owner
 * invites are editors (make, edit, schedule, spending the owner's credits) or viewers (look only).
 * Server routes resolve the workspace a request works in with `workspaceFor`, then run their usual
 * ownership checks against it, so nothing changes for a brand the caller owns.
 */
export type BrandRole = "owner" | "editor" | "viewer";
export type BrandAccess = { brandId: string; clientId: string; role: BrandRole; active: boolean };
export type Workspace = { clientId: string; ownClientId: string | null; role: BrandRole };

export async function ownClientId(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("clients").select("id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Couldn't load the account");
  return (data?.id as string | undefined) ?? null;
}

/** What the user may do with a brand and whose workspace it is in. Null: no access. */
export async function brandAccess(userId: string, brandId: string, own?: string | null): Promise<BrandAccess | null> {
  const ownId = own === undefined ? await ownClientId(userId) : own;
  const { data: brand } = await supabaseAdmin.from("brand_profiles").select("id, client_id, is_active").eq("id", brandId).maybeSingle();
  if (!brand || typeof brand.client_id !== "string") return null;
  const active = brand.is_active !== false;
  if (ownId && brand.client_id === ownId) return { brandId, clientId: ownId, role: "owner", active };
  // An archived brand is closed to everyone but its owner.
  if (!active) return null;
  const { data: member } = await supabaseAdmin.from("brand_members").select("role, access_until").eq("brand_id", brandId).eq("user_id", userId).maybeSingle();
  if (member?.role !== "editor" && member?.role !== "viewer") return null;
  // Shared for a while (2026-10-16): once access ends it's as if it was never shared.
  if (member.access_until && new Date(member.access_until as string).getTime() <= Date.now()) return null;
  return { brandId, clientId: brand.client_id, role: member.role, active };
}

/**
 * The workspace a request works in, and is charged to: the brand owner's when the brand (or the
 * post's brand) was shared with the caller as an editor (or as a viewer, for reads), otherwise the
 * caller's own. Anything the caller has no right to falls back to their own workspace, where the
 * ownership checks that follow refuse it exactly as they did before sharing existed.
 */
export async function workspaceFor(
  userId: string,
  scope: { brandId?: string | null; contentId?: string | null; write?: boolean } = {},
): Promise<Workspace | null> {
  const own = await ownClientId(userId);
  const mine: Workspace | null = own ? { clientId: own, ownClientId: own, role: "owner" } : null;
  let brandId = scope.brandId || null;
  if (!brandId && scope.contentId) {
    const { data } = await supabaseAdmin.from("content").select("client_id, brand_id").eq("id", scope.contentId).maybeSingle();
    if (!data?.brand_id || data.client_id === own) return mine;
    brandId = data.brand_id as string;
  }
  if (!brandId) return mine;
  const access = await brandAccess(userId, brandId, own);
  if (!access || access.role === "owner") return mine;
  if (access.role === "viewer" && scope.write !== false) return mine;
  return { clientId: access.clientId, ownClientId: own, role: access.role };
}

/**
 * For code that first looks a brand up in the caller's own workspace: when it isn't there, the
 * owner's workspace if the brand was shared with the caller (as an editor, or any role for reads).
 * Null otherwise, and on any error, so the caller's usual "not found" stands.
 */
export async function sharedWorkspace(userId: string, brandId: string, write = true): Promise<string | null> {
  try {
    const access = await brandAccess(userId, brandId);
    if (!access || access.role === "owner" || (write && access.role === "viewer")) return null;
    return access.clientId;
  } catch {
    return null;
  }
}

/** A client id the browser sent is fine if it is the caller's own or the shared workspace. */
export function clientIdMatches(requested: string | null | undefined, ws: Workspace) {
  return !requested || requested === ws.clientId || requested === ws.ownClientId;
}

export { BRAND_HEADER };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The workspace for an API request: the brand named in the body, else the studio's active brand
 * (header), checked against the caller's access. `id` and `plan_tier` are that workspace's, so a
 * route that used the caller's client row can use this one instead.
 */
export async function requestWorkspace(
  request: Request,
  userId: string,
  brandId?: unknown,
  opts: { contentId?: string | null; write?: boolean } = {},
): Promise<(Workspace & { id: string; plan_tier: string | null }) | null> {
  const header = request.headers.get(BRAND_HEADER);
  const brand = typeof brandId === "string" && UUID.test(brandId) ? brandId : header && UUID.test(header) ? header : null;
  const ws = await workspaceFor(userId, { brandId: brand, contentId: opts.contentId, write: opts.write });
  if (!ws) return null;
  const { data } = await supabaseAdmin.from("clients").select("plan_tier").eq("id", ws.clientId).maybeSingle();
  return { ...ws, id: ws.clientId, plan_tier: (data?.plan_tier as string | null | undefined) ?? null };
}
