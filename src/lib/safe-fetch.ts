import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Server-side fetch of a USER-SUPPLIED URL without server-side request forgery.
 *
 * Why: /api/brand/autofill fetched whatever `website_url` a user typed, from the
 * server, following redirects and reading the whole body. A user could aim it at
 * internal addresses (cloud metadata at 169.254.169.254, localhost, private ranges)
 * and the route then summarised the response back to them.
 *
 * Rules, all enforced here:
 *  - http/https only, standard ports only, no credentials in the URL
 *  - the hostname is resolved and EVERY resolved address must be public
 *  - redirects are followed manually and every hop is re-validated
 *  - the body is capped
 *
 * Residual risk (documented, not hidden): DNS can change between our lookup and
 * the connection (rebinding). Pinning the resolved IP needs a custom undici
 * dispatcher; rejecting any private address in the lookup narrows the window.
 */

export type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;
const defaultResolver: Resolver = (host) => lookup(host, { all: true, verbatim: true });

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}
function inV4(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split("/");
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}
const PRIVATE_V4 = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
  "172.16.0.0/12", "192.0.0.0/24", "192.168.0.0/16", "198.18.0.0/15", "224.0.0.0/4", "240.0.0.0/4",
];

export function isPublicAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return !PRIVATE_V4.some((c) => inV4(address, c));
  if (kind === 6) {
    const a = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return isPublicAddress(mapped[1]);
    if (a === "::" || a === "::1") return false;
    if (/^f[cd]/.test(a)) return false; // fc00::/7 unique local
    if (/^fe[89ab]/.test(a)) return false; // fe80::/10 link local
    if (/^ff/.test(a)) return false; // multicast
    return true;
  }
  return false;
}

export async function validatePublicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "scheme not allowed" };
  if (url.username || url.password) return { ok: false, reason: "credentials in URL" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "port not allowed" };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await resolve(host)).map((r) => r.address);
    } catch {
      return { ok: false, reason: "host does not resolve" };
    }
  }
  if (!addresses.length || !addresses.every(isPublicAddress)) return { ok: false, reason: "address not public" };
  return { ok: true, url };
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const buf = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    const slice = c.subarray(0, Math.min(c.byteLength, buf.length - offset));
    buf.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= buf.length) break;
  }
  return new TextDecoder().decode(buf);
}

export async function safeFetchText(
  raw: string,
  opts: { resolve?: Resolver; fetchImpl?: typeof fetch; maxBytes?: number; maxRedirects?: number; timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const { resolve = defaultResolver, fetchImpl = fetch, maxBytes = 1_000_000, maxRedirects = 3, timeoutMs = 8000, headers } = opts;
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const check = await validatePublicUrl(current, resolve);
    if (!check.ok) return check;
    let res: Response;
    try {
      res = await fetchImpl(check.url.toString(), { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers });
    } catch {
      return { ok: false, reason: "fetch failed" };
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, reason: "redirect without location" };
      current = new URL(location, check.url).toString();
      continue;
    }
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    return { ok: true, text: await readCapped(res, maxBytes) };
  }
  return { ok: false, reason: "too many redirects" };
}
