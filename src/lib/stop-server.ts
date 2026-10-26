import { after } from "next/server";

/**
 * A Stop from the browser, for a route that charged up front (2026-10-25). The routes listed in
 * vercel.json under `supportsCancellation` end on Vercel the moment the browser stops the request,
 * so the refund can't wait for the code after an await: `settle` is held open with after() and runs
 * once, on the stop or on the route's own failure, whichever comes first. It's told which: a failure
 * gives everything back, a stop only what the AI service hasn't billed (lib/stop-refund.ts).
 * - `fail()`: the route failed; settles as a failure unless a stop already settled it.
 * - `done()`: the result is about to be delivered; false if a stop already gave the credits back
 *   (then don't save or deliver it).
 */
export function stopGuard(request: Request, settleAs: (why: "stop" | "fail") => PromiseLike<unknown>) {
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  let settled = false;
  const settle = async (why: "stop" | "fail") => {
    if (settled) return false;
    settled = true;
    try { await settleAs(why); } catch { /* logged by the caller's RPC */ } finally { release(); }
    return true;
  };
  // Never held longer than the slowest of these routes, even if one forgets to settle.
  const cap = setTimeout(() => release(), 300_000);
  after(held.finally(() => clearTimeout(cap)));
  if (request.signal.aborted) void settle("stop");
  else request.signal.addEventListener("abort", () => { void settle("stop"); }, { once: true });
  return {
    fail: () => settle("fail").then(() => {}),
    done: () => { if (settled) return false; settled = true; release(); return true; },
    get stopped() { return request.signal.aborted; },
  };
}
