/**
 * Images that arrive (Kezie, 2026-10-17: "some people have not been getting images, it just
 * stops, and telling them to regenerate isn't professional"). The server owns each image: the
 * browser starts it and watches. First try: the n8n router (Kie, with its own Replicate fallback
 * for Kie timeouts). If that fails for any reason except a refusal or a low balance, or n8n
 * doesn't answer, the app tries again by itself with Nano Banana 2 (Kie, then Replicate) in a
 * fresh function. Only when every try fails does the user see a failure, with the credits back.
 * Measured 2026-10-17: GPT Image 2 image-to-image failed 6 of 8 on 10-13 with no fallback, and the
 * n8n host flapped between 502 and 200. Pure parts here; the calls are in image-jobs-server.ts.
 */
import { STAMP_STATUS, stampPending } from "@/lib/stamp";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";

/** What a rescue needs to make the picture again, kept on the post (creation_metadata.job). */
export type ImageJobSpec = { prompt: string; references: string[]; aspect: string; engine: string };

export const FIRST_TRY_MS = 240_000;
/** A first try that hasn't answered in this long gets rescued when someone looks. */
export const RESCUE_AFTER_MS = 7 * 60_000;
/** A rescue that hasn't finished in this long died with its function: it is refunded and closed. */
export const RESCUE_DEAD_MS = 8 * 60_000;
export const RESCUE_ENGINE = "nano-banana-2";

export const STATUS = {
  making: "Making your image",
  slow: "Still finishing, almost there",
  rescue: "Taking longer than usual: trying a second image service",
} as const;

export const FINAL_FAILURE = (credits: number) =>
  `We tried two image services and neither could make this one right now. ${credits > 0 ? "Your credits are back. " : ""}Try again in a few minutes, or change the wording a little.`;
export const LOW_BALANCE_FOR_RESCUE = "The first try didn't work and your balance is too low for a second one. Those credits are back; top up in Billing and try again.";

/** What the n8n router said: an image, a refusal, no credits, or worth another try. */
export type RouterOutcome =
  | { kind: "image"; urls: string[] }
  | { kind: "refused"; message: string }
  | { kind: "no_credits"; message: string }
  | { kind: "retry"; why: string }
  | { kind: "waiting" };

export function classifyRouter(status: number | null, body: unknown, timedOut = false): RouterOutcome {
  if (timedOut) return { kind: "waiting" };
  if (status === null) return { kind: "retry", why: "no answer" };
  if (status === 401 || status === 403) return { kind: "retry", why: "n8n refused the call" };
  if (status >= 500) return { kind: "retry", why: `n8n ${status}` };
  const b = (body && typeof body === "object" ? body : {}) as { success?: unknown; imageUrls?: unknown; message?: unknown; reason?: unknown };
  const urls = (Array.isArray(b.imageUrls) ? b.imageUrls : typeof b.imageUrls === "string" ? [b.imageUrls] : []).filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u));
  if (urls.length) return { kind: "image", urls };
  const message = typeof b.message === "string" ? b.message.slice(0, 400) : "";
  if (/insufficient credits|not enough credits/i.test(message)) return { kind: "no_credits", message };
  if (b.reason === "safety") return { kind: "refused", message };
  return { kind: "retry", why: typeof b.reason === "string" ? b.reason : status >= 400 ? `n8n ${status}` : "no image came back" };
}

/** A second try costs what the first would have (the router already refunded it), never more than Nano Banana 2. */
export function rescueCredits(engine: string): number {
  const asked = IMAGE_ENGINE_REGISTRY[engine === "nano-banana-2" ? "nb2" : engine]?.creditCost ?? 8;
  const nb2 = IMAGE_ENGINE_REGISTRY.nb2?.creditCost ?? 18;
  return Math.max(1, Math.min(asked, nb2));
}

export function jobSpecFrom(payload: Record<string, unknown>): ImageJobSpec {
  const refs = [...new Set([...(Array.isArray(payload.reference_image_urls) ? payload.reference_image_urls : []), ...(Array.isArray(payload.input_urls) ? payload.input_urls : [])])]
    .filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 10);
  const prompt = [payload.assembled_prompt, payload.prompt, payload.topic].find((p) => typeof p === "string" && p.trim()) as string | undefined;
  return {
    prompt: (prompt ?? "").slice(0, 12_000),
    references: refs,
    aspect: typeof payload.aspect_ratio === "string" ? payload.aspect_ratio : "4:5",
    engine: typeof payload.imageEngine === "string" ? payload.imageEngine : typeof payload.kie_model === "string" ? payload.kie_model : "nb2",
  };
}

export function validJobSpec(raw: unknown): ImageJobSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.prompt !== "string" || !r.prompt.trim() || typeof r.aspect !== "string" || typeof r.engine !== "string") return null;
  return { prompt: r.prompt, aspect: r.aspect, engine: r.engine, references: Array.isArray(r.references) ? r.references.filter((u): u is string => typeof u === "string").slice(0, 10) : [] };
}

export type JobView = { id: string; state: "making" | "done" | "failed"; text: string | null; url: string | null; attempt: number };

/** What the browser sees for a post that is (or was) an image job. */
export function jobView(row: { id: string; image_urls?: unknown; generation_state?: string | null; generation_status_text?: string | null; generation_attempt?: number | null; creation_metadata?: unknown }): JobView {
  const urls = Array.isArray(row.image_urls) ? row.image_urls.filter((u): u is string => typeof u === "string") : [];
  const attempt = row.generation_attempt ?? 1;
  // A free account's picture is shown once it carries the BlinkSpot stamp (lib/stamp.ts).
  if (urls.length && stampPending(row.creation_metadata, urls)) return { id: row.id, state: "making", text: STAMP_STATUS, url: null, attempt };
  if (urls.length) return { id: row.id, state: "done", text: null, url: urls[0], attempt };
  if (row.generation_state === "failed") return { id: row.id, state: "failed", text: row.generation_status_text ?? FINAL_FAILURE(0), url: null, attempt };
  return { id: row.id, state: "making", text: row.generation_status_text ?? STATUS.making, url: null, attempt };
}
