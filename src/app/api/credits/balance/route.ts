import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
    try {
        // --- Build Supabase client with auth cookie passthrough ---
        const response = NextResponse.next();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            response.cookies.set(name, value, options);
                        });
                    },
                },
            }
        );

        // --- Auth check ---
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // ✨ THE FIX: Fetch the client row matching the authenticated user_id
        const { data: clientRow } = await supabase
            .from("clients")
            .select("id, plan_tier")
            .eq("user_id", user.id) // Search by user_id, NOT id!
            .single();

        if (!clientRow) {
            return NextResponse.json({
                client_id: null,
                plan_tier: "starter",
                balance: 0,
                lifetime_earned: 0,
                lifetime_spent: 0
            });
        }

        const planTier = clientRow.plan_tier ?? "starter";
        const actualClientId = clientRow.id; // This is the '1279475a...' ID

        // --- Fetch credit balance using the actual client ID ---
        const { data: balanceRow } = await supabase
            .from("credit_balances")
            .select("balance, lifetime_earned, lifetime_spent")
            .eq("client_id", actualClientId)
            .single();

        return NextResponse.json({
            client_id: actualClientId,
            plan_tier: planTier,
            balance: balanceRow?.balance ?? 0,
            lifetime_earned: balanceRow?.lifetime_earned ?? 0,
            lifetime_spent: balanceRow?.lifetime_spent ?? 0,
        });
    } catch (error) {
        console.error("Credits balance error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal error" },
            { status: 500 }
        );
    }
}