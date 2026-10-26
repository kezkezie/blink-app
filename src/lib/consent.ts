/**
 * Cookie consent (Kezie, 2026-10-26: "when Europeans log in they need to have all this consent").
 * Visitors from the EU, the EEA, the UK and Switzerland (GDPR / ePrivacy / UK GDPR / revFADP) are
 * asked before anything that isn't essential: until they say yes, analytics (PostHog) doesn't run
 * and stores nothing. Essential cookies (sign-in, security, the choice itself) need no consent.
 * The middleware marks the region from Vercel's country header; the choice is a first-party cookie
 * kept 12 months. "Cookie settings" (footer, legal pages) opens the choice again.
 */
export const REGION_COOKIE = "blink_region";
export const CONSENT_COOKIE = "blink_consent";
export const CONSENT_VERSION = 1;
export const CONSENT_EVENT = "blink:consent";
export const SETTINGS_EVENT = "blink:cookie-settings";

/** EU 27, EEA (Iceland, Liechtenstein, Norway), the UK and Switzerland. */
export const CONSENT_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "GB", "CH",
]);

export const needsConsentFor = (country: string | null | undefined) => !!country && CONSENT_COUNTRIES.has(country.toUpperCase());

export type Consent = { analytics: boolean; v: number; at: number };

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

/** The visitor's choice, or null if they haven't made one (or it was made under an older version). */
export function readConsent(): Consent | null {
  try {
    const c = JSON.parse(readCookie(CONSENT_COOKIE) ?? "null") as Consent | null;
    return c && c.v === CONSENT_VERSION && typeof c.analytics === "boolean" ? c : null;
  } catch { return null; }
}

/** Whether this visitor must be asked (their region needs it). Unknown region: asked, to be safe. */
export const mustAsk = () => { const r = readCookie(REGION_COOKIE); return r !== "other"; };

/** Analytics may run: they said yes, or their region doesn't need asking and they didn't say no. */
export function analyticsAllowed() {
  const c = readConsent();
  return c ? c.analytics : !mustAsk();
}

export function saveConsent(analytics: boolean) {
  const value: Consent = { analytics, v: CONSENT_VERSION, at: Date.now() };
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(value))}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
}

export const openCookieSettings = () => window.dispatchEvent(new Event(SETTINGS_EVENT));
