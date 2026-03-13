import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { contentId, clientId, scheduledAt } = body;
        const apiKey = process.env.POSTFORME_API_KEY;

        if (!contentId || !clientId || !apiKey) {
            return NextResponse.json(
                { error: "Missing required parameters or API key" },
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
            try { imageUrls = JSON.parse(rawImages); } catch (e) { }
        } else if (Array.isArray(rawImages)) {
            imageUrls = rawImages;
        }

        if (imageUrls.length === 0) {
            throw new Error("No media found to publish");
        }

        // 3. Safely parse the target platforms
        let targetPlatforms: any = content.target_platforms || [];
        if (typeof targetPlatforms === "string") {
            try { targetPlatforms = JSON.parse(targetPlatforms); } catch (e) { targetPlatforms = [targetPlatforms]; }
        }

        if (!Array.isArray(targetPlatforms) || targetPlatforms.length === 0) {
            throw new Error("No target platforms selected for this post. Go back to Content details and select a platform.");
        }

        // 4. Fetch ONLY the connected accounts
        const { data: accounts, error: accountsError } = await supabaseAdmin
            .from("social_accounts")
            .select("postforme_account_id, platform")
            .eq("client_id", clientId)
            .eq("is_active", true)
            .in("platform", targetPlatforms);

        if (accountsError || !accounts || accounts.length === 0) {
            throw new Error("Could not find active connections for the selected platforms. Check your Settings.");
        }

        const postForMeAccountIds = accounts.map((acc: any) => acc.postforme_account_id);

        const finalCaption = `${content.caption || ""} \n\n${content.hashtags || ""}`.trim();

        // 5. Build Payload with Smart Image/Video detection
        const postPayload: any = {
            social_accounts: postForMeAccountIds,
            media: imageUrls.map((url: string) => {
                // ✨ NEW: Dynamically detect if it is a video so the API doesn't reject it
                const isVideo = url.toLowerCase().match(/\.(mp4|mov|webm)(\?.*)?$/i);
                return {
                    type: isVideo ? "video" : "image",
                    url: url
                };
            }),
            caption: finalCaption,
        };

        if (scheduledAt) {
            postPayload.scheduled_at = scheduledAt;
        }

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
            throw new Error(`PostForMe Server Error: ${responseText.substring(0, 40)}...`);
        }

        if (!response.ok) {
            console.error("PostForMe Publishing Error:", resultData);
            return NextResponse.json(
                { error: resultData.message || resultData.error || "Failed to publish via PostForMe" },
                { status: response.status }
            );
        }

        // 6. Update the post status
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