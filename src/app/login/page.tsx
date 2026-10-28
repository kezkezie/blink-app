"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AuthField, AuthShell } from "@/components/auth/AuthShell";
import { GoogleButton, OrLine } from "@/components/auth/GoogleButton";

/** Where to go after signing in: back to the page they were sent from, or into the studio. */
function nextPath(redirect: string | null, onboarded: boolean) {
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) return redirect;
  return onboarded ? "/studio" : "/welcome";
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(nextPath(redirect, user.user_metadata?.onboarding_completed === true));
    });
  }, [router, redirect]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message); setLoading(false); return; }
    const user = data.user || (await supabase.auth.getUser()).data.user;
    router.refresh();
    router.replace(nextPath(redirect, user?.user_metadata?.onboarding_completed === true));
  }

  return (
    <form onSubmit={handleLogin} className="grid gap-4">
      <GoogleButton next={redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/studio"} onError={setError} />
      <p className="text-[11.5px] -mt-2 text-center" style={{ color: "var(--s-mute)" }}>
        New here? Continuing with Google means you agree to our <Link href="/terms" target="_blank" className="underline">Terms</Link>, <Link href="/privacy" target="_blank" className="underline">Privacy Policy</Link> and <Link href="/acceptable-use" target="_blank" className="underline">Acceptable Use Policy</Link>.
      </p>
      <OrLine />
      <AuthField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" autoComplete="email" />
      <AuthField label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" />
      <Link href="/forgot-password" className="text-[13px] justify-self-end -mt-2 underline" style={{ color: "var(--s-soft)" }}>Forgot your password?</Link>
      {params.get("deleted") === "1" && <p role="status" className="text-[13px] rounded-lg px-3 py-2" style={{ background: "var(--s-raised)", color: "var(--s-soft)" }}>Your account and everything in it were deleted. Thanks for trying BlinkSpot.</p>}
      {error && <p role="alert" className="text-[13px] rounded-lg px-3 py-2" style={{ background: "color-mix(in oklab, var(--s-danger) 12%, transparent)", color: "var(--s-danger)" }}>{error}</p>}
      <button type="submit" className="s-btn primary justify-center mt-2" style={{ height: 46, fontSize: 15 }} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Sign in <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to keep making."
      footer={<>New to BlinkSpot? <Link href="/get-started" className="underline" style={{ color: "var(--s-text)" }}>Create an account</Link></>}
    >
      <Suspense fallback={<Loader2 className="h-5 w-5 animate-spin" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
