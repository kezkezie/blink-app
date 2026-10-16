/**
 * Video Inspo links (2026-10-16). Pinterest, TikTok, Instagram, YouTube and Facebook don't let
 * other sites read their videos (their pages load the video by script, for signed-in browsers),
 * so those links get the steps to save the video and drop the file. Anything else must be an
 * actual video file, which the server copies into the user's storage.
 */
export type VideoApp = "pinterest" | "tiktok" | "instagram" | "youtube" | "facebook";

const APPS: Array<{ app: VideoApp; test: RegExp; steps: string }> = [
  { app: "pinterest", test: /(^|\.)pinterest\.[a-z.]+$|(^|\.)pin\.it$/i, steps: "Pinterest doesn't let other sites play its videos. In the Pinterest app, open the pin and tap ⋯ › Download video if it's offered (or screen-record it), then drop the file here." },
  { app: "tiktok", test: /(^|\.)tiktok\.com$/i, steps: "TikTok doesn't let other sites read its videos. In TikTok, tap Share, then Save video, and drop the file here." },
  { app: "instagram", test: /(^|\.)instagram\.com$/i, steps: "Instagram doesn't let other sites read its videos. Save the Reel (or screen-record it), then drop the file here." },
  { app: "youtube", test: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, steps: "YouTube doesn't let other sites read its videos. Download it where you're allowed to (or screen-record it), then drop the file here." },
  { app: "facebook", test: /(^|\.)facebook\.com$|(^|\.)fb\.watch$/i, steps: "Facebook doesn't let other sites read its videos. Save it (or screen-record it), then drop the file here." },
];

/** Why a pasted link can't be used as it is, or null when it's worth fetching. */
export function videoLinkProblem(raw: string): { message: string; app?: VideoApp } | null {
  let url: URL;
  try { url = new URL(raw); } catch { return { message: "Paste a full https link to a video file." }; }
  if (url.protocol !== "https:") return { message: "Paste a full https link to a video file." };
  const app = APPS.find((a) => a.test.test(url.hostname));
  if (app) return { message: app.steps, app: app.app };
  return null;
}

/** MP4/MOV (an "ftyp" box) or WebM (EBML) from a file's first bytes; null for anything else. */
export function videoKindOf(bytes: Uint8Array): { ext: "mp4" | "mov" | "webm"; type: string } | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { ext: "webm", type: "video/webm" };
  if (String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === "ftyp") {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    return brand === "qt  " ? { ext: "mov", type: "video/quicktime" } : { ext: "mp4", type: "video/mp4" };
  }
  return null;
}
