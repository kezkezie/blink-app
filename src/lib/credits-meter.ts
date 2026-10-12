import { supabaseAdmin } from "@/lib/supabase-server";
import { isDeductionSuccessful } from "@/lib/credit-deduction";

/**
 * Credits for AI that costs us by the token (Ask BlinkSpot past the day's included messages,
 * Editor vectors). Kezie, 2026-10-12: credits unlock every AI feature on every plan; plans buy
 * brands, monthly credits and the daily Ask messages. Price rule in credits-price.ts.
 */
export { CREDITS_PER_USD, meteredCredits, NOT_ENOUGH_CREDITS } from "@/lib/credits-price";

export async function creditBalance(clientId: string): Promise<number> {
  const { data } = await supabaseAdmin.from("credit_balances").select("balance").eq("client_id", clientId).maybeSingle();
  return Number(data?.balance) || 0;
}

/** Take `amount` credits after the work is done. False if the balance couldn't cover it. */
export async function chargeCredits(clientId: string, amount: number, description: string): Promise<boolean> {
  if (amount <= 0) return true;
  const { data, error } = await supabaseAdmin.rpc("deduct_credits", { p_client_id: clientId, p_amount: amount, p_operation: "debit", p_description: description.slice(0, 200) });
  return isDeductionSuccessful(data, error);
}

