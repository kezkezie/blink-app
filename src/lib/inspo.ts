/**
 * Inspo Remix: turning a pasted link into an inspiration image. Pure helpers (tested); the route
 * in app/api/inspo/import does the fetching and storing.
 */

/** The pin id in a Pinterest pin URL (any Pinterest country domain), or null. */
export function pinterestPinId(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/(^|\.)pinterest\.[a-z.]+$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/pin\/(?:[^/]*--)?(\d{6,25})\/?/);
    return m ? m[1] : null;
  } catch { return null; }
}

/** pin.it short links redirect to the pin page. */
export function isPinterestShortLink(raw: string): boolean {
  try { return new URL(raw).hostname.toLowerCase() === "pin.it"; } catch { return false; }
}

/** Best image from Pinterest's public widget API response for one pin, largest first. */
export function bestPinImage(payload: unknown): string | null {
  const pin = (payload as { data?: Array<{ images?: Record<string, { url?: string; width?: number }> }> })?.data?.[0];
  const images = pin?.images;
  if (!images) return null;
  const sized = Object.values(images).filter((i) => typeof i?.url === "string").sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const url = sized[0]?.url ?? null;
  if (!url) return null;
  // i.pinimg.com/564x/ab/cd/ef/x.jpg → the same path under /originals/ is the full-size upload.
  return url.replace(/\/\d+x\//, "/originals/");
}

export const INSPO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * The instruction that makes the remix keep the reference's design while making it the brand's own.
 * The brand constraint and colours are added by the workflow payload as usual.
 */
export function remixPrompt(brandName: string, purpose: string) {
  const forWhat = purpose.trim() ? ` It is for: ${purpose.trim()}.` : "";
  return [
    `Image 1 is a design the brand loves. Create a NEW, original design for ${brandName} that keeps image 1's look:`,
    "the same layout and composition, the same colour mood and lighting, the same typography style and placement, the same energy.",
    `Replace every product, logo, name and line of text with ${brandName}'s own; never copy the original brand, its logo or its words.${forWhat}`,
    "Make it ready to post on social media.",
  ].join(" ");
}
