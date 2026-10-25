"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Sign in or sign up with Google (Kezie, 2026-10-25: "some people would love to sign up with
 * Google, instead of having to go through the whole sign up"). Google is on in Supabase; the
 * callback (/auth/callback) records the agreement, fills the account's name and email, and sends a
 * brand-new account to brand set-up.
 */
export function GoogleButton({ next, disabled, onError }: { next: string; disabled?: boolean; onError?: (message: string) => void }) {
  const [going, setGoing] = useState(false);
  async function go() {
    setGoing(true);
    const back = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}&agreed=1`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back } });
    if (error) { setGoing(false); onError?.("Couldn't open Google sign-in. Try again, or use your email."); }
  }
  return (
    <button type="button" onClick={() => void go()} disabled={disabled || going} className="s-btn justify-center w-full" style={{ height: 46, fontSize: 15, background: "#fff", color: "#1f1f1f", border: "1px solid #dadce0" }}>
      {going ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
      )}
      Continue with Google
    </button>
  );
}

/** "or" between the Google button and the email form. */
export function OrLine() {
  return (
    <div className="flex items-center gap-3 text-[12px]" style={{ color: "var(--s-mute)" }}>
      <span className="h-px flex-1" style={{ background: "var(--s-line)" }} />or<span className="h-px flex-1" style={{ background: "var(--s-line)" }} />
    </div>
  );
}
