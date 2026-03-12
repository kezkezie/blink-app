import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
    try {
        const { clientId } = await req.json();
        const apiKey = process.env.POSTFORME_API_KEY;

        if (!clientId || !apiKey) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        // 1. Fetch all connected accounts for this client from PostForMe
        //    The API supports `external_id` as a query filter on GET /v1/social-accounts
        //    Also filter to only `connected` status accounts
        const pfmUrl = `https://api.postforme.dev/v1/social-accounts?external_id=${encodeURIComponent(clientId)}&status=connected`;

        const pfmRes = await fetch(pfmUrl, {
            headers: { Authorization: `Bearer ${apiKey}` }
        });

        if (!pfmRes.ok) {
            const errBody = await pfmRes.text();
            console.error("PostForMe API Error:", pfmRes.status, errBody);
            throw new Error(`PostForMe API returned ${pfmRes.status}`);
        }

        const pfmAccounts = await pfmRes.json();

        // 2. Safely access the `data` array — PostForMe returns { data: [...], meta: {...} }
        const accountsArray = Array.isArray(pfmAccounts?.data) ? pfmAccounts.data : [];

        console.log(`[Sync] PostForMe returned ${accountsArray.length} account(s) for client ${clientId}`);

        // 3. Format them for our Supabase database
        const upsertData = accountsArray.map((acc: any) => ({
            client_id: clientId,
            platform: acc.platform,
            account_name: acc.username || acc.name || null,
            postforme_account_id: acc.id,
            is_active: true,
            connected_at: new Date().toISOString()
        }));

        // 4. Save to Supabase (upsert handles updating existing ones)
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