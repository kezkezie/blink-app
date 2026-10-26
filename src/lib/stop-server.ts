import { after } from "next/server";

/**
 * A Stop from the browser, for a route that charged up front (2026-10-25). The routes listed in
 * vercel.json under `supportsCancellation` end on Vercel the moment the browser stops the request,
 * so the refund can't wait for the code after an await: `giveBack` is held open with after() and
 * runs once, on the stop or on the route's own failure, whichever comes first.
 * - `fail()`: the route failed; gives the credits back unless a stop already did.
 * - `done()`: the result is about to be delivered; false if a stop already gave the credits back
 *   (then don't save or deliver it).
 */
export function stopGuard(request: Request, giveBack: () => PromiseLike<unknown>) {
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  let settled = false;
  const settle = async (refund: boolean) => {
    if (settled) return false;
    settled = true;
    try { if (refund) await giveBack(); } catch { /* logged by the caller's RPC */ } finally { release(); }
    return true;
  };
  // Never held longer than the slowest of these routes, even if one forgets to settle.
  const cap = setTimeout(() => release(), 300_000);
  after(held.finally(() => clearTimeout(cap)));
  if (request.signal.aborted) void settle(true);
  else request.signal.addEventListener("abort", () => { void settle(true); }, { once: true });
  return {
    fail: () => settle(true).then(() => {}),
    done: () => { if (settled) return false; settled = true; release(); return true; },
    get stopped() { return request.signal.aborted; },
  };
}
