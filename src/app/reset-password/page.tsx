"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AuthField, AuthShell } from "@/components/auth/AuthShell";

/** Set a new password, after the reset link signed the person in (/auth/callback). */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setReady(!!data.user)); }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== again) { setError("The two passwords don't match."); return; }
    setSaving(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { setError(/pwned|leaked|breach|weak/i.test(error.message) ? "That password has appeared in a data breach. Pick another one." : error.message); return; }
    router.replace("/studio");
  }
  return (
    <AuthShell title="Set a new password" subtitle="Then you're straight back in." footer={<Link href="/login" className="underline" style={{ color: "var(--s-text)" }}>Back to sign in</Link>}>
      {ready === null ? <Loader2 className="h-5 w-5 animate-spin" /> : !ready ? (
        <div className="grid gap-3 text-[14px]">
          <p>This link has expired or was already used.</p>
          <Link href="/forgot-password" className="s-btn primary justify-center" style={{ height: 46 }}>Send a new link</Link>
        </div>
      ) : (
        <form onSubmit={save} className="grid gap-4">
          <AuthField label="New password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
          <AuthField label="New password again" type="password" required value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
          {error && <p role="alert" className="text-[13px] rounded-lg px-3 py-2" style={{ background: "color-mix(in oklab, var(--s-danger) 12%, transparent)", color: "var(--s-danger)" }}>{error}</p>}
          <button type="submit" className="s-btn primary justify-center mt-2" style={{ height: 46, fontSize: 15 }} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save and sign in <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      )}
    </AuthShell>
  );
}
