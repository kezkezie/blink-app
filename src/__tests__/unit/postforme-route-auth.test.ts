import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getUser, from, createServerClient } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from } }));

import { authorizeSocialAccount, authorizeSocialScope, hasOnlyKeys } from "@/lib/postforme-route-auth";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const BRAND_ID = "33333333-3333-4333-8333-333333333333";
const SOCIAL_ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";

function request() {
  return new NextRequest("http://localhost/api/social-accounts/list");
}

function queryResult<T>(result: T) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  createServerClient.mockReturnValue({ auth: { getUser } });
});

describe("PostForMe authorization boundary", () => {
  it("rejects unexpected caller identity fields", () => {
    expect(hasOnlyKeys({ clientId: CLIENT_ID, userId: "caller-controlled" }, ["clientId"])).toBe(false);
  });

  it("does not use the service role before session authentication", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await authorizeSocialScope(request(), CLIENT_ID);

    expect(result).toEqual({ ok: false, status: 401, error: "Unauthorized" });
    expect(from).not.toHaveBeenCalled();
  });

  it("derives the client from the authenticated user and accepts owned scope", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "authenticated-user" } } });
    const clientQuery = queryResult({ data: { id: CLIENT_ID }, error: null });
    const brandQuery = queryResult({ data: { id: BRAND_ID }, error: null });
    from.mockReturnValueOnce(clientQuery).mockReturnValueOnce(brandQuery);

    const result = await authorizeSocialScope(request(), CLIENT_ID, BRAND_ID);

    expect(result).toMatchObject({ ok: true, scope: { clientId: CLIENT_ID, brandId: BRAND_ID } });
    expect(clientQuery.eq).toHaveBeenCalledWith("user_id", "authenticated-user");
    expect(brandQuery.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("hides a caller-supplied cross-tenant client before brand access", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "authenticated-user" } } });
    from.mockReturnValueOnce(queryResult({ data: { id: CLIENT_ID }, error: null }));

    const result = await authorizeSocialScope(request(), OTHER_CLIENT_ID, BRAND_ID);

    expect(result).toEqual({ ok: false, status: 404, error: "Resource not found" });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("scopes social-account lookup to the authenticated client", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "authenticated-user" } } });
    const clientQuery = queryResult({ data: { id: CLIENT_ID }, error: null });
    const accountQuery = queryResult({
      data: { id: SOCIAL_ACCOUNT_ID, client_id: CLIENT_ID, brand_id: BRAND_ID, postforme_account_id: "pfm-owned" },
      error: null,
    });
    from.mockReturnValueOnce(clientQuery).mockReturnValueOnce(accountQuery);

    const result = await authorizeSocialAccount(request(), SOCIAL_ACCOUNT_ID);

    expect(result).toMatchObject({ ok: true, scope: { socialAccountId: SOCIAL_ACCOUNT_ID, clientId: CLIENT_ID } });
    expect(accountQuery.eq).toHaveBeenCalledWith("id", SOCIAL_ACCOUNT_ID);
    expect(accountQuery.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("rejects malformed identifiers before authentication or privileged access", async () => {
    const result = await authorizeSocialScope(request(), "not-a-uuid");

    expect(result).toEqual({ ok: false, status: 400, error: "Invalid clientId" });
    expect(getUser).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
