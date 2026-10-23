import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAdminEmail } from "./admin";

/** The signed-in user, if they may open the admin dashboard (lib/admin.ts adminEmails). */
export async function requireAdmin(request: NextRequest): Promise<{ ok: true; userId: string; email: string } | { ok: false; status: 401 | 403 }> {
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return request.cookies.getAll(); }, setAll() {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };
  if (!isAdminEmail(user.email)) return { ok: false, status: 403 };
  return { ok: true, userId: user.id, email: user.email! };
}
