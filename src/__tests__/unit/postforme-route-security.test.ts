import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authorizeSocialScope, authorizeSocialAccount, isProviderId, from } = vi.hoisted(() => ({
  authorizeSocialScope: vi.fn(),
  authorizeSocialAccount: vi.fn(),
  isProviderId: vi.fn((value: unknown) => typeof value === "string" && value.length > 0),
  from: vi.fn(),
}));

vi.mock("@/lib/postforme-route-auth", () => ({
  authorizeSocialScope,
  authorizeSocialAccount,
  isProviderId,
  hasOnlyKeys: (value: unknown, allowedKeys: string[]) =>
    !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every((key) => allowedKeys.includes(key)),
}));

vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: { from },
}));

import { POST as createAuthUrl } from "@/app/api/social-accounts/auth-url/route";
import { GET as listAccounts } from "@/app/api/social-accounts/list/route";
import { POST as syncAccounts } from "@/app/api/social-accounts/sync/route";
import { POST as disconnectAccount } from "@/app/api/social-accounts/disconnect/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const BRAND_ID = "33333333-3333-4333-8333-333333333333";
const SOCIAL_ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";

function jsonRequest(path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function scopeAuthorized() {
  authorizeSocialScope.mockResolvedValue({
    ok: true,
    scope: { userId: "user-1", clientId: CLIENT_ID, brandId: BRAND_ID },
  });
}

function scopeDenied(status: 401 | 404 = 404) {
  authorizeSocialScope.mockResolvedValue({
    ok: false,
    status,
    error: status === 401 ? "Unauthorized" : "Resource not found",
  });
}

function accountAuthorized() {
  authorizeSocialAccount.mockResolvedValue({
    ok: true,
    scope: {
      userId: "user-1",
      clientId: CLIENT_ID,
      brandId: BRAND_ID,
      socialAccountId: SOCIAL_ACCOUNT_ID,
      postformeAccountId: "pfm-owned",
    },
  });
}

function queryResult<T>(result: T) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.insert = vi.fn(() => Promise.resolve({ error: null }));
  chain.eq = vi.fn(() => chain);
  chain.then = (resolve: (value: T) => unknown) => Promise.resolve(resolve(result));
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("POSTFORME_API_KEY", "test-placeholder");
  vi.stubGlobal("fetch", vi.fn());
});

describe("PostForMe route authentication", () => {
  it.each([
    ["auth-url", () => createAuthUrl(jsonRequest("/api/social-accounts/auth-url", { platform: "instagram", clientId: CLIENT_ID, brandId: BRAND_ID }))],
    ["list", () => listAccounts(new NextRequest(`http://localhost/api/social-accounts/list?clientId=${CLIENT_ID}`))],
    ["sync", () => syncAccounts(jsonRequest("/api/social-accounts/sync", { clientId: CLIENT_ID, brandId: BRAND_ID }))],
  ])("rejects unauthenticated %s requests before provider or admin work", async (_name, callRoute) => {
    scopeDenied(401);

    const response = await callRoute();

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated disconnect before provider or admin work", async () => {
    authorizeSocialAccount.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });

    const response = await disconnectAccount(jsonRequest("/api/social-accounts/disconnect", {
      accountId: "pfm-owned",
      supabaseAccountId: SOCIAL_ACCOUNT_ID,
    }));

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("PostForMe tenant ownership", () => {
  it.each([
    ["auth-url", () => createAuthUrl(jsonRequest("/api/social-accounts/auth-url", { platform: "instagram", clientId: OTHER_CLIENT_ID, brandId: BRAND_ID }))],
    ["list", () => listAccounts(new NextRequest(`http://localhost/api/social-accounts/list?clientId=${OTHER_CLIENT_ID}`))],
    ["sync", () => syncAccounts(jsonRequest("/api/social-accounts/sync", { clientId: OTHER_CLIENT_ID, brandId: BRAND_ID }))],
  ])("hides cross-tenant resources for %s", async (_name, callRoute) => {
    scopeDenied(404);

    const response = await callRoute();

    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("cannot disconnect another tenant's row", async () => {
    authorizeSocialAccount.mockResolvedValue({ ok: false, status: 404, error: "Resource not found" });

    const response = await disconnectAccount(jsonRequest("/api/social-accounts/disconnect", {
      accountId: "pfm-other",
      supabaseAccountId: SOCIAL_ACCOUNT_ID,
    }));

    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("PostForMe authorized behavior", () => {
  it("creates authorization state only with the verified client", async () => {
    scopeAuthorized();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ url: "https://provider.example/auth" }), { status: 200 }));

    const response = await createAuthUrl(jsonRequest("/api/social-accounts/auth-url", {
      platform: "instagram",
      clientId: CLIENT_ID,
      brandId: BRAND_ID,
    }));

    expect(response.status).toBe(200);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({ external_id: CLIENT_ID });
  });

  it("filters provider list results to the verified client", async () => {
    scopeAuthorized();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: "owned", external_id: CLIENT_ID },
        { id: "other", external_id: OTHER_CLIENT_ID },
      ],
    }), { status: 200 }));

    const response = await listAccounts(new NextRequest(`http://localhost/api/social-accounts/list?clientId=${CLIENT_ID}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.accounts).toEqual([{ id: "owned", external_id: CLIENT_ID }]);
  });

  it("syncs only inside the verified client and brand scope", async () => {
    scopeAuthorized();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const existingQuery = queryResult({ data: [] });
    from.mockReturnValue(existingQuery);

    const response = await syncAccounts(jsonRequest("/api/social-accounts/sync", {
      clientId: CLIENT_ID,
      brandId: BRAND_ID,
    }));

    expect(response.status).toBe(200);
    expect(existingQuery.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(existingQuery.eq).toHaveBeenCalledWith("brand_id", BRAND_ID);
  });

  it("disconnects and deletes only the verified owned row", async () => {
    accountAuthorized();
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const deleteQuery = queryResult({ error: null });
    from.mockReturnValue(deleteQuery);

    const response = await disconnectAccount(jsonRequest("/api/social-accounts/disconnect", {
      accountId: "pfm-owned",
      supabaseAccountId: SOCIAL_ACCOUNT_ID,
    }));

    expect(response.status).toBe(200);
    expect(deleteQuery.eq).toHaveBeenCalledWith("id", SOCIAL_ACCOUNT_ID);
    expect(deleteQuery.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });
});

describe("PostForMe identifier validation", () => {
  it("rejects missing and malformed scope identifiers through the authorization boundary", async () => {
    authorizeSocialScope.mockResolvedValue({ ok: false, status: 400, error: "Invalid clientId" });

    const missing = await listAccounts(new NextRequest("http://localhost/api/social-accounts/list"));
    const malformed = await syncAccounts(jsonRequest("/api/social-accounts/sync", { clientId: "bad", brandId: "bad" }));

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a caller provider ID that does not match the owned row", async () => {
    accountAuthorized();

    const response = await disconnectAccount(jsonRequest("/api/social-accounts/disconnect", {
      accountId: "pfm-other",
      supabaseAccountId: SOCIAL_ACCOUNT_ID,
    }));

    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
