/**
 * What each network accepts (Kezie, 2026-10-27: "we're having an issue with YouTube. We can't be
 * able to post it... and also the calendar planner for scheduling"). PostForMe's results showed
 * every failure was a picture sent to YouTube: "Only videos are supported for YouTube posts".
 * A video post also sent its cover picture instead of the video when it had one.
 * Pure parts, shared by the server (lib/social-post-server.ts) and the studio's platform pickers.
 */

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook", twitter: "X", linkedin: "LinkedIn",
  pinterest: "Pinterest", threads: "Threads", bluesky: "Bluesky",
};
export const platformLabel = (p: string) => PLATFORM_LABEL[p] ?? p;

/** Networks that take videos only. */
export const VIDEO_ONLY = new Set(["youtube"]);
export const VIDEO_ONLY_LINE = "Videos only";

type MediaRow = { video_urls?: unknown; image_urls?: unknown };
const list = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.filter((u): u is string => typeof u === "string" && !!u);
  if (typeof raw === "string" && raw) { try { return list(JSON.parse(raw)); } catch { return [raw]; } }
  return [];
};

/** What a post sends: its video when it has one (never its cover picture), else its pictures. */
export function postMedia(row: MediaRow): { kind: "video" | "image"; urls: string[] } {
  const videos = list(row.video_urls);
  return videos.length ? { kind: "video", urls: videos.slice(0, 1) } : { kind: "image", urls: list(row.image_urls) };
}

/** The platforms this post can go to, and the ones it can't (a picture can't go to YouTube). */
export function platformsFor(platforms: string[], kind: "video" | "image"): { send: string[]; skipped: string[] } {
  const skipped = kind === "video" ? [] : platforms.filter((p) => VIDEO_ONLY.has(p));
  return { send: platforms.filter((p) => !skipped.includes(p)), skipped };
}

/** "YouTube only takes videos" in the words the post page and the calendar show. */
export function skippedLine(skipped: string[], label: (p: string) => string = (p) => p) {
  if (!skipped.length) return "";
  const names = skipped.map(label).join(" and ");
  return `${names} ${skipped.length > 1 ? "were" : "was"} skipped: ${skipped.length > 1 ? "they only take" : "it only takes"} videos, and this post is a picture.`;
}

/**
 * A YouTube title from the caption: the first line with words, no hashtags or angle brackets
 * (YouTube refuses < and >), at most 100 characters, ending on a whole word.
 */
export function youtubeTitle(caption: string | null | undefined, fallback = "New video") {
  const line = (caption ?? "").split(/\n+/).map((l) => l.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim()).find((l) => /[\p{L}\p{N}]/u.test(l)) ?? "";
  if (!line) return fallback;
  if (line.length <= 100) return line;
  const cut = line.slice(0, 100);
  const at = cut.lastIndexOf(" ");
  return (at > 40 ? cut.slice(0, at) : cut).replace(/[,;:\-–]+$/, "").trim();
}

/**
 * Realistic AI video gets YouTube's "altered or synthetic content" label (YouTube asks for it, and
 * our Acceptable Use Policy says to label AI where a platform requires it). Motion graphics, the
 * owner's uploads and editor exports don't.
 */
const AI_VIDEO = /kling|seedance|p-video|pruna|veo|sora|gemini|omni|wan|hailuo|runway|luma|lip-?sync|^auto$/i;
export const isAiVideo = (aiModel: string | null | undefined) => !!aiModel && AI_VIDEO.test(aiModel);

/** One network's outcome, kept on the post (creation_metadata.post_results, from PostForMe's webhook). */
export type PostResult = { platform: string; ok: boolean; error?: string; url?: string; at: string };

/** The results kept on a post (latest first), only those for its latest send. */
export function postResults(row: { creation_metadata?: unknown; postforme_tracking_id?: string | null }): PostResult[] {
  const meta = (row.creation_metadata && typeof row.creation_metadata === "object" ? row.creation_metadata : {}) as { post_results?: unknown; post_sent?: { id?: unknown } };
  if (!meta.post_results || typeof meta.post_results !== "object") return [];
  if (meta.post_sent?.id && row.postforme_tracking_id && meta.post_sent.id !== row.postforme_tracking_id) return [];
  return Object.values(meta.post_results as Record<string, PostResult>)
    .filter((r) => r && typeof r.platform === "string" && typeof r.ok === "boolean")
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** A failure as people read it: PostForMe's prefix off, the reason kept. */
export function resultLine(r: PostResult, label: (p: string) => string = (p) => p) {
  const why = (r.error ?? "").replace(/^Failed to post to [^:]+:\s*/i, "").trim();
  return `${label(r.platform)} didn't post${why ? `: ${why}` : "."}`;
}

/** The post's status once its results are in: posted if any network took it, failed if every one refused. */
export function statusFromResults(results: PostResult[], expected: number): "posted" | "failed" | null {
  if (results.some((r) => r.ok)) return "posted";
  return results.length >= Math.max(1, expected) ? "failed" : null;
}
