import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase"; // Use your service role key client here if possible, or standard client

export async function POST(req: Request) {
    try {
        const payload = await req.json();

        // PostForMe sends specific event types. We want to listen for new account connections.
        if (payload.event === "social_account.connected") {
            const accountData = payload.data;

            // Extract the data sent back from PostForMe
            const platform = accountData.platform;
            const platformAccountId = accountData.id; // PostForMe's internal ID for this social account
            const accountName = accountData.username || accountData.name || null;
            const clientId = accountData.external_id; // This is the clientId you passed in your auth-url route!

            if (!clientId) {
                throw new Error("Received webhook with no external_id (clientId)");
            }

            // Save the newly connected account to your Supabase database
            const { error } = await supabase
                .from("social_accounts")
                .upsert({
                    client_id: clientId,
                    platform: platform,
                    account_name: accountName,
                    postforme_account_id: platformAccountId, // Save this so you can post to it later
                    is_active: true,
                    connected_at: new Date().toISOString(),
                }, {
                    onConflict: 'client_id, platform' // Prevents duplicate connections for the same platform
                });

            if (error) {
                console.error("Supabase Insert Error:", error);
                throw error;
            }

            return NextResponse.json({ success: true, message: "Account saved successfully" });
        }

        // Acknowledge other events (like disconnects) so PostForMe doesn't retry
        return NextResponse.json({ received: true });

    } catch (error: any) {
        console.error("PostForMe Webhook Error:", error);
        return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
    }
}