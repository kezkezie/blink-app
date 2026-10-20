import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Email links that work on any device (2026-10-20): Supabase's email template points here with
 * ?token_hash=...&type=recovery&next=/reset-password, and the token is checked on the server, so
 * the reset email can be opened on a phone even if it was asked for on a laptop (the default
 * code link only works in the browser that asked). Template: Supabase > Auth > Emails > Reset
 * password: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 */
const TYPES: EmailOtpType[] = ["recovery", "signup", "invite", "magiclink", "email_change", "email"];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const wanted = searchParams.get("next") ?? "/studio";
  const next = /^\/(?!\/)[\w\-./?=&%]*$/.test(wanted) ? wanted : "/studio";
  if (tokenHash && type && TYPES.includes(type)) {
    const cookieStore = await cookies();
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(list) { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* read-only here */ } },
      },
    });
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}${type === "recovery" ? "/reset-password" : "/login?error=auth_failed"}`);
}
