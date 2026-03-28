"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const onboardingCompleted =
          user.user_metadata?.onboarding_completed === true;
        // ✅ FIXED: Route to /get-started instead of /onboarding
        router.replace(onboardingCompleted ? "/dashboard" : "/get-started");
      }
    }
    checkAuth();
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      const user = data.user || (await supabase.auth.getUser()).data.user;
      const onboardingCompleted =
        user?.user_metadata?.onboarding_completed === true;

      // ✅ FIXED: Refresh server state to recognize the new cookie
      router.refresh();
      // ✅ FIXED: Route to /get-started instead of /onboarding
      router.replace(onboardingCompleted ? "/dashboard" : "/get-started");
    }
  }

  async function handleSignup() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Signup failed");
      }

      if (data.clientId) {
        localStorage.setItem("clientId", data.clientId);
      }

      // ✅ FIXED: Route to /get-started instead of /onboarding
      router.replace("/get-started");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleSubmit() {
    setGoogleLoading(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#191D23] px-4 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#C5BAC4]/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex items-center justify-center gap-3 mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="h-12 w-12 bg-[#2A2F38] border border-[#57707A]/50 rounded-xl flex items-center justify-center shadow-inner">
            <Zap className="h-6 w-6 text-[#C5BAC4]" />
          </div>
          <span className="text-4xl font-bold text-[#DEDCDC] font-display tracking-wide">
            Blink
          </span>
        </div>

        <div className="bg-[#2A2F38] rounded-3xl shadow-2xl border border-[#57707A]/30 p-8 sm:p-10 animate-in fade-in zoom-in-95 duration-500 delay-150">
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-[#DEDCDC] font-display">
                Welcome back
              </h2>
              <p className="mt-2 text-sm text-[#989DAA]">
                Log in to your account to continue creating.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@business.com"
                  required
                  className="w-full px-4 py-3.5 rounded-xl bg-[#191D23] border border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus:outline-none focus:ring-2 focus:ring-[#C5BAC4]/50 focus:border-transparent transition-all shadow-inner text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full px-4 py-3.5 rounded-xl bg-[#191D23] border border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus:outline-none focus:ring-2 focus:ring-[#C5BAC4]/50 focus:border-transparent transition-all shadow-inner text-sm"
                />
              </div>

              {error && (
                <p className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl animate-in fade-in">
                  {error}
                </p>
              )}

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full bg-[#C5BAC4] hover:bg-white text-[#191D23] py-6 rounded-xl font-bold transition-all shadow-lg shadow-[#C5BAC4]/10 text-base"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-5 w-5 mr-2" />
                  )}
                  {loading ? "Logging in..." : "Login"}
                </Button>
              </div>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#57707A]/30"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-[#2A2F38] text-[10px] font-bold text-[#57707A] uppercase tracking-widest">
                  Or continue with
                </span>
              </div>
            </div>

            <form
              method="post"
              action="/api/auth/google"
              onSubmit={handleGoogleSubmit}
            >
              <Button
                type="submit"
                variant="outline"
                disabled={googleLoading}
                className="w-full py-6 rounded-xl font-bold flex items-center justify-center gap-3 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] hover:bg-[#57707A]/20 hover:text-white transition-all text-sm"
              >
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032 c0-3.331,2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.461,2.268,15.365,1,12.545,1 C6.477,1,1.54,5.952,1.54,12s4.938,11,11.005,11c6.495,0,10.933-4.565,10.933-11c0-0.811-0.081-1.584-0.231-2.39H12.545z"
                  />
                </svg>
                {googleLoading ? "Continuing..." : "Continue with Google"}
              </Button>
            </form>

            <div className="text-center pt-6 mt-6 border-t border-[#57707A]/20">
              <p className="text-sm text-[#989DAA]">
                Need a full onboarding flow?{" "}
                <Link
                  href="/get-started"
                  className="text-[#C5BAC4] font-bold hover:text-white transition-colors"
                >
                  Get started for free
                </Link>
              </p>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs font-medium text-[#57707A] animate-in fade-in delay-300">
          By signing in you agree to Blink&apos;s Terms of Service
        </p>
      </div>
    </div>
  );
}