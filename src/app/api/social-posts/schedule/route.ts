import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { contentId, clientId, scheduledAt } = body;

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

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false }
        });

        // 1. Fetch the generated content
        const { data: content, error: contentError } = await supabaseAdmin
            .from("content")
            .select("*")
            .eq("id", contentId)
            .single();

        if (contentError || !content) {
            throw new Error("Content not found in database");
        }

        // 2. Safely parse the media array
        let imageUrls: string[] = [];
        const rawImages: any = content.image_urls;
        if (typeof rawImages === "string") {
            try { imageUrls = JSON.parse(rawImages); } catch (e) { imageUrls = [rawImages]; }
        } else if (Array.isArray(rawImages)) {
            imageUrls = rawImages;
        } else if (rawImages) {
            imageUrls = [rawImages];
        }

        if (imageUrls.length === 0 && content.video_urls) {
            let rawVideos: any = content.video_urls;
            if (typeof rawVideos === "string") {
                try { imageUrls = JSON.parse(rawVideos); } catch (e) { imageUrls = [rawVideos]; }
            } else if (Array.isArray(rawVideos)) {
                imageUrls = rawVideos;
            }
        }

        if (imageUrls.length === 0) {
            throw new Error("No media found to publish");
        }

        // 3. Parse Platforms
        let publishSettings: Record<string, { enabled: boolean, format: string }> = {};
        const rawPlatforms = content.target_platforms;

        if (typeof rawPlatforms === "string") {
            try {
                const parsed = JSON.parse(rawPlatforms);
                if (Array.isArray(parsed)) {
                    parsed.forEach(p => publishSettings[String(p).toLowerCase()] = { enabled: true, format: "post" });
                } else {
                    Object.keys(parsed).forEach(key => {
                        publishSettings[key.toLowerCase()] = parsed[key];
                    });
                }
            } catch (e) {
                console.warn("Failed to parse target_platforms");
            }
        } else if (typeof rawPlatforms === 'object' && rawPlatforms !== null) {
            if (Array.isArray(rawPlatforms)) {
                rawPlatforms.forEach(p => publishSettings[String(p).toLowerCase()] = { enabled: true, format: "post" });
            } else {
                Object.keys(rawPlatforms).forEach(key => {
                    publishSettings[key.toLowerCase()] = (rawPlatforms as any)[key];
                });
            }
        }

        const activePlatforms = Object.keys(publishSettings).filter(platform => publishSettings[platform]?.enabled);

        if (activePlatforms.length === 0) {
            throw new Error("No target platforms selected for this post. Go back to Content details and select a platform.");
        }

        // 4. Fetch Active Accounts
        const { data: allActiveAccounts, error: accountsError } = await supabaseAdmin
            .from("social_accounts")
            .select("postforme_account_id, platform")
            .eq("client_id", clientId)
            .eq("is_active", true);

        if (accountsError || !allActiveAccounts || allActiveAccounts.length === 0) {
            throw new Error(`Could not find any active social connections. Check your Settings.`);
        }

        const accounts = allActiveAccounts.filter(acc =>
            activePlatforms.includes(acc.platform.toLowerCase())
        );

        if (accounts.length === 0) {
            throw new Error(`Could not find matching active social connections for: ${activePlatforms.join(', ')}.`);
        }

        const finalCaption = `${content.caption || ""} \n\n${content.hashtags || ""}`.trim();

        // 5. ✨ FIX: Match Media Payload to Documentation strictly
        const mediaPayload = imageUrls.map((url: string) => {
            return { url: url };
        });

        // 🚀 THE POSTFORME MAGIC
        const postPayload: any = {
            media: mediaPayload,
            caption: finalCaption,
            // ✨ FIX: Match Accounts Payload strictly (Array of strings, using key 'social_accounts')
            social_accounts: accounts.map((acc: any) => acc.postforme_account_id)
        };

        if (scheduledAt) {
            const dateObj = new Date(scheduledAt);
            if (isNaN(dateObj.getTime())) {
                return NextResponse.json(
                    { error: "Invalid scheduledAt format. Must be a valid date/time." },
                    { status: 400 }
                );
            }
            postPayload.scheduled_at = dateObj.toISOString();
        }

        console.log("Sending Payload to PostForMe:", JSON.stringify(postPayload, null, 2));

        // 6. Send to PostForMe.dev API
        const response = await fetch("https://api.postforme.dev/v1/social-posts", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify(postPayload),
        });

        const responseText = await response.text();
        let resultData;
        try {
            resultData = JSON.parse(responseText);
        } catch (e) {
            console.error("Failed to parse PostForMe response:", responseText);
            throw new Error(`PostForMe Server Error: ${responseText.substring(0, 40)}...`);
        }

        if (!response.ok) {
            console.error("PostForMe Publishing Error:", resultData);
            return NextResponse.json(
                { error: resultData.message || resultData.error || "Failed to publish via PostForMe" },
                { status: response.status }
            );
        }

        // 7. Update the post status in Supabase
        await supabaseAdmin
            .from("content")
            .update({
                status: scheduledAt ? "approved" : "posted",
                postforme_tracking_id: resultData.id || null
            } as any)
            .eq("id", contentId);

        return NextResponse.json({
            success: true,
            message: scheduledAt ? "Post scheduled successfully" : "Post published successfully",
            data: resultData
        });

    } catch (error: any) {
        console.error("Schedule Route Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}