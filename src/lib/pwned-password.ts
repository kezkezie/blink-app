/**
 * Leaked-password check (2026-10-11). Supabase's own "prevent leaked passwords" switch needs their Pro
 * plan, so sign-up checks HaveIBeenPwned's Pwned Passwords range API itself, the same way: the
 * password is SHA-1 hashed in the browser and only the first 5 hex characters are sent
 * (k-anonymity); the reply lists suffixes and we compare locally. If the service is down, sign-up
 * goes ahead (it protects users from their own reused passwords; it is not a gate against attackers).
 */
export async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** How many times this password appears in known breaches (0 = not found, null = couldn't check). */
export async function pwnedCount(password: string, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  try {
    const hash = await sha1Hex(password);
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const suffix = hash.slice(5);
    for (const line of (await res.text()).split("\n")) {
      const [s, n] = line.trim().split(":");
      if (s === suffix) return Number(n) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}

export const LEAKED_PASSWORD_MESSAGE = "That password has appeared in a data breach, so it's easy to guess. Pick another one (a short phrase works well).";
