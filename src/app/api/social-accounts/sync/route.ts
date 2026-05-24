import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
    try {
        const { clientId, brandId } = await req.json();
        const apiKey = process.env.POSTFORME_API_KEY;

        if (!clientId || !brandId || !apiKey) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        );

        // 1. Fetch all social accounts from PostForMe
        const pfmRes = await fetch(`https://api.postforme.dev/v1/social-accounts`, {
            headers: { Authorization: `Bearer ${apiKey}` }
        });

        if (!pfmRes.ok) {
            const errText = await pfmRes.text();
            console.error("[Sync] PostForMe API Error:", errText);
            throw new Error("Failed to fetch from PostForMe");
        }

        const pfmAccounts = await pfmRes.json();
        const allAccounts = Array.isArray(pfmAccounts.data) ? pfmAccounts.data : (Array.isArray(pfmAccounts) ? pfmAccounts : []);

        // 2. Keep only accounts owned by this client AND genuinely connected
        // Disconnected accounts must be excluded — PostForMe rejects them with "not owned by user"
        const connectedAccounts = allAccounts.filter((acc: any) =>
            acc.external_id === clientId &&
            acc.status !== "disconnected" &&
            acc.status !== "revoked"
        );

        console.log("[Sync] Connected accounts for client:", connectedAccounts.map((a: any) => ({
            id: a.id, platform: a.platform || a.provider, username: a.username, status: a.status,
        })));

        // 3. Fetch existing Supabase rows for this brand (using admin client — bypasses RLS)
        let query = supabaseAdmin
            .from("social_accounts")
            .select("id, platform, postforme_account_id, brand_id")
            .eq("client_id", clientId);
        if (brandId) query = query.eq("brand_id", brandId);
        const { data: existingRows } = await query;

        const connectedPlatforms = connectedAccounts.map((a: any) => (a.platform || a.provider).toLowerCase());

        // 4. Delete stale rows — platforms in Supabase that PostForMe no longer has connected
        for (const row of (existingRows || [])) {
            if (!connectedPlatforms.includes(row.platform?.toLowerCase())) {
                console.log("[Sync] Removing stale account:", row.platform, row.postforme_account_id);
                await supabaseAdmin.from("social_accounts").delete().eq("id", row.id);
            }
        }

        // 5. Upsert connected accounts into Supabase
        const accountsToSave = [];
        for (const acc of connectedAccounts) {
            const platform = (acc.platform || acc.provider).toLowerCase();
            const record = {
                client_id: clientId,
                ...(brandId ? { brand_id: brandId } : {}),
                platform,
                account_name: acc.username || acc.name || null,
                postforme_account_id: acc.id,
                is_active: true,
                connected_at: new Date().toISOString(),
            };

            const existing = existingRows?.find(r => r.platform?.toLowerCase() === platform);
            if (existing) {
                await supabaseAdmin.from("social_accounts").update(record).eq("id", existing.id);
            } else {
                await supabaseAdmin.from("social_accounts").insert([record]);
            }
            accountsToSave.push(record);
        }

        return NextResponse.json({ success: true, accounts: accountsToSave });

    } catch (error: any) {
        console.error("[Sync] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}