import { BUDGET } from "./config.mjs";

/**
 * Spend ledger. Pure functions over a plain object so they are unit-testable;
 * run.mjs owns reading/writing spend.json.
 *
 * Every attempted generation is recorded, including ones that fail, because a
 * failed provider call may still have been charged. Over-counting is safe;
 * under-counting is how budgets get blown.
 */
/**
 * @typedef {{ at: string, day: string, amount: number, note: string }} SpendEntry
 * @typedef {{ total: number, days: Record<string, number>, entries: SpendEntry[] }} Ledger
 */

/** @returns {Ledger} */
export function emptyLedger() {
  return { total: 0, days: {}, entries: [] };
}

export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * @param {Ledger} ledger
 * @param {number} amount
 * @param {{ day?: string, runSpent?: number, runCap?: number }} [opts]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canSpend(ledger, amount, { day = dayKey(), runSpent = 0, runCap = BUDGET.perRunDefault } = {}) {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: `invalid amount ${amount}` };
  if (runCap > BUDGET.perRunHard) return { ok: false, reason: `run cap ${runCap} exceeds hard cap ${BUDGET.perRunHard}` };
  if (runSpent + amount > runCap) return { ok: false, reason: `run cap: ${runSpent}+${amount} > ${runCap}` };
  const today = ledger.days[day] ?? 0;
  if (today + amount > BUDGET.daily) return { ok: false, reason: `daily cap: ${today}+${amount} > ${BUDGET.daily}` };
  if (ledger.total + amount > BUDGET.total) return { ok: false, reason: `total cap: ${ledger.total}+${amount} > ${BUDGET.total}. Check in with Kezie.` };
  return { ok: true };
}

/**
 * @param {Ledger} ledger
 * @param {number} amount
 * @param {{ day?: string, note?: string }} [opts]
 * @returns {Ledger}
 */
export function recordSpend(ledger, amount, { day = dayKey(), note = "" } = {}) {
  return {
    total: ledger.total + amount,
    days: { ...ledger.days, [day]: (ledger.days[day] ?? 0) + amount },
    entries: [...ledger.entries, { at: new Date().toISOString(), day, amount, note }],
  };
}
