import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeSocialAccount, hasOnlyKeys, isProviderId } from "@/lib/postforme-route-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!hasOnlyKeys(body, ["accountId", "supabaseAccountId"])) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    // supabaseAccountId = Supabase row ID, accountId = PostForMe account ID
    const { accountId, supabaseAccountId } = body;

    const authorization = await authorizeSocialAccount(req, supabaseAccountId);
    if (!authorization.ok) {
      return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    }

    if (accountId !== undefined && accountId !== null && !isProviderId(accountId)) {
      return NextResponse.json({ error: "Invalid provider account identifier" }, { status: 400 });
    }

    const ownedProviderId = authorization.scope.postformeAccountId;
    if (accountId && accountId !== ownedProviderId) {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }

    const apiKey = process.env.POSTFORME_API_KEY;

    // 1. Revoke the connection in PostForMe
    if (ownedProviderId && apiKey) {
      const pfmRes = await fetch(
        `https://api.postforme.dev/v1/social-accounts/${encodeURIComponent(ownedProviderId)}/disconnect`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );
      if (!pfmRes.ok) {
        console.warn("[Disconnect] Provider revoke failed");
        // Non-fatal — still delete from Supabase
      }
    }

    // 2. Delete the row from Supabase using admin client (bypasses RLS)
    if (authorization.scope.socialAccountId) {
      const { error: dbError } = await supabaseAdmin
        .from("social_accounts")
        .delete()
        .eq("id", authorization.scope.socialAccountId)
        .eq("client_id", authorization.scope.clientId);

      if (dbError) {
        console.error("[Disconnect] Database delete failed");
        throw new Error("Failed to remove account from database");
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    console.error("[Disconnect] Request failed");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
