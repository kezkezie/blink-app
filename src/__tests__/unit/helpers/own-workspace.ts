import { supabaseAdmin } from "@/lib/supabase-server";

/**
 * lib/brand-access for a user with no shared brands, resolved the way it was before sharing (one
 * clients query), so tests that queue database replies in order keep their order. Shared brands
 * are tested in brand-access.test.ts.
 */
async function ownClientId(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("clients").select("id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Couldn't load the account");
  return (data?.id as string | undefined) ?? null;
}

async function workspaceFor(userId: string) {
  const id = await ownClientId(userId);
  return id ? { clientId: id, ownClientId: id, role: "owner" as const } : null;
}

export const ownWorkspaceOnly = {
  BRAND_HEADER: "x-blink-brand",
  ownClientId,
  workspaceFor,
  brandAccess: async () => null,
  sharedWorkspace: async () => null,
  clientIdMatches: (requested: string | null | undefined, ws: { clientId: string; ownClientId: string | null }) =>
    !requested || requested === ws.clientId || requested === ws.ownClientId,
};
