import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize a Supabase admin client to bypass RLS during the server-side callback
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Make sure this is in your .env.local!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Extract params sent back from Post For Me + our custom pass-through params
  const clientId = searchParams.get("client_id");
  const platform = searchParams.get("platform");
  const error = searchParams.get("error");

  // Post For Me usually passes back the new ID in the query string
  // It might be called 'account_id' or 'id'. We check for both.
  const postForMeAccountId =
    searchParams.get("account_id") || searchParams.get("id");
  const accountName =
    searchParams.get("username") ||
    searchParams.get("account_name") ||
    `${platform} account`;

  // Handle User Denied / Errors
  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/dashboard/settings?error=${encodeURIComponent(error)}`
    );
  }

  if (!clientId || !platform || !postForMeAccountId) {
    return NextResponse.redirect(
      `${baseUrl}/dashboard/settings?error=missing_callback_data`
    );
  }

  try {
    // Save the connected account to your Supabase Database matching your exact schema!
    const { error: dbError } = await supabaseAdmin
      .from("social_accounts")
      .upsert(
        {
          client_id: clientId,
          platform: platform,
          account_name: `@${accountName.replace("@", "")}`,
          postforme_account_id: postForMeAccountId,
          is_active: true,
          connected_at: new Date().toISOString(),
        },
        {
          onConflict: "client_id,platform",
        }
      );

    if (dbError) throw dbError;

    // Redirect the user back to frontend with the success flag
    return NextResponse.redirect(
      `${baseUrl}/dashboard/settings?success=account_connected`
    );
  } catch (err) {
    console.error("Callback Save Error:", err);
    return NextResponse.redirect(
      `${baseUrl}/dashboard/settings?error=database_save_failed`
    );
  }
}
