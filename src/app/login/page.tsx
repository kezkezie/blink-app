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
    <div className="min-h-screen flex items-center justify-center bg-blink-light px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Zap className="h-8 w-8 text-blink-secondary" />
          <span className="text-3xl font-bold text-blink-dark font-heading tracking-tight">
            Blink
          </span>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-blink-dark font-heading">
                Login to your account
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Use email and password or continue with Google
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
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
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blink-primary/30 focus:border-blink-primary transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Put in your password"
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blink-primary/30 focus:border-blink-primary transition-colors"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <div className="space-y-2">
                <Button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full bg-blink-primary hover:bg-blink-primary/90 text-white py-2.5 rounded-lg font-medium transition-colors"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  {loading ? "lgging in..." : "login"}
                </Button>
                {/* <Button
                  type="button"
                  variant="outline"
                  disabled={loading || !email || !password}
                  className="w-full py-2.5 rounded-lg font-medium"
                  onClick={handleSignup}
                >
                  {loading ? "Creating account..." : "Create account"}
                </Button> */}
              </div>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
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
                className="w-full py-2.5 rounded-lg font-medium flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032 c0-3.331,2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.461,2.268,15.365,1,12.545,1 C6.477,1,1.54,5.952,1.54,12s4.938,11,11.005,11c6.495,0,10.933-4.565,10.933-11c0-0.811-0.081-1.584-0.231-2.39H12.545z"
                  />
                </svg>
                {googleLoading ? "Continuing..." : "Continue with Google"}
              </Button>
            </form>

            <div className="text-center pt-2 border-t border-gray-100">
              <p className="text-sm text-gray-500 pt-4">
                Need a full onboarding flow?{" "}
                <Link
                  href="/get-started"
                  className="text-blink-primary font-medium hover:underline"
                >
                  Get started for free
                </Link>
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          By signing in you agree to Blink&apos;s Terms of Service
        </p>
      </div>
    </div>
  );
}
