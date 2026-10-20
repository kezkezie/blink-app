import { createHash, randomBytes } from "node:crypto";

/**
 * BlinkSpot keys for "Connect your AI" (2026-10-20). A key is `bsk_` + 32 random bytes (base64url),
 * shown once; only its SHA-256 is stored. Pure helpers here; the database work is in the routes.
 */
export const KEY_PREFIX = "bsk_";
export const DEFAULT_KEY_BUDGET = 200;
export const MAX_KEYS_PER_WORKSPACE = 10;

export function newKey(): { token: string; hash: string; prefix: string } {
  const token = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashKey(token), prefix: token.slice(0, 10) };
}

export const hashKey = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

/** The key from an `Authorization: Bearer bsk_...` header, or null. */
export function bearerKey(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(bsk_[A-Za-z0-9_-]{30,80})\s*$/);
  return m ? m[1] : null;
}

export type KeyScope = { keyId: string; clientId: string; brandIds: string[] | null; permissions: string[]; budget: number };

/** May this key use this brand? null brand_ids = every brand of the workspace. */
export const brandAllowed = (scope: KeyScope, brandId: string) => !scope.brandIds || scope.brandIds.includes(brandId);
