"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AuthField, AuthShell } from "@/components/auth/AuthShell";

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
      <AuthField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" autoComplete="email" />
      <AuthField label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" />
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
