"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AuthField, AuthShell } from "@/components/auth/AuthShell";

/**
 * Forgot password (2026-10-20, before taking real money: there was no way back in). Sends Supabase's
 * reset link; it opens /auth/callback, which signs the person in and lands on /reset-password. The
 * answer is the same whether or not the email has an account, so nobody can test addresses.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
    setSending(false);
    if (error && /rate|seconds|too many/i.test(error.message)) { setError("Too many tries for now. Wait a minute and try again."); return; }
    setSent(true);
  }
  return (
    <AuthShell title="Forgot your password?" subtitle="We'll email you a link to set a new one." footer={<>Remembered it? <Link href="/login" className="underline" style={{ color: "var(--s-text)" }}>Sign in</Link></>}>
      {sent ? (
        <div className="grid gap-3 text-[14px]" role="status">
          <MailCheck className="h-6 w-6" style={{ color: "var(--s-accent)" }} />
          <p>If <b>{email.trim()}</b> has a BlinkSpot account, a link to set a new password is on its way. It works for an hour.</p>
          <p className="text-[13px]" style={{ color: "var(--s-mute)" }}>Nothing after a few minutes? Check spam, or write to info@blinkspot.io.</p>
        </div>
      ) : (
        <form onSubmit={send} className="grid gap-4">
          <AuthField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" autoComplete="email" />
          {error && <p role="alert" className="text-[13px] rounded-lg px-3 py-2" style={{ background: "color-mix(in oklab, var(--s-danger) 12%, transparent)", color: "var(--s-danger)" }}>{error}</p>}
          <button type="submit" className="s-btn primary justify-center mt-2" style={{ height: 46, fontSize: 15 }} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send the link <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      )}
    </AuthShell>
  );
}
