import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use the admin client so RLS doesn't block upserts from the webhook
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const event = payload.event;

    // social.account.created — a new social account was connected via OAuth
    if (event === "social.account.created" || event === "social.account.updated") {
      const accountData = payload.data;

      const platform    = accountData.platform;
      const pfmId       = accountData.id;
      const accountName = accountData.username || accountData.name || null;
      const clientId    = accountData.external_id;

      if (!clientId) {
        // Connection made outside the app (PostForMe dashboard) — no external_id
        console.log(`[webhook] Skipping ${platform} — no external_id`);
        return NextResponse.json({ received: true });
      }

      if (!platform || !pfmId) {
        return NextResponse.json({ received: true });
      }

      // Look up the first brand for this client to populate brand_id
      const { data: brand } = await supabaseAdmin
        .from("brand_profiles")
        .select("id")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      // Check if this exact postforme_account_id already exists
      const { data: existing } = await supabaseAdmin
        .from("social_accounts")
        .select("id")
        .eq("postforme_account_id", pfmId)
        .single();

      if (existing) {
        // Update existing record
        await supabaseAdmin
          .from("social_accounts")
          .update({ account_name: accountName, is_active: true })
          .eq("id", existing.id);
      } else {
        // Insert new record
        await supabaseAdmin.from("social_accounts").insert({
          client_id:            clientId,
          brand_id:             brand?.id || null,
          platform:             platform,
          account_name:         accountName,
          postforme_account_id: pfmId,
          is_active:            true,
          connected_at:         new Date().toISOString(),
        });
      }

      console.log(`[webhook] Saved ${platform} for client ${clientId}`);
      return NextResponse.json({ success: true });
    }

    // social.post.result.created — a post was published or failed
    if (event === "social.post.result.created") {
      const result = payload.data;
      const externalId = result.external_id || result.post?.external_id;

      if (externalId) {
        const status = result.status === "success" ? "posted" : "failed";
        await supabaseAdmin
          .from("content")
          .update({ status, postforme_tracking_id: result.social_post_id || null } as any)
          .eq("postforme_tracking_id", externalId);
      }

      return NextResponse.json({ received: true });
    }

    // Acknowledge all other events so PostForMe doesn't retry
    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error("[PostForMe Webhook Error]", error.message);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
