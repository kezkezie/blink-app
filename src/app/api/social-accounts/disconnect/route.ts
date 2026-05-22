import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // supabaseAccountId = Supabase row ID, accountId = PostForMe account ID
    const { accountId, supabaseAccountId } = body;

    const apiKey = process.env.POSTFORME_API_KEY;

    // 1. Revoke the connection in PostForMe
    if (accountId && apiKey) {
      const pfmRes = await fetch(
        `https://api.postforme.dev/v1/social-accounts/${accountId}/disconnect`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );
      if (!pfmRes.ok) {
        const errText = await pfmRes.text();
        console.warn("[Disconnect] PostForMe revoke failed:", errText);
        // Non-fatal — still delete from Supabase
      }
    }

    // 2. Delete the row from Supabase using admin client (bypasses RLS)
    if (supabaseAccountId) {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );
      const { error: dbError } = await supabaseAdmin
        .from("social_accounts")
        .delete()
        .eq("id", supabaseAccountId);

      if (dbError) {
        console.error("[Disconnect] Supabase delete error:", dbError);
        throw new Error("Failed to remove account from database");
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Disconnect] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
