import { toast } from "sonner";

/**
 * Stop posts still being made, from anywhere (Library tiles, the video screens, Ask; 2026-10-25).
 * Says what happened, and tells open pages which posts are gone (`blink:stopped`, detail = ids).
 */
export type StopOutcome = { stopped: string[]; refunded: number; starting: string[]; notStopped: string[] };

export async function stopPosts(ids: string[], opts: { quiet?: boolean } = {}): Promise<StopOutcome | null> {
  if (!ids.length) return null;
  const res = await fetch(`/api/jobs?ids=${ids.slice(0, 24).join(",")}`, { method: "DELETE" }).catch(() => null);
  const data = (res?.ok ? await res.json().catch(() => null) : null) as StopOutcome | null;
  if (!data) { if (!opts.quiet) toast.error("Couldn't stop it just now. Try again."); return null; }
  if (data.stopped.length) window.dispatchEvent(new CustomEvent("blink:stopped", { detail: data.stopped }));
  if (!opts.quiet) {
    if (data.stopped.length) toast.success(data.refunded ? `Stopped. ${data.refunded.toLocaleString("en-US")} credits are back.` : "Stopped. Any credits it took come back to you.");
    else if (data.starting.length) toast.info("It's only just starting. Press Stop again in a few seconds.");
    else toast.info("It had already finished, so there was nothing to stop.");
  }
  return data;
}
