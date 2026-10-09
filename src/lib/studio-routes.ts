/**
 * BlinkSpot v2 ("studio") information architecture. The classic UI lives at /dashboard and stays
 * exactly as it was; the new UI lives at /studio. Every classic page has one home in the new UI.
 *
 * When the `ui` cookie is "studio", the middleware sends classic /dashboard links (old bookmarks,
 * router.push calls inside reused pages, the post-login redirect) to their new home, so the two
 * designs never mix. "Classic look" in the account menu sets the cookie back to "classic".
 */

export const UI_COOKIE = "ui";
export type UiLook = "studio" | "classic";

// Longest prefix first: the first match wins.
const DASHBOARD_TO_STUDIO: Array<[string, string]> = [
  ["/dashboard/content", "/studio/library"],
  ["/dashboard/upload", "/studio/library/upload"],
  ["/dashboard/generate", "/studio/image"],
  ["/dashboard/video", "/studio/video"],
  ["/dashboard/calendar", "/studio/plan"],
  ["/dashboard/approvals", "/studio/plan/approvals"],
  ["/dashboard/analytics", "/studio/plan/analytics"],
  ["/dashboard/brand", "/studio/brand"],
  ["/dashboard/billing", "/studio/account/billing"],
  ["/dashboard/settings", "/studio/account/settings"],
  ["/dashboard", "/studio"],
];

/** The /studio path for a classic /dashboard path, or null when the path is not a dashboard page. */
export function studioPathFor(dashboardPath: string): string | null {
  for (const [from, to] of DASHBOARD_TO_STUDIO) {
    if (dashboardPath === from || dashboardPath.startsWith(from + "/")) {
      return to + dashboardPath.slice(from.length);
    }
  }
  return null;
}

/** The classic /dashboard path for a /studio path (used by "Classic look" so you land on the same page). */
export function dashboardPathFor(studioPath: string): string {
  // Reverse lookup, longest studio prefix first so /studio/library/upload beats /studio/library.
  const reversed = [...DASHBOARD_TO_STUDIO].sort((a, b) => b[1].length - a[1].length);
  for (const [from, to] of reversed) {
    if (studioPath === to || studioPath.startsWith(to + "/")) {
      return from + studioPath.slice(to.length);
    }
  }
  return "/dashboard";
}

export type StudioSection = "create" | "library" | "plan" | "brand" | "account";

/** Which of the four places (plus the account menu) a /studio path belongs to. */
export function studioSectionFor(pathname: string): StudioSection {
  if (pathname.startsWith("/studio/library")) return "library";
  if (pathname.startsWith("/studio/plan")) return "plan";
  if (pathname.startsWith("/studio/brand")) return "brand";
  if (pathname.startsWith("/studio/account")) return "account";
  return "create"; // /studio, /studio/video, /studio/image
}

/** The page title shown in the top bar. */
export function studioTitleFor(pathname: string): string {
  const titles: Array<[string, string]> = [
    ["/studio/library/upload", "Upload"],
    ["/studio/library", "Library"],
    ["/studio/video", "Video Studio"],
    ["/studio/image", "Image Studio"],
    ["/studio/plan/approvals", "Plan"],
    ["/studio/plan/analytics", "Plan"],
    ["/studio/plan", "Plan"],
    ["/studio/brand", "Brand"],
    ["/studio/account/billing", "Billing"],
    ["/studio/account/settings", "Settings"],
  ];
  return titles.find(([p]) => pathname === p || pathname.startsWith(p + "/"))?.[1] ?? "Create";
}
