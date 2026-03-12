import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { clientId } = await req.json();
        const apiKey = process.env.POSTFORME_API_KEY;

        if (!clientId || !apiKey) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        // 1. Fetch ALL connected accounts from PostForMe securely
        const pfmRes = await fetch(`https://api.postforme.dev/v1/social-accounts`, {
            headers: { Authorization: `Bearer ${apiKey}` }
        });

        if (!pfmRes.ok) {
            const errText = await pfmRes.text();
            console.error("PFM API Error:", errText);
            throw new Error("Failed to fetch from PostForMe");
        }

        const pfmAccounts = await pfmRes.json();
        const allAccounts = Array.isArray(pfmAccounts.data) ? pfmAccounts.data : (Array.isArray(pfmAccounts) ? pfmAccounts : []);

        // 2. Manually filter for the exact clientId (external_id) to be 100% safe
        const clientAccounts = allAccounts.filter((acc: any) => acc.external_id === clientId);

        // 3. Format them for our Supabase database (handling provider vs platform naming)
        const accountsToSave = clientAccounts.map((acc: any) => ({
            client_id: clientId,
            platform: acc.platform || acc.provider, // ✨ Catch both naming conventions!
            account_name: acc.username || acc.name || null,
            postforme_account_id: acc.id,
            is_active: true,
            connected_at: new Date().toISOString()
        }));

        return NextResponse.json({ success: true, accounts: accountsToSave });

    } catch (error: any) {
        console.error("Sync Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}