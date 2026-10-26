import { CHEAPEST_CREDIT_USD, WORST_FEE } from "@/lib/admin";

/**
 * What a stop gives back (Kezie, 2026-10-26: "make sure the stop feature doesn't also take credits
 * from me because my profits will dwindle"). A provider that has started and can't be cancelled
 * (Kie, OpenAI, Anthropic) bills BlinkSpot anyway, so the stop keeps the credits that pay that bill,
 * each valued at the least a credit ever brings in (the biggest pack, after the dearest card fee).
 * The rest comes back. Work cancelled before it ran costs nothing, so all of it comes back.
 */
export const NET_CREDIT_USD = CHEAPEST_CREDIT_USD * (1 - WORST_FEE);
/** Pictures, videos, edits and upscales are priced at provider cost: a credit stands for $0.005 (= USD_PER_CREDIT in lib/ai-usage.ts). */
export const AT_COST_USD_PER_CREDIT = 0.005;
/** What the AI steps cost when stopped part-way (the 60-day p90 in ai_usage, 2026-10-26, rounded up). */
export const STOP_COST_USD = { motion: 0.015, reading: 0.025, secondTryPicture: 0.09 } as const;

export function stopSplit(charged: number, providerUsd: number) {
  const kept = Math.max(0, Math.min(charged, Math.ceil(providerUsd / NET_CREDIT_USD - 1e-9)));
  return { kept, back: charged - kept };
}

/** A feature priced at provider cost: its credits are the provider's bill. */
export const atCostSplit = (charged: number) => stopSplit(charged, charged * AT_COST_USD_PER_CREDIT);

/** Captions or shorts: Whisper's price per minute (plus the pick, for shorts). */
export const transcriptionUsd = (seconds: number, shorts: boolean) => (Math.max(1, seconds) / 60) * 0.006 + (shorts ? 0.01 : 0);

/** Voiceover: OpenAI speech's price per character. */
export const voiceoverUsd = (characters: number) => (characters / 1_000_000) * 15;

/** A reading (Video Inspo, Motion Inspo) stopped after it was sent: what it costs (it's charged when done). */
export const readingStopCredits = (cap: number) => Math.min(cap, stopSplit(cap, STOP_COST_USD.reading).kept);
export const readingStoppedMessage = (sent: boolean, cap = 30) =>
  sent ? `Stopped. ${readingStopCredits(cap)} credits paid the AI service, which had already started reading it.` : "Stopped. Nothing was charged.";

/** The line a stop shows. */
export function stopMessage(back: number, kept: number) {
  const n = (x: number) => `${x.toLocaleString("en-US")} credit${x === 1 ? "" : "s"}`;
  if (!kept) return back ? `Stopped. ${n(back)} ${back === 1 ? "is" : "are"} back.` : "Stopped. Nothing was charged.";
  return back ? `Stopped. ${n(back)} back; ${n(kept)} paid the AI service, which had already started.` : `Stopped. The ${n(kept)} paid the AI service, which had already started.`;
}
