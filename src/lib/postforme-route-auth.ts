import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;

export type SocialScope = {
  userId: string;
  clientId: string;
  brandId?: string;
};

export type SocialAccountScope = SocialScope & {
  socialAccountId: string;
  postformeAccountId: string | null;
};

export type AuthorizationResult<T> =
  | { ok: true; scope: T }
  | { ok: false; status: 401 | 400 | 404 | 500; error: string };

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isProviderId(value: unknown): value is string {
  return typeof value === "string" && PROVIDER_ID_PATTERN.test(value);
}

export function hasOnlyKeys(
  value: unknown,
  allowedKeys: readonly string[]
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function getAuthenticatedClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    }
  );
}

async function resolveAuthenticatedClient(
  request: NextRequest
): Promise<AuthorizationResult<{ userId: string; clientId: string }>> {
  const supabase = getAuthenticatedClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  // This is the first service-role query: it happens only after the session is
  // verified, and derives tenant identity from the authenticated user.
  const { data: client, error } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[PostForMe Auth] Failed to resolve authenticated tenant");
    return { ok: false, status: 500, error: "Internal server error" };
  }

  if (!client) {
    return { ok: false, status: 404, error: "Resource not found" };
  }

  return { ok: true, scope: { userId: user.id, clientId: client.id } };
}

export async function authorizeSocialScope(
  request: NextRequest,
  requestedClientId: unknown,
  requestedBrandId?: unknown
): Promise<AuthorizationResult<SocialScope>> {
  if (!isUuid(requestedClientId)) {
    return { ok: false, status: 400, error: "Invalid clientId" };
  }
  if (requestedBrandId !== undefined && !isUuid(requestedBrandId)) {
    return { ok: false, status: 400, error: "Invalid brandId" };
  }

  const authenticated = await resolveAuthenticatedClient(request);
  if (!authenticated.ok) return authenticated;

  if (authenticated.scope.clientId !== requestedClientId) {
    return { ok: false, status: 404, error: "Resource not found" };
  }

  if (requestedBrandId) {
    const { data: brand, error } = await supabaseAdmin
      .from("brand_profiles")
      .select("id")
      .eq("id", requestedBrandId)
      .eq("client_id", authenticated.scope.clientId)
      .maybeSingle();

    if (error) {
      console.error("[PostForMe Auth] Failed to verify brand scope");
      return { ok: false, status: 500, error: "Internal server error" };
    }
    if (!brand) {
      return { ok: false, status: 404, error: "Resource not found" };
    }
  }

  return {
    ok: true,
    scope: {
      ...authenticated.scope,
      ...(requestedBrandId ? { brandId: requestedBrandId } : {}),
    },
  };
}

export async function authorizeSocialAccount(
  request: NextRequest,
  requestedSocialAccountId: unknown
): Promise<AuthorizationResult<SocialAccountScope>> {
  if (!isUuid(requestedSocialAccountId)) {
    return { ok: false, status: 400, error: "Invalid social account identifier" };
  }

  const authenticated = await resolveAuthenticatedClient(request);
  if (!authenticated.ok) return authenticated;

  const { data: account, error } = await supabaseAdmin
    .from("social_accounts")
    .select("id, client_id, brand_id, postforme_account_id")
    .eq("id", requestedSocialAccountId)
    .eq("client_id", authenticated.scope.clientId)
    .maybeSingle();

  if (error) {
    console.error("[PostForMe Auth] Failed to verify social account scope");
    return { ok: false, status: 500, error: "Internal server error" };
  }
  if (!account) {
    return { ok: false, status: 404, error: "Resource not found" };
  }

  return {
    ok: true,
    scope: {
      ...authenticated.scope,
      brandId: account.brand_id || undefined,
      socialAccountId: account.id,
      postformeAccountId: account.postforme_account_id || null,
    },
  };
}
