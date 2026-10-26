"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SETTINGS_EVENT, mustAsk, readConsent, saveConsent } from "@/lib/consent";

/**
 * The cookie choice (lib/consent.ts). Shown to visitors who must be asked until they choose, and to
 * anyone who opens "Cookie settings". Accept and Reject are equal; nothing optional runs before a yes.
 */
export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    // After the first paint, so the page never waits on it.
    const t = setTimeout(() => { if (mustAsk() && !readConsent()) setOpen(true); }, 300);
    const settings = () => { setAnalytics(readConsent()?.analytics ?? false); setDetails(true); setOpen(true); };
    window.addEventListener(SETTINGS_EVENT, settings);
    return () => { clearTimeout(t); window.removeEventListener(SETTINGS_EVENT, settings); };
  }, []);

  if (!open) return null;
  const choose = (yes: boolean) => { saveConsent(yes); setOpen(false); setDetails(false); };
  const btn = { height: 38, padding: "0 16px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: "pointer" } as const;
  return (
    <div role="dialog" aria-label="Cookie choices" aria-live="polite"
      style={{ position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 2147483000, maxWidth: 560, margin: "0 auto", background: "#121417", color: "#F2F3F5", border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, boxShadow: "0 18px 50px rgba(0,0,0,.45)", padding: 18, fontFamily: "inherit" }}>
      <b style={{ fontSize: 15 }}>Cookies on BlinkSpot</b>
      <p style={{ fontSize: 13, lineHeight: 1.5, color: "#B8BCC4", margin: "6px 0 12px" }}>
        We use essential cookies to keep you signed in and secure. With your OK we also use analytics (PostHog) to see which features help and fix what doesn&apos;t. No ads, and we never sell your data. <Link href="/cookies" style={{ color: "#F2F3F5", textDecoration: "underline" }}>Cookie policy</Link>
      </p>
      {details && (
        <div style={{ display: "grid", gap: 10, margin: "0 0 14px", padding: 12, borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
            <input type="checkbox" checked disabled aria-label="Essential cookies (always on)" style={{ marginTop: 3 }} />
            <span><b>Essential</b> · always on<br /><span style={{ color: "#9AA0A9" }}>Signing in, security, and remembering this choice.</span></span>
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} aria-label="Analytics cookies" style={{ marginTop: 3 }} />
            <span><b>Analytics</b><br /><span style={{ color: "#9AA0A9" }}>PostHog: which pages and features are used, and session replays with every typed field hidden.</span></span>
          </label>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {details ? (
          <button type="button" style={{ ...btn, background: "#C6F432", color: "#0C0D0F", border: "none" }} onClick={() => choose(analytics)}>Save my choices</button>
        ) : (
          <>
            <button type="button" style={{ ...btn, background: "#C6F432", color: "#0C0D0F", border: "none" }} onClick={() => choose(true)}>Accept all</button>
            <button type="button" style={{ ...btn, background: "transparent", color: "#F2F3F5", border: "1px solid rgba(255,255,255,.22)" }} onClick={() => choose(false)}>Reject non-essential</button>
            <button type="button" style={{ ...btn, background: "transparent", color: "#B8BCC4", border: "none", textDecoration: "underline" }} onClick={() => { setAnalytics(false); setDetails(true); }}>Settings</button>
          </>
        )}
      </div>
    </div>
  );
}
