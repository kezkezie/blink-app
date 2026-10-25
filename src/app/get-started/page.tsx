"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AuthField, AuthShell } from "@/components/auth/AuthShell";
import { LEAKED_PASSWORD_MESSAGE, pwnedCount } from "@/lib/pwned-password";
import { LEGAL_DOCS, consentRecord } from "@/lib/legal";
import { GoogleButton, OrLine } from "@/components/auth/GoogleButton";

/** Only a path on this site (e.g. an invite at /join/…); anything else starts at brand set-up. */
function safeRedirect(v: string | null) {
  return v && /^\/(?!\/)[\w\-./?=&%]*$/.test(v) ? v : null;
}

function GetStarted() {
  const router = useRouter();
  const redirect = safeRedirect(useSearchParams().get("redirect"));
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) router.replace(redirect ?? "/studio");
      else setChecking(false);
    });
  }, [router, redirect]);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!agreed) { setMessage({ tone: "error", text: "Tick the box to agree to the Terms, Privacy Policy and Acceptable Use Policy." }); return; }
    setSubmitting(true);
    if (password.length < 8) { setMessage({ tone: "error", text: "Use at least 8 characters." }); setSubmitting(false); return; }
    // Known-breached passwords are refused (Supabase's own check needs their Pro plan).
    const leaks = await pwnedCount(password);
    if (leaks !== null && leaks > 0) { setMessage({ tone: "error", text: LEAKED_PASSWORD_MESSAGE }); setSubmitting(false); return; }
    // If Supabase asks for an email confirmation, the link comes back to the two-screen brand set-up.
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, ...consentRecord() }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect ?? "/welcome")}` } });
    if (error) { setMessage({ tone: "error", text: error.message }); setSubmitting(false); return; }
    if (data.user) {
      // The clients row must never have an empty name or email.
      await supabase.from("clients").update({ contact_name: fullName, contact_email: email }).eq("user_id", data.user.id);
      if (!data.session) {
        setMessage({ tone: "info", text: `Check ${email} for a link to confirm your account, then sign in.` });
        setSubmitting(false);
        return;
      }
      // Someone joining a shared brand goes back to the invite instead of setting up their own brand.
      router.push(redirect ?? "/welcome");
    }
  }

  if (checking) return <div className="min-h-dvh grid place-items-center" style={{ background: "#0C0D0F" }}><Loader2 className="h-6 w-6 animate-spin text-white/50" /></div>;

  return (
    <AuthShell
      title="Make your first post in minutes"
      subtitle="Create your account. Then tell us about your brand, or let us build one with you."
      footer={<>Already have an account? <Link href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login"} className="underline" style={{ color: "var(--s-text)" }}>Sign in</Link></>}
    >
      <form onSubmit={handleSignUp} className="grid gap-4">
        <AuthField label="Your name" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" autoComplete="name" />
        <AuthField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
        <AuthField label="Password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
        <label className="flex items-start gap-2.5 text-[13px] leading-snug cursor-pointer" style={{ color: "var(--s-soft)" }}>
          <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer" style={{ accentColor: "var(--s-accent)" }} aria-describedby="agree-note" />
          <span>
            I agree to BlinkSpot&apos;s{" "}
            {LEGAL_DOCS.map((d, i) => (
              <span key={d.id}>
                <Link href={d.href} target="_blank" rel="noopener" className="underline" style={{ color: "var(--s-text)" }}>{d.label}</Link>
                {i < LEGAL_DOCS.length - 2 ? ", " : i === LEGAL_DOCS.length - 2 ? " and " : "."}
              </span>
            ))}
            <span id="agree-note" className="block text-[11.5px] mt-0.5" style={{ color: "var(--s-mute)" }}>On the free plan, what you make carries a small BlinkSpot stamp. Any paid plan removes it.</span>
          </span>
        </label>
        {message && (
          <p role="alert" className="text-[13px] rounded-lg px-3 py-2" style={{ background: message.tone === "error" ? "color-mix(in oklab, var(--s-danger) 12%, transparent)" : "color-mix(in oklab, var(--s-ok) 12%, transparent)", color: message.tone === "error" ? "var(--s-danger)" : "var(--s-ok)" }}>{message.text}</p>
        )}
        <button type="submit" className="s-btn primary justify-center mt-2" style={{ height: 46, fontSize: 15 }} disabled={submitting || !agreed}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create account <ArrowRight className="h-4 w-4" />
        </button>
        <OrLine />
        <GoogleButton next={redirect ?? "/welcome"} disabled={!agreed} onError={(text) => setMessage({ tone: "error", text })} />
        {!agreed && <p className="text-[11.5px] -mt-2 text-center" style={{ color: "var(--s-mute)" }}>Tick the agreement above to use Google too.</p>}
        <p className="text-[12px] text-center" style={{ color: "var(--s-mute)" }}>Free to start. No card needed.</p>
      </form>
    </AuthShell>
  );
}

export default function GetStartedPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh grid place-items-center" style={{ background: "#0C0D0F" }}><Loader2 className="h-6 w-6 animate-spin text-white/50" /></div>}>
      <GetStarted />
    </Suspense>
  );
}
