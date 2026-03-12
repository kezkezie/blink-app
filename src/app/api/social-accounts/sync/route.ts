import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
    try {
        const { clientId } = await req.json();
        const apiKey = process.env.POSTFORME_API_KEY;

        if (!clientId || !apiKey) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        // 1. Fetch all connected accounts for this specific client from PostForMe
        const pfmRes = await fetch(`https://api.postforme.dev/v1/social-accounts?external_id=${clientId}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
        });

        if (!pfmRes.ok) throw new Error("Failed to fetch from PostForMe");

        const pfmAccounts = await pfmRes.json();

        // 2. Format them for our Supabase database
        const upsertData = pfmAccounts.data.map((acc: any) => ({
            client_id: clientId,
            platform: acc.platform,
            account_name: acc.username || acc.name || null,
            postforme_account_id: acc.id,
            is_active: true,
            connected_at: new Date().toISOString()
        }));

        // 3. Save to Supabase (upsert handles updating existing ones)
        if (upsertData.length > 0) {
            const { error } = await supabase
                .from('social_accounts')
                .upsert(upsertData, { onConflict: 'client_id, platform' });

            if (error) throw error;
        }

        return NextResponse.json({ success: true, accounts: upsertData });

    } catch (error: any) {
        console.error("Sync Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}