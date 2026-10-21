"use client";

import posthog from "posthog-js";

/**
 * Product events for PostHog (2026-10-20). One place for the names, so funnels stay stable:
 * sign-up → brand → first post → connected account → scheduled → paid. Never throws, never sends
 * prompts, captions or other content (only what was used, its size and its price).
 */
export type BlinkEvent =
  | "brand_created" | "image_started" | "video_started" | "motion_planned" | "motion_made" | "site_page_started"
  | "ask_sent" | "ai_erase_used" | "photo_mapped" | "outline_used" | "post_scheduled" | "account_connect_started" | "account_connect_result"
  | "checkout_started" | "tour_finished" | "tour_skipped" | "guide_searched" | "getting_started_clicked";

export function track(event: BlinkEvent, props: Record<string, string | number | boolean | null | undefined> = {}) {
  try {
    if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.capture(event, props);
  } catch { /* analytics never gets in the way */ }
}
