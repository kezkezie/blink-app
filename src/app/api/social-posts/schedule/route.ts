import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Maps the frontend format selection → PostForMe post_type string
const FORMAT_TO_POST_TYPE: Record<string, string> = {
  reel:     "reel",
  story:    "story",
  short:    "short",
  carousel: "carousel",
  feed:     "media",
  post:     "media",
  standard: "media",
};

export async function POST(req: Request) {
    try {
        const body = await req.json();
        // publishSettings carries per-platform {enabled, format} from the content detail UI
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
                { error: "PostForMe API key is not configured in your environment variables." },
                { status: 400 }
            );
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { persistSession: false } }
        );

        // 1. Fetch the generated content
        const { data: content, error: contentError } = await supabaseAdmin
            .from("content")
            .select("*")
            .eq("id", contentId)
            .single();

        if (contentError || !content) {
            throw new Error("Content not found in database");
        }

        // 2. Safely parse the media array (image_urls or video_urls)
        let imageUrls: string[] = [];
        const rawImages: any = content.image_urls;
        if (typeof rawImages === "string") {
            try { imageUrls = JSON.parse(rawImages); } catch { imageUrls = [rawImages]; }
        } else if (Array.isArray(rawImages)) {
            imageUrls = rawImages;
        } else if (rawImages) {
            imageUrls = [rawImages];
        }

        if (imageUrls.length === 0 && content.video_urls) {
            const rawVideos: any = content.video_urls;
            if (typeof rawVideos === "string") {
                try { imageUrls = JSON.parse(rawVideos); } catch { imageUrls = [rawVideos]; }
            } else if (Array.isArray(rawVideos)) {
                imageUrls = rawVideos;
            }
        }

        if (imageUrls.length === 0) {
            throw new Error("No media found to publish");
        }

        // 3. Resolve publishSettings — prefer the live value from the request body,
        //    fall back to what's stored in the DB content record.
        let publishSettings: Record<string, { enabled: boolean; format: string }> = {};

        if (clientPublishSettings && typeof clientPublishSettings === "object" && !Array.isArray(clientPublishSettings)) {
            publishSettings = clientPublishSettings;
        } else {
            const rawPlatforms = content.target_platforms;
            if (typeof rawPlatforms === "string") {
                try {
                    const parsed = JSON.parse(rawPlatforms);
                    if (Array.isArray(parsed)) {
                        parsed.forEach((p: string) => {
                            publishSettings[p.toLowerCase()] = { enabled: true, format: "post" };
                        });
                    } else {
                        Object.keys(parsed).forEach(key => {
                            publishSettings[key.toLowerCase()] = parsed[key];
                        });
                    }
                } catch { /* ignore */ }
            } else if (rawPlatforms && typeof rawPlatforms === "object") {
                if (Array.isArray(rawPlatforms)) {
                    (rawPlatforms as string[]).forEach(p => {
                        publishSettings[p.toLowerCase()] = { enabled: true, format: "post" };
                    });
                } else {
                    Object.keys(rawPlatforms).forEach(key => {
                        publishSettings[key.toLowerCase()] = (rawPlatforms as any)[key];
                    });
                }
            }
        }

        const activePlatforms = Object.keys(publishSettings).filter(p => publishSettings[p]?.enabled);

        if (activePlatforms.length === 0) {
            throw new Error("No target platforms selected. Go to Content details and select at least one platform.");
        }

        // 4. Fetch active social account IDs for this client
        const { data: allActiveAccounts, error: accountsError } = await supabaseAdmin
            .from("social_accounts")
            .select("postforme_account_id, platform")
            .eq("client_id", clientId)
            .eq("is_active", true);

        if (accountsError || !allActiveAccounts || allActiveAccounts.length === 0) {
            throw new Error("No active social connections found. Check Settings → Social Accounts.");
        }

        const matchedAccounts = allActiveAccounts.filter(acc =>
            activePlatforms.includes(acc.platform.toLowerCase())
        );

        if (matchedAccounts.length === 0) {
            throw new Error(`No connected accounts found for: ${activePlatforms.join(", ")}. Connect them in Settings.`);
        }

        const finalCaption = `${content.caption || ""}\n\n${content.hashtags || ""}`.trim();

        // 5. Upload media to PostForMe (required 2-step process)
        const mediaIds: string[] = [];
        for (const url of imageUrls) {
            const uploadRes = await fetch("https://api.postforme.dev/v1/media/upload/url", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({ url }),
            });

            if (!uploadRes.ok) {
                const errText = await uploadRes.text();
                console.error("PostForMe Media Upload Error:", errText);
                throw new Error("Failed to upload media to PostForMe. Make sure the media URL is publicly accessible.");
            }

            const uploadData = await uploadRes.json();
            if (uploadData.id) mediaIds.push(uploadData.id);
        }

        if (mediaIds.length === 0) {
            throw new Error("No valid media IDs returned by PostForMe.");
        }

        // 6. Group accounts by their post_type so each format gets its own API call.
        //    e.g. Instagram Reel + TikTok Story = two separate PostForMe calls.
        const groupsByPostType: Record<string, string[]> = {};

        for (const acc of matchedAccounts) {
            const platform = acc.platform.toLowerCase();
            const format = publishSettings[platform]?.format || "post";
            const postType = FORMAT_TO_POST_TYPE[format] || "media";

            if (!groupsByPostType[postType]) groupsByPostType[postType] = [];
            groupsByPostType[postType].push(acc.postforme_account_id);
        }

        // 7. Fire one PostForMe request per format group
        let lastResultId: string | null = null;
        const postResults: any[] = [];

        let scheduledIso: string | undefined;
        if (scheduledAt) {
            const dateObj = new Date(scheduledAt);
            if (isNaN(dateObj.getTime())) {
                return NextResponse.json(
                    { error: "Invalid scheduledAt format. Must be a valid date/time." },
                    { status: 400 }
                );
            }
            scheduledIso = dateObj.toISOString();
        }

        for (const [postType, accountIds] of Object.entries(groupsByPostType)) {
            const postPayload: any = {
                media: mediaIds,
                caption: finalCaption,
                social_accounts: accountIds,
                post_type: postType,
            };

            if (scheduledIso) postPayload.scheduled_at = scheduledIso;

            console.log(`PostForMe [${postType}] → accounts: ${accountIds.join(", ")}`, JSON.stringify(postPayload, null, 2));

            const response = await fetch("https://api.postforme.dev/v1/social-posts", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify(postPayload),
            });

            const responseText = await response.text();
            let resultData: any;
            try {
                resultData = JSON.parse(responseText);
            } catch {
                throw new Error(`PostForMe server error (${postType}): ${responseText.substring(0, 80)}`);
            }

            if (!response.ok) {
                console.error(`PostForMe [${postType}] error:`, resultData);
                throw new Error(resultData.message || resultData.error || `Failed to publish as ${postType}`);
            }

            postResults.push(resultData);
            if (resultData.id) lastResultId = resultData.id;
        }

        // 8. Update content status in Supabase
        await supabaseAdmin
            .from("content")
            .update({
                status: scheduledAt ? "approved" : "posted",
                postforme_tracking_id: lastResultId,
            } as any)
            .eq("id", contentId);

        return NextResponse.json({
            success: true,
            message: scheduledAt ? "Post scheduled successfully" : "Post published successfully",
            data: postResults,
        });

    } catch (error: any) {
        console.error("Schedule Route Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
