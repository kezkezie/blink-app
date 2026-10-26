"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useWorkflowStore } from "@/app/store/useWorkflowStore";
import { track } from "@/lib/analytics";
import { stopMessage } from "@/lib/stop-refund";
import { BRAND_KIT_COLUMNS, imageRequestPayload, kitFromRow, type BrandKit, type ImageRequest } from "@/lib/image-request";
export { brandConstraintFor, type BrandKit, type ImageEngine } from "@/lib/image-request";

/**
 * The studio's one way to make images (Generate and Inspo Remix): the same workflow, billing,
 * refunds and Library rows as the classic Image Studio's synchronous path.
 */


/** The active brand's identity, as the classic Image Studio loads it. */
export function useBrandKit(brandId: string | null | undefined, fallbackName?: string) {
  const [kit, setKit] = useState<BrandKit | null>(null);
  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    supabase
      .from("brand_profiles")
      .select(BRAND_KIT_COLUMNS)
      .eq("id", brandId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setKit(kitFromRow(data as Record<string, unknown> | null, fallbackName));
      });
    return () => { cancelled = true; };
  }, [brandId, fallbackName]);
  return kit;
}

export type GenerateRequest = ImageRequest & {
  count?: number;
  caption: string;
  /** false for in-between editor steps: return the image without adding it to the Library. */
  save?: boolean;
  /** The line to show while the server works ("Making your image", "trying another image service"). */
  onProgress?: (text: string) => void;
  /** Stop (2026-10-22): the images still being made are removed and their credits come back. */
  signal?: AbortSignal;
};

/** What generateBrandImages throws when it was stopped. */
export const STOPPED = "stopped";
/** A stop, with what came back (lib/stop-refund.ts). */
class Stopped extends Error { constructor(readonly line: string) { super(STOPPED); } }
/** The line to show for a stop: what came back, or nothing was charged when it stopped before the picture started. */
export const stoppedLine = (e: unknown) => (e instanceof Stopped ? e.line : "Stopped. Nothing was charged.");

const IMAGE_ASPECTS = ["1:1", "4:5", "3:4", "9:16", "16:9", "3:2", "2:3"];
/** The closest aspect the image models accept, for a "w:h" ratio (any numbers, e.g. pixel sizes). */
export function nearestImageAspect(aspect: string) {
  if (IMAGE_ASPECTS.includes(aspect)) return aspect;
  const [w, h] = aspect.split(":").map(Number);
  const r = w && h ? w / h : 1;
  return IMAGE_ASPECTS.reduce((best, a) => { const [x, y] = a.split(":").map(Number); return Math.abs(x / y - r) < Math.abs(best.r - r) ? { a, r: x / y } : best; }, { a: "16:9", r: 16 / 9 }).a;
}

export type GeneratedImage = { id: string | null; url: string };

export async function generateBrandImages(req: GenerateRequest): Promise<GeneratedImage[]> {
  track("image_started", { engine: req.engine, mode: req.mode ?? "generate", references: (req.references ?? []).length });
  const payload = imageRequestPayload(req);

  const { addTask, removeTask } = useWorkflowStore.getState();
  const taskId = `img-${Date.now()}`;
  addTask(taskId, "Generating Image");
  const n = Math.min(4, Math.max(1, req.count ?? 1));
  const post = (url: string, body: unknown, signal?: AbortSignal) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal })
    .then(async (r) => ({ ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as Record<string, unknown> }));
  try {
    // In-between editor steps: both tries inside one request, no Library post.
    if (req.save === false) {
      // Stop cancels the request; the server gives back what a stopped picture cost.
      const made = await Promise.all(Array.from({ length: n }, () => post("/api/images/now", { request: payload }, req.signal)));
      const urls = made.filter((m) => m.ok && typeof m.data.url === "string").map((m) => m.data.url as string);
      if (!urls.length) throw new Error(String(made[0]?.data.error || "The image could not be made."));
      return urls.map((url) => ({ id: null, url }));
    }
    // The server owns the job (2026-10-17, lib/image-jobs.ts): it makes the Library posts, tries
    // the router, and tries another service by itself if that fails. Leaving the page doesn't stop
    // it; the picture lands in the Library. Here we only watch.
    const started = await post("/api/images", { request: payload, count: n, caption: req.caption });
    if (!started.ok || !Array.isArray(started.data.ids)) {
      throw new Error(String(started.data.error || (started.status === 402 ? "Not enough credits for this. Get more in Billing." : "Couldn't start the image. Nothing was charged.")));
    }
    const ids = started.data.ids as string[];
    const stopIfAsked = async () => {
      if (!req.signal?.aborted) return;
      const out = await fetch(`/api/images?ids=${ids.join(",")}`, { method: "DELETE" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { refunded?: number; kept?: number } | null;
      throw new Stopped(out ? stopMessage(out.refunded ?? 0, out.kept ?? 0) : "Stopped.");
    };
    let last: Array<{ id: string; state: string; text: string | null; url: string | null }> = [];
    for (let quiet = 0; ; ) {
      await stopIfAsked();
      await new Promise<void>((r) => { const t = setTimeout(r, quiet < 20 ? 3000 : 6000); req.signal?.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true }); });
      await stopIfAsked();
      const res = await fetch(`/api/images?ids=${ids.join(",")}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { jobs?: typeof last } | null;
      quiet++;
      if (!res?.jobs?.length) continue; // offline for a moment: keep watching
      last = res.jobs;
      const making = last.find((j) => j.state === "making");
      if (making) { req.onProgress?.(making.text ?? "Making your image"); continue; }
      break;
    }
    const saved = last.filter((j) => j.state === "done" && j.url).map((j) => ({ id: j.id, url: j.url! }));
    if (!saved.length) throw new Error(last.find((j) => j.text)?.text || "The image could not be made.");
    return saved;
  } finally {
    removeTask(taskId);
  }
}

/** A friendly message for a failed generation. */
export function generationErrorMessage(e: unknown) {
  if (e instanceof Stopped) return e.line;
  if (e instanceof Error && e.message === STOPPED) return "Stopped.";
  const msg = e instanceof Error ? e.message : "";
  if (/upstream_auth/.test(msg)) return "The image service isn't connected right now, so nothing was made and nothing was charged. We've been told; try again a little later.";
  if (/status: 504|timed out/i.test(msg)) return "The render took longer than the connection allowed. It may still finish; check your Library in a minute before trying again.";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "The connection dropped while your image was being made. If it finished, it lands in your Library on its own in a minute; failed renders refund themselves.";
  if (/status: 402|insufficient/i.test(msg)) return "Not enough credits for this. Get more in Billing.";
  if (/status: 429/i.test(msg)) return "That's a lot of images in a short time. Wait a minute and try again.";
  // 502: n8n answered with an error (a crash, or it is down). Failed renders refund themselves.
  if (/status: 502/i.test(msg)) return "The image service had a problem with this one. If credits were taken they come back automatically. Try again in a minute.";
  return msg || "The image could not be made.";
}
