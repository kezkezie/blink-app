/** Shared brands: helpers used by the sharing API and the Share panel (no server imports). */

export type ShareRole = "editor" | "viewer";

/** People a brand can be shared with (open invites count) come from the owner's plan: SHARE_SEATS in lib/plans. */

export const ROLE_INFO: Record<ShareRole, { label: string; line: string }> = {
  editor: { label: "Editor", line: "Makes, edits and schedules posts for this brand, using your credits." },
  viewer: { label: "Viewer", line: "Sees the brand, its posts and the calendar. Can't make or change anything." },
};

export function isShareRole(v: unknown): v is ShareRole {
  return v === "editor" || v === "viewer";
}

/** Lower-case and trimmed; "" when it isn't an email. */
export function normaliseEmail(v: string) {
  const e = v.trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(e) ? e : "";
}

/** "brian@gmail.com" → "b•••n@gmail.com", so a link shows who it's for without giving it away. */
export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return "that email";
  const shown = name.length <= 2 ? `${name[0]}•••` : `${name[0]}•••${name[name.length - 1]}`;
  return `${shown}@${domain}`;
}

/** A WhatsApp message carrying the invite link. */
export function whatsappShareUrl(link: string, brandName: string, role: ShareRole) {
  const text = `Join me on BlinkSpot to work on ${brandName}${role === "viewer" ? " (view only)" : ""}: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Studio pages a viewer can open. Everything else makes or changes things. */
export function viewerCanOpen(pathname: string) {
  if (pathname.startsWith("/studio/library/upload") || pathname.startsWith("/studio/plan/approvals")) return false;
  return pathname === "/studio"
    || pathname.startsWith("/studio/library")
    || pathname.startsWith("/studio/plan")
    || pathname.startsWith("/studio/brand")
    || pathname.startsWith("/studio/account");
}
