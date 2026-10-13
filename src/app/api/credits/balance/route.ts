import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase-server";
import { requestWorkspace } from "@/lib/brand-access";

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

        // The caller's workspace, or the owner's while an editor works in a shared brand (the
        // studio sends that brand in a header), since that is the balance their work spends.
        const ws = await requestWorkspace(request, user.id);
        if (!ws) {
            return NextResponse.json({
                client_id: null,
                plan_tier: "free",
                balance: 0,
                lifetime_earned: 0,
                lifetime_spent: 0
            });
        }

        const { data: balanceRow } = await supabaseAdmin
            .from("credit_balances")
            .select("balance, lifetime_earned, lifetime_spent")
            .eq("client_id", ws.clientId)
            .maybeSingle();

        const shared = ws.role !== "owner";
        return NextResponse.json({
            client_id: ws.clientId,
            plan_tier: ws.plan_tier ?? "free",
            balance: balanceRow?.balance ?? 0,
            // The owner's lifetime totals stay theirs.
            lifetime_earned: shared ? null : balanceRow?.lifetime_earned ?? 0,
            lifetime_spent: shared ? null : balanceRow?.lifetime_spent ?? 0,
            shared,
        });
    } catch (error) {
        console.error("Credits balance error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal error" },
            { status: 500 }
        );
    }
}