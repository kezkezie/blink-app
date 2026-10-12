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
/**
 * Contact details on a design must be real. Image models happily invent phone numbers, emails and
 * handles (a Skylux remix came back with "07061122334"), so only the brand's own are allowed.
 */
export function contactRule(website?: string, socials?: string) {
  const known = [website, socials].filter((v) => typeof v === "string" && v.trim()).join(", ").slice(0, 300);
  return [
    "Never invent phone numbers, WhatsApp numbers, emails, street addresses, prices, discounts or dates.",
    known ? `The only contact details allowed are: ${known}.` : "The brand has no contact details on file, so show none.",
    "If a design has a contact bar, use the brand name or those details only, or leave it out.",
  ].join(" ");
}

/**
 * Inspo Remix prompt. 2026-10-12 (Kezie): GPT Image 2 drifted from the inspo's layout, and posters
 * carried invented logos because the brand's logo was never sent. The layout to keep is now spelled
 * out, and when the brand has a logo it rides along as image 2 with "use exactly this logo".
 */
export function remixPrompt(brandName: string, purpose: string, hasLogo = false) {
  const forWhat = purpose.trim() ? ` It is for: ${purpose.trim()}.` : "";
  return [
    `Image 1 is a design the brand loves. Recreate image 1's design for ${brandName}, as if the same designer made it for them.`,
    "Keep image 1's layout exactly: the same grid, the same positions and sizes of every text block, the same photo crop, camera angle and framing, the same colour blocking, background texture, typography style and weight, and the same small details (date lines, barcodes, edition marks) in the same places.",
    `Change only the content: the subject becomes ${brandName}'s own product or scene, and every word becomes ${brandName}'s (short, in the same places and sizes as the original). Never copy the original brand's name, logo or words.`,
    hasLogo
      ? `Image 2 is ${brandName}'s logo. Put exactly this logo where image 1 has its logo or brand mark (or a top or bottom corner), unchanged: same shapes, colours and letters. Draw no other logo, icon or brand mark anywhere.`
      : `Write the brand name "${brandName}" as plain text where image 1 has its logo. Draw no logo, icon or brand mark.`,
    `${forWhat} Make it ready to post on social media.`,
  ].join(" ");
}
