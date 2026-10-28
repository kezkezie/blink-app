/**
 * Delete my account (Kezie, 2026-10-28: "one of the most important things we need to have").
 * The pure parts: what the confirmation must match, and which Cloudinary file a stored link is (so
 * the copies n8n put on Cloudinary can be removed too). The work is in account-delete-server.ts.
 */

/** The person types their sign-in email to confirm (case and spaces don't matter). */
export const confirmsDeletion = (typed: unknown, email: string | null | undefined) =>
  typeof typed === "string" && !!email && typed.trim().toLowerCase() === email.trim().toLowerCase();

export type CloudinaryFile = { cloud: string; type: "image" | "video" | "raw"; id: string };

/**
 * The Cloudinary file behind a delivery link: res.cloudinary.com/<cloud>/<type>/upload/[transformations/][v123/]<public id>.<ext>.
 * The public id is everything after the version, or after the transformation steps (c_limit,w_640/…).
 */
export function cloudinaryFile(url: unknown): CloudinaryFile | null {
  if (typeof url !== "string") return null;
  const m = /^https:\/\/res\.cloudinary\.com\/([a-z0-9_-]+)\/(image|video|raw)\/upload\/(.+)$/i.exec(url.split(/[?#]/)[0]);
  if (!m) return null;
  const parts = m[3].split("/").filter(Boolean);
  const v = parts.findIndex((p) => /^v\d+$/.test(p));
  let rest: string[];
  if (v >= 0) rest = parts.slice(v + 1);
  else {
    let i = 0;
    while (i < parts.length - 1 && /^([a-z]{1,4}_[^,/]+)(,[a-z]{1,4}_[^,/]+)*$/.test(parts[i])) i++;
    rest = parts.slice(i);
  }
  const id = decodeURIComponent(rest.join("/")).replace(/\.[a-z0-9]{2,5}$/i, "");
  return id ? { cloud: m[1], type: m[2].toLowerCase() as CloudinaryFile["type"], id } : null;
}

/** Every Cloudinary file in a set of stored links (arrays, JSON strings or single links), once each. */
export function cloudinaryFiles(values: unknown[]): CloudinaryFile[] {
  const out = new Map<string, CloudinaryFile>();
  const add = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(add);
    if (typeof v === "string" && v.startsWith("[")) { try { return add(JSON.parse(v)); } catch { /* a plain link */ } }
    const f = cloudinaryFile(v);
    if (f) out.set(`${f.cloud}/${f.type}/${f.id}`, f);
  };
  values.forEach(add);
  return [...out.values()];
}
