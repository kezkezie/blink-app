import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeSocialScope, hasOnlyKeys } from "@/lib/postforme-route-auth";

type ProviderAccount = {
    id: string;
    external_id?: string;
    status?: string;
    platform?: string;
    provider?: string;
    username?: string;
    name?: string;
};

export async function POST(req: NextRequest) {
    try {
        const body: unknown = await req.json();
        if (!hasOnlyKeys(body, ["clientId", "brandId"])) {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
        }
        const { clientId, brandId } = body;
        const apiKey = process.env.POSTFORME_API_KEY;

        const authorization = await authorizeSocialScope(req, clientId, brandId);
        if (!authorization.ok) {
            return NextResponse.json({ error: authorization.error }, { status: authorization.status });
        }
        if (!apiKey) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

        const verifiedClientId = authorization.scope.clientId;
        const verifiedBrandId = authorization.scope.brandId!;

        // 1. Fetch all social accounts from PostForMe
        const pfmRes = await fetch(`https://api.postforme.dev/v1/social-accounts`, {
            headers: { Authorization: `Bearer ${apiKey}` }
        });

        if (!pfmRes.ok) {
            console.error("[Sync] Provider request failed");
            throw new Error("Failed to fetch from PostForMe");
        }

        const pfmAccounts = await pfmRes.json();
        const allAccounts: ProviderAccount[] = Array.isArray(pfmAccounts.data)
            ? pfmAccounts.data
            : (Array.isArray(pfmAccounts) ? pfmAccounts : []);

        // 2. Keep only accounts owned by this client AND genuinely connected
        // Disconnected accounts must be excluded — PostForMe rejects them with "not owned by user"
        const connectedAccounts = allAccounts.filter((acc: ProviderAccount) =>
            acc.external_id === verifiedClientId &&
            acc.status !== "disconnected" &&
            acc.status !== "revoked"
        );

        // 3. Fetch existing Supabase rows for this brand (using admin client — bypasses RLS)
        const query = supabaseAdmin
            .from("social_accounts")
            .select("id, platform, postforme_account_id, brand_id")
            .eq("client_id", verifiedClientId)
            .eq("brand_id", verifiedBrandId);
        const { data: existingRows } = await query;

        const connectedPlatforms = connectedAccounts.map((account: ProviderAccount) =>
            (account.platform || account.provider || "").toLowerCase()
        );

        // 4. Delete stale rows — platforms in Supabase that PostForMe no longer has connected
        for (const row of (existingRows || [])) {
            if (!connectedPlatforms.includes(row.platform?.toLowerCase())) {
                await supabaseAdmin.from("social_accounts").delete()
                    .eq("id", row.id).eq("client_id", verifiedClientId).eq("brand_id", verifiedBrandId);
            }
        }

        // 5. Upsert connected accounts into Supabase
        const accountsToSave = [];
        for (const acc of connectedAccounts) {
            const platform = (acc.platform || acc.provider || "").toLowerCase();
            if (!platform || typeof acc.id !== "string") continue;
            const record = {
                client_id: verifiedClientId,
                brand_id: verifiedBrandId,
                platform,
                account_name: acc.username || acc.name || null,
                postforme_account_id: acc.id,
                is_active: true,
                connected_at: new Date().toISOString(),
            };

            const existing = existingRows?.find(r => r.platform?.toLowerCase() === platform);
            if (existing) {
                await supabaseAdmin.from("social_accounts").update(record)
                    .eq("id", existing.id).eq("client_id", verifiedClientId).eq("brand_id", verifiedBrandId);
            } else {
                await supabaseAdmin.from("social_accounts").insert([record]);
            }
            accountsToSave.push(record);
        }

        return NextResponse.json({ success: true, accounts: accountsToSave });

    } catch {
        console.error("[Sync] Synchronization failed");
        return NextResponse.json({ error: "Failed to synchronize accounts" }, { status: 500 });
    }
}
