import { planOf } from "@/lib/plans";

/**
 * The BlinkSpot stamp on free accounts' work (Kezie, 2026-10-25: "everything that they make on the
 * platform should have a stamp of BlinkSpot, for promotional purposes"). A small "Made with
 * BlinkSpot" pill in the bottom-right corner (public/brand/stamp.png), burned into pictures and
 * videos when they're saved, drawn into motion and editor exports, and a badge on published sites.
 * Any paid plan makes new work without it. The workspace's plan decides (a shared brand's owner).
 * Pure parts here; lib/stamp-server.ts does the pictures and videos.
 */
export const STAMP_LINE = "Made with BlinkSpot";
export const STAMP_LINK = "https://www.blinkspot.io/?ref=stamp";
export const STAMP_STATUS = "Adding the BlinkSpot stamp";

export const needsStamp = (planTier: unknown) => planOf(planTier) === "free";

/** Our stamped copies are saved as stamped_<...>; a URL that is one is never stamped again. */
export const isStampedUrl = (url: string) => /\/stamped_[^/?#]+(\?.*)?$/.test(url);

/** Where the stamp sits on a w×h frame: bottom-right, about a quarter of the width, 3% in. */
export function stampBox(w: number, h: number, stampW = 1020, stampH = 192) {
  const width = Math.max(2, Math.round(Math.min(w * 0.5, Math.max(Math.min(220, w * 0.5), Math.min(w, h * 1.25) * 0.26))));
  const height = Math.max(1, Math.round((width * stampH) / stampW));
  const margin = Math.round(Math.min(w, h) * 0.03);
  return { width, height, left: Math.max(0, w - width - margin), top: Math.max(0, h - height - margin) };
}

/** A job's stamp step, kept in its creation_metadata: asked for, done, or given up (fail-open). */
export type StampState = "running" | "done" | "failed";
export function stampPending(meta: unknown, urls: string[]): boolean {
  const m = (meta && typeof meta === "object" ? meta : {}) as { stamp?: unknown; stamp_state?: unknown };
  return m.stamp === true && m.stamp_state !== "done" && m.stamp_state !== "failed" && urls.length > 0 && urls.some((u) => !isStampedUrl(u));
}

/** The badge on a free account's published website: bottom-right, links back to BlinkSpot. */
export const SITE_BADGE = `<a href="https://www.blinkspot.io/?ref=site" target="_blank" rel="noopener" data-blink-badge style="position:fixed;right:14px;bottom:14px;z-index:2147483647;display:inline-flex;align-items:center;gap:7px;padding:7px 13px 7px 9px;border-radius:999px;background:rgba(12,13,15,.86);color:#fff;font:600 12.5px/1 system-ui,-apple-system,'Segoe UI',sans-serif;text-decoration:none;border:1px solid rgba(255,255,255,.18);box-shadow:0 4px 14px rgba(0,0,0,.25)"><img src="https://www.blinkspot.io/brand/mark-lime.png" alt="" width="16" height="16" style="height:16px;width:16px;object-fit:contain">Made with BlinkSpot</a>`;
export function withSiteBadge(html: string) {
  if (html.includes("data-blink-badge")) return html;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${SITE_BADGE}</body>`) : `${html}${SITE_BADGE}`;
}
