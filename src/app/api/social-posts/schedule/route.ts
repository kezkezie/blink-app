import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// FORMAT_TO_POST_TYPE maps user-selected format → PostForMe post type.
// All formats currently resolve to "media" — Quickstart Projects block placement routing.
// TODO: Uncomment format placement routing once we upgrade from PostForMe Quickstart API tier.
const FORMAT_TO_POST_TYPE: Record<string, string> = {
  post:     "media",
  feed:     "media",
  standard: "media",
  // reel:     "reels",    // TODO: Uncomment when upgraded from Quickstart API tier
  // story:    "stories",  // TODO: Uncomment when upgraded from Quickstart API tier
  // short:    "short",    // TODO: Uncomment when upgraded from Quickstart API tier
  // carousel: "carousel", // TODO: Uncomment when upgraded from Quickstart API tier
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { contentId, clientId, scheduledAt, publishSettings: clientPublishSettings } = body;

    const apiKey = process.env.POSTFORME_API_KEY || process.env.NEXT_PUBLIC_POSTFORME_API_KEY;

    if (!contentId || !clientId) {
      return NextResponse.json(
        { error: "Missing required parameters: contentId or clientId" },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "PostForMe API key is not configured." },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: clientOwner } = await supabaseAdmin
      .from("clients").select("id").eq("user_id", user.id).eq("id", clientId).single();
    if (!clientOwner) return NextResponse.json({ error: "Forbidden: Client scope mismatch" }, { status: 403 });

    // 1. Fetch the content row
    const { data: content, error: contentError } = await supabaseAdmin
      .from("content")
      .select("*")
      .eq("id", contentId)
      .single();

    if (contentError || !content) {
      throw new Error("Content not found in database");
    }

    // 2. Collect media URLs (image_urls first, then video_urls)
    const parseJsonArray = (raw: any): string[] => {
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
      publishSettings = clientPublishSettings;
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
        publishSettings = raw as any;
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
      .select("postforme_account_id, platform")
      .eq("client_id", clientId)
      .eq("is_active", true);

    if (!allAccounts || allAccounts.length === 0) {
      throw new Error(
        "No active social accounts found. Connect platforms in Settings."
      );
    }

    const matchedAccounts = allAccounts.filter((acc) =>
      activePlatforms.includes(acc.platform.toLowerCase())
    );

    if (matchedAccounts.length === 0) {
      throw new Error(
        `No connected accounts found for: ${activePlatforms.join(", ")}. Connect them in Settings.`
      );
    }

    // Guard: strip nulls and deduplicate — same account may appear for multiple brands
    const accountIds = [...new Set(
      matchedAccounts.map((a) => a.postforme_account_id).filter(Boolean)
    )];

    if (accountIds.length === 0) {
      throw new Error(
        "Connected accounts are missing PostForMe IDs. Open Settings and press Sync Accounts, then try again."
      );
    }

    // 5. Build the caption — Instagram hard limit is 2200 chars
    const rawCaption = [content.caption || "", content.hashtags || ""]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n\n");
    const finalCaption = rawCaption.substring(0, 2200);

    if (!finalCaption) {
      return NextResponse.json(
        { error: "Caption is required. Add a caption to this post before publishing." },
        { status: 400 }
      );
    }

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

    const postPayload: Record<string, unknown> = {
      social_accounts: accountIds,
      caption: finalCaption,
      media: mediaUrls.map((url) => ({ url: ensureJpeg(url) })),
    };

    // Validate and attach scheduled_at
    if (scheduledAt) {
      const dateObj = new Date(scheduledAt);
      if (isNaN(dateObj.getTime())) {
        return NextResponse.json(
          { error: "Invalid scheduledAt format. Must be a valid ISO datetime." },
          { status: 400 }
        );
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
    let pfmData: any;
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
      return NextResponse.json({ error: msg, pfmRaw: pfmData }, { status: pfmRes.status });
    }

    // 9. Update content status
    await supabaseAdmin
      .from("content")
      .update({
        status: scheduledAt ? "approved" : "posted",
        postforme_tracking_id: pfmData?.id || null,
      } as any)
      .eq("id", contentId);

    return NextResponse.json({
      success: true,
      message: scheduledAt ? "Post scheduled successfully" : "Post published successfully",
      data: pfmData,
    });
  } catch (error: any) {
    console.error("[Schedule Route Error]", error.message);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
