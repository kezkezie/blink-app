"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AuthField, AuthShell } from "@/components/auth/AuthShell";
import { LEAKED_PASSWORD_MESSAGE, pwnedCount } from "@/lib/pwned-password";

export default function GetStartedPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) router.replace("/studio");
      else setChecking(false);
    });
  }, [router]);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    if (password.length < 8) { setMessage({ tone: "error", text: "Use at least 8 characters." }); setSubmitting(false); return; }
    // Known-breached passwords are refused (Supabase's own check needs their Pro plan).
    const leaks = await pwnedCount(password);
    if (leaks !== null && leaks > 0) { setMessage({ tone: "error", text: LEAKED_PASSWORD_MESSAGE }); setSubmitting(false); return; }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) { setMessage({ tone: "error", text: error.message }); setSubmitting(false); return; }
    if (data.user) {
      // The clients row must never have an empty name or email.
      await supabase.from("clients").update({ contact_name: fullName, contact_email: email }).eq("user_id", data.user.id);
      if (!data.session) {
        setMessage({ tone: "info", text: `Check ${email} for a link to confirm your account, then sign in.` });
        setSubmitting(false);
        return;
      }
      router.push("/welcome");
    }
  }

  if (checking) return <div className="min-h-dvh grid place-items-center" style={{ background: "#0C0D0F" }}><Loader2 className="h-6 w-6 animate-spin text-white/50" /></div>;

  return (
    <AuthShell
      title="Make your first post in minutes"
      subtitle="Create your account. Then tell us about your brand, or let us build one with you."
      footer={<>Already have an account? <Link href="/login" className="underline" style={{ color: "var(--s-text)" }}>Sign in</Link></>}
    >
      <form onSubmit={handleSignUp} className="grid gap-4">
        <AuthField label="Your name" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" autoComplete="name" />
        <AuthField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
        <AuthField label="Password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
        {message && (
          <p role="alert" className="text-[13px] rounded-lg px-3 py-2" style={{ background: message.tone === "error" ? "color-mix(in oklab, var(--s-danger) 12%, transparent)" : "color-mix(in oklab, var(--s-ok) 12%, transparent)", color: message.tone === "error" ? "var(--s-danger)" : "var(--s-ok)" }}>{message.text}</p>
        )}
        <button type="submit" className="s-btn primary justify-center mt-2" style={{ height: 46, fontSize: 15 }} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create account <ArrowRight className="h-4 w-4" />
        </button>
        <p className="text-[12px] text-center" style={{ color: "var(--s-mute)" }}>Free to start. No card needed.</p>
      </form>
    </AuthShell>
  );
}
