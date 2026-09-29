/**
 * Did a `deduct_credits` RPC call actually take the credits?
 *
 * The live function answers over HTTP 200 in BOTH cases and signals failure in the
 * body: `{"success": false, "error": "..."}` (verified 2026-09-29 by probing with a
 * nonexistent client id). Routes used to test `data === false`, which an object can
 * never equal, so a FAILED deduction was treated as paid: the work ran for free and,
 * on a later provider failure, the route REFUNDED credits that were never taken.
 *
 * Rule: only an explicit success counts. Anything else, including null, an unknown
 * shape, or a transport error, is a failed deduction.
 */
export function isDeductionSuccessful(data: unknown, error: unknown): boolean {
  if (error) return false;
  if (data === true) return true;
  return typeof data === "object" && data !== null && (data as { success?: unknown }).success === true;
}
