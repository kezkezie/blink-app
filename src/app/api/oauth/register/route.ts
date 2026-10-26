import { NextRequest, NextResponse } from "next/server";
import { redirectUriAllowed, registerClient } from "@/lib/oauth";

/**
 * Dynamic Client Registration (RFC 7591) for AI apps like Claude: the client is signed into its id,
 * so nothing is stored (lib/oauth.ts). Public clients only (PKCE, no secret).
 */
export async function POST(request: NextRequest) {
  let body: { client_name?: unknown; redirect_uris?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_client_metadata", error_description: "JSON body expected" }, { status: 400 }); }
  const uris = Array.isArray(body.redirect_uris) ? [...new Set(body.redirect_uris.filter((u): u is string => typeof u === "string"))].slice(0, 10) : [];
  if (!uris.length || !uris.every(redirectUriAllowed)) return NextResponse.json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be https, or http://localhost / 127.0.0.1" }, { status: 400 });
  const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.replace(/\s+/g, " ").trim().slice(0, 60) : "An AI app";
  const client = registerClient(name, uris);
  return NextResponse.json({
    client_id: client.id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: client.name, redirect_uris: client.redirectUris,
    grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none",
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
