"use client";

import { openCookieSettings } from "@/lib/consent";

/** "Cookie settings": opens the cookie choice again, for anyone (lib/consent.ts). */
export function CookieSettingsLink({ className }: { className?: string }) {
  return <button type="button" className={className} onClick={openCookieSettings} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" }}>Cookie settings</button>;
}
