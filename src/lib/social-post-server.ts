import { createClient } from "@supabase/supabase-js";
import { accountsForPost, cancelPendingPost, pfmApiKey, pickCaption } from "@/lib/social-schedule";

/**
 * Sending one post to Post For Me (2026-10-21: moved out of /api/social-posts/schedule so the MCP's
 * schedule_post uses exactly the same steps). The caller has already checked who may post it:
 * workspaceId is the post's workspace. scheduledAt null publishes now. Answers the route's reply.
 */
// FORMAT_TO_POST_TYPE maps user-selected format → PostForMe post type.
// MVP (Kezie, 2026-10-20): plain posts only, every format goes as "media". Reels, Stories, Shorts and
// placement are the next feature (Post For Me's platform_configurations.<platform>.placement; earlier
// tries on our Quickstart project were refused, so test it on its own before switching it on).
const FORMAT_TO_POST_TYPE: Record<string, string> = {
  post:     "media",
  feed:     "media",
  standard: "media",
  // reel:     "reels",    // TODO: Uncomment when upgraded from Quickstart API tier
  // story:    "stories",  // TODO: Uncomment when upgraded from Quickstart API tier
  // short:    "short",    // TODO: Uncomment when upgraded from Quickstart API tier
  // carousel: "carousel", // TODO: Uncomment when upgraded from Quickstart API tier
};

export type PostReply = { status: number; body: Record<string, unknown> };
const reply = (body: Record<string, unknown>, status: number): PostReply => ({ status, body });

export async function sendPost(workspaceId: string, i: { contentId: string; scheduledAt?: string | null; publishSettings?: unknown; captionChoice?: unknown }): Promise<PostReply> {
  const { contentId, scheduledAt, publishSettings: clientPublishSettings, captionChoice } = i;
  const apiKey = pfmApiKey();
  if (!apiKey) return reply({ error: "PostForMe API key is not configured." }, 500);
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  try {
    // 1. Fetch the content row (it must belong to this account)
    const { data: content, error: contentError } = await supabaseAdmin
      .from("content")
      .select("*")
      .eq("id", contentId)
      .eq("client_id", workspaceId)
      .single();

    if (contentError || !content) {
      throw new Error("Content not found in database");
    }

    // 1b. A real caption first (before cancelling an earlier queued copy), and keep the choice.
    const early = pickCaption(content, captionChoice);
    if (!early.ok) return reply({ error: early.error, code: early.code }, 400);
    if (early.choice !== content.caption_choice) {
      await supabaseAdmin.from("content").update({ caption_choice: early.choice }).eq("id", contentId).eq("client_id", workspaceId);
    }

    // 2. Collect media URLs (image_urls first, then video_urls)
    const parseJsonArray = (raw: unknown): string[] => {
      if (Array.isArray(raw)) return raw.filter(Boolean);
      if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch { return [raw]; }
      }
      return [];
    };

    let mediaUrls: string[] = parseJsonArray(content.image_urls);
    if (mediaUrls.length === 0) {
      mediaUrls = parseJsonArray(content.video_urls);
    }
    if (mediaUrls.length === 0) {
      throw new Error("No media found on this post to publish.");
    }

    // 3. Resolve publishSettings — prefer request body, fall back to DB
    let publishSettings: Record<string, { enabled: boolean; format: string }> = {};

    if (
      clientPublishSettings &&
      typeof clientPublishSettings === "object" &&
      !Array.isArray(clientPublishSettings)
    ) {
      publishSettings = clientPublishSettings as Record<string, { enabled: boolean; format: string }>;
    } else {
      const raw = content.target_platforms;
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach((p: string) => {
              publishSettings[p.toLowerCase()] = { enabled: true, format: "post" };
            });
          } else if (parsed && typeof parsed === "object") {
            publishSettings = parsed;
          }
        } catch { /* ignore */ }
      } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        publishSettings = raw as Record<string, { enabled: boolean; format: string }>;
      }
    }

    const activePlatforms = Object.keys(publishSettings).filter(
      (p) => publishSettings[p]?.enabled
    );

    if (activePlatforms.length === 0) {
      throw new Error(
        "No target platforms selected. Open this post in the Calendar to add platforms."
      );
    }

    // 4. Fetch connected social account IDs
    const { data: allAccounts } = await supabaseAdmin
      .from("social_accounts")
      .select("postforme_account_id, platform, brand_id")
      .eq("client_id", workspaceId)
      .eq("is_active", true);

    if (!allAccounts || allAccounts.length === 0) {
      throw new Error(
        "No active social accounts found. Connect platforms in Settings."
      );
    }

    // Only the accounts connected to this post's brand (deduplicated: one account can serve two brands).
    const accountIds = accountsForPost(allAccounts, activePlatforms, content.brand_id);

    if (accountIds.length === 0) {
      throw new Error(
        `No connected ${activePlatforms.join(", ")} account for this brand. Connect it in Settings (or press Sync Accounts), then try again.`
      );
    }

    // 5. The caption picked in step 1b: the chosen one (long or short), never blank.
    const finalCaption = early.text;

    // 6. Build the PostForMe payload — matches the official docs exactly.
    // platform_configurations (placement) is not supported on Quickstart Projects.
    //
    // Instagram's Graph API silently rejects non-JPEG media (WebP, PNG).
    // Force f_jpg via Cloudinary URL transformation so PostForMe sends a JPEG.
    const ensureJpeg = (url: string): string => {
      if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) return url;
      if (url.includes("f_jpg") || url.includes("f_jpeg")) return url;
      return url.replace("/image/upload/", "/image/upload/f_jpg,q_auto:best/");
    };

    // Our own storage holds PNG and WebP: those get a JPEG copy (lib/image-refs.ts).
    const { jpegForPosting } = await import("@/lib/image-refs");
    const postMedia = await Promise.all(mediaUrls.map(async (url) => (url.includes("res.cloudinary.com") ? ensureJpeg(url) : await jpegForPosting(workspaceId, url))));
    const postPayload: Record<string, unknown> = {
      social_accounts: accountIds,
      caption: finalCaption,
      media: postMedia.map((url) => ({ url })),
    };

    // Validate and attach scheduled_at
    if (scheduledAt) {
      const dateObj = new Date(scheduledAt);
      if (isNaN(dateObj.getTime())) {
        return reply({ error: "Invalid scheduledAt format. Must be a valid ISO datetime." }, 400);
      }
      postPayload.scheduled_at = dateObj.toISOString();
    }

    const resolvedFormats = Object.fromEntries(
      activePlatforms.map((p) => [
        p,
        FORMAT_TO_POST_TYPE[publishSettings[p]?.format ?? "post"] ?? "media",
      ])
    );
    console.log("[PostForMe] Resolved formats:", resolvedFormats);
    console.log("[PostForMe] Account IDs being sent:", accountIds);
    console.log("[PostForMe] Publishing payload:", JSON.stringify(postPayload, null, 2));

    // 7. An earlier PostForMe post for this row that is still waiting is cancelled first, so a
    // moved post (or "publish now instead") can't go out twice.
    const earlier = await cancelPendingPost(apiKey, content.postforme_tracking_id);
    if (earlier.outcome === "published" && earlier.status === "processing") {
      return reply({ error: "This post is being published right now, so it can't be moved." }, 409);
    }
    if (earlier.outcome === "error") {
      return reply({ error: "Couldn't reach PostForMe to move the earlier schedule. Nothing was changed; try again." }, 502);
    }

    // 8. Fire the single PostForMe request
    const pfmRes = await fetch("https://api.postforme.dev/v1/social-posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(postPayload),
    });

    const pfmText = await pfmRes.text();
    let pfmData: { id?: string; message?: string; error?: string; details?: unknown; errors?: unknown; validation_errors?: unknown } & Record<string, unknown>;
    try {
      pfmData = JSON.parse(pfmText);
    } catch {
      throw new Error(`PostForMe returned invalid JSON: ${pfmText.substring(0, 100)}`);
    }

    if (!pfmRes.ok) {
      console.error("[PostForMe] Full error response:", JSON.stringify(pfmData, null, 2));
      const base = pfmData?.message || pfmData?.error || `PostForMe error (${pfmRes.status})`;
      const extra = pfmData?.details || pfmData?.errors || pfmData?.validation_errors;
      const msg = extra ? `${base} — ${JSON.stringify(extra)}` : base;
      // The earlier post was cancelled above; don't leave the row pointing at it.
      if (earlier.outcome === "cancelled") await supabaseAdmin.from("content").update({ postforme_tracking_id: null }).eq("id", contentId).eq("client_id", workspaceId);
      return reply({ error: msg, pfmRaw: pfmData }, pfmRes.status);
    }

    // 9. Update content status
    await supabaseAdmin
      .from("content")
      .update({
        status: scheduledAt ? "approved" : "posted",
        postforme_tracking_id: pfmData?.id || null,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      } as Record<string, unknown>)
      .eq("id", contentId)
      .eq("client_id", workspaceId);

    return reply({
      success: true,
      message: scheduledAt ? "Post scheduled successfully" : "Post published successfully",
      data: pfmData,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[Schedule Route Error]", message);
    return reply({ error: message || "Internal server error" }, 500);
  }
}
