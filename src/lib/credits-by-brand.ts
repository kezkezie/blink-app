/**
 * What each brand used (Kezie, 2026-10-14). From ledger lines: charges count, refunds of them are
 * taken off, purchases and welcome credits don't count. Lines with no brand (account-level, or
 * from before 2026-10-14) are grouped under null.
 */
export type LedgerLine = { amount: number; brand_id: string | null; operation: string | null; description: string | null };

const isRefund = (l: LedgerLine) => l.amount > 0 && (/refund|credit/i.test(l.operation ?? "") || /^refund/i.test(l.description ?? ""));

export function creditsByBrand(lines: LedgerLine[]): Array<{ brandId: string | null; used: number }> {
  const used = new Map<string | null, number>();
  for (const l of lines) {
    if (l.amount < 0) used.set(l.brand_id, (used.get(l.brand_id) ?? 0) - l.amount);
    else if (isRefund(l)) used.set(l.brand_id, (used.get(l.brand_id) ?? 0) - l.amount);
  }
  return [...used.entries()].map(([brandId, n]) => ({ brandId, used: Math.max(0, n) })).filter((r) => r.used > 0).sort((a, b) => b.used - a.used);
}
