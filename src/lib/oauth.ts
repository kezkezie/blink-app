import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { safeFetchBytes } from "@/lib/safe-fetch";

/**
 * Sign in with BlinkSpot from Claude (Kezie, 2026-10-26: "people that are already subscribed on
 * Claude could just come over to the platform and connect their Claude to it"). Claude (claude.ai,
 * Desktop, mobile, Claude Code) adds BlinkSpot as a connector by URL and signs in with OAuth 2.1:
 * discovery (RFC 9728 / 8414), a client from Dynamic Client Registration (RFC 7591) or a Client ID
 * Metadata Document, S256 PKCE, and a code exchanged for a token. The token is an ordinary AI
 * connection key (lib/mcp/keys.ts), so its brands, permissions, budget, activity and Revoke all work
 * as they do in Settings > AI connections. Nothing new is stored: registrations and codes are signed.
 * Requirements: claude.com/docs/connectors/building/authentication.
 */
export const MCP_PATH = "/api/mcp";
export const CODE_TTL_MS = 5 * 60_000;
export const SCOPE = "blinkspot";

const signingKey = () => createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update("blinkspot-oauth-v1").digest();
const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export function sign(payload: Record<string, unknown>): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(createHmac("sha256", signingKey()).update(body).digest())}`;
}

export function verify<T extends Record<string, unknown>>(token: string): T | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", signingKey()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T; } catch { return null; }
}

/** The site as Claude reaches it (the protected resource is its /api/mcp, exactly as users enter it). */
export function originOf(request: Request) {
  const u = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? u.host;
  const proto = request.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function resourceMetadata(origin: string) {
  return { resource: `${origin}${MCP_PATH}`, authorization_servers: [origin], scopes_supported: [SCOPE], bearer_methods_supported: ["header"], resource_name: "BlinkSpot" };
}

export function serverMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    scopes_supported: [SCOPE],
  };
}

/** The 401 that starts sign-in: Claude reads where to find the metadata from it. */
export const challenge = (origin: string) => `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${SCOPE}"`;

// ── Clients ─────────────────────────────────────────────────────────────────────────────────────
export type OAuthClient = { id: string; name: string; redirectUris: string[] };
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i;

/** Callbacks a client may register: https anywhere (the consent screen names the host), or loopback for native apps. */
export const redirectUriAllowed = (uri: string) => {
  try { const u = new URL(uri); return (u.protocol === "https:" && !u.hash) || LOOPBACK.test(uri); } catch { return false; }
};

/** Exact, except a loopback callback matches on any port (Claude Code picks one per session). */
export function redirectMatches(client: OAuthClient, uri: string) {
  if (client.redirectUris.includes(uri)) return true;
  const strip = (x: string) => x.replace(/^(http:\/\/(?:localhost|127\.0\.0\.1))(:\d+)?/i, "$1");
  return LOOPBACK.test(uri) && client.redirectUris.some((r) => LOOPBACK.test(r) && strip(r) === strip(uri));
}

export function registerClient(name: string, redirectUris: string[]): OAuthClient {
  const id = `bsc_${sign({ k: "client", n: name, r: redirectUris, t: Date.now() })}`;
  return { id, name, redirectUris };
}

/** A registered client (its id is signed), or a Client ID Metadata Document at an https URL. */
export async function resolveClient(clientId: string): Promise<OAuthClient | null> {
  if (clientId.startsWith("bsc_")) {
    const c = verify<{ k: string; n: string; r: string[] }>(clientId.slice(4));
    return c?.k === "client" && Array.isArray(c.r) ? { id: clientId, name: String(c.n || "An AI app").slice(0, 60), redirectUris: c.r.filter((x) => typeof x === "string") } : null;
  }
  if (!/^https:\/\//.test(clientId)) return null;
  const got = await safeFetchBytes(clientId, { maxBytes: 20_000, timeoutMs: 5000 }).catch(() => null);
  if (!got?.ok) return null;
  try {
    const doc = JSON.parse(Buffer.from(got.bytes).toString("utf8")) as { client_id?: unknown; client_name?: unknown; redirect_uris?: unknown };
    if (doc.client_id !== clientId || !Array.isArray(doc.redirect_uris)) return null;
    return { id: clientId, name: typeof doc.client_name === "string" ? doc.client_name.slice(0, 60) : new URL(clientId).hostname, redirectUris: doc.redirect_uris.filter((x): x is string => typeof x === "string" && redirectUriAllowed(x)) };
  } catch { return null; }
}

// ── Codes ───────────────────────────────────────────────────────────────────────────────────────
export type CodeClaims = { k: "code"; j: string; u: string; c: string; r: string; ch: string; p: string[]; b: string[] | null; bud: number; n: string; e: number };

export const issueCode = (claims: Omit<CodeClaims, "k" | "j" | "e">) => sign({ ...claims, k: "code", j: randomUUID(), e: Date.now() + CODE_TTL_MS });

export function readCode(code: string): CodeClaims | null {
  const c = verify<CodeClaims>(code);
  return c?.k === "code" && typeof c.e === "number" && c.e > Date.now() ? c : null;
}

/** S256: the verifier's SHA-256, base64url, is the challenge sent at the start. */
export const pkceOk = (verifier: string, challengeValue: string) =>
  /^[A-Za-z0-9._~-]{43,128}$/.test(verifier) && b64(createHash("sha256").update(verifier).digest()) === challengeValue;
