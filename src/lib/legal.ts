/**
 * Agreeing to BlinkSpot's terms at sign-up (Kezie, 2026-10-25: "a checkbox ... to just agree to our
 * agreements and everything, before they sign up"). The versions are the "Last updated" dates on the
 * pages; when one changes, change it here too, so each account records which text it agreed to.
 */
export const LEGAL_DOCS = [
  { id: "terms", label: "Terms of Service", href: "/terms", version: "2026-04-13" },
  { id: "privacy", label: "Privacy Policy", href: "/privacy", version: "2026-04-13" },
  { id: "acceptable-use", label: "Acceptable Use Policy", href: "/acceptable-use", version: "2026-04-14" },
] as const;

export const LEGAL_VERSION = LEGAL_DOCS.map((d) => `${d.id}@${d.version}`).join(",");

/** What goes in the new account's metadata: when, and which versions. */
export function consentRecord(at = new Date()) {
  return { terms_accepted_at: at.toISOString(), terms_version: LEGAL_VERSION };
}

/** A sign-up request that carries the agreement (the old /api/auth/signup route checks this). */
export const agreedToTerms = (v: unknown) => v === true;
