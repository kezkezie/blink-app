import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
    try {
        const { contentId, clientId, scheduledAt } = await req.json();
        const apiKey = process.env.POSTFORME_API_KEY;

        if (!contentId || !clientId || !apiKey) {
            return NextResponse.json(
                { error: "Missing required parameters or API key" },
                { status: 400 }
            );
        }

        // 1. Fetch the generated content (Image, Caption, and Selected Platforms)
        const { data: content, error: contentError } = await supabase
            .from("content")
            .select("*")
            .eq("id", contentId)
            .single();

        if (contentError || !content) {
            throw new Error("Content not found in database");
        }

        // Safely parse the image array
        let imageUrls: string[] = [];
        if (typeof content.image_urls === "string") {
            try { imageUrls = JSON.parse(content.image_urls); } catch (e) { }
        } else if (Array.isArray(content.image_urls)) {
            imageUrls = content.image_urls;
        }

        if (imageUrls.length === 0) {
            throw new Error("No images found to publish");
        }

        // 2. Which platforms did the user select?
        const targetPlatforms = content.target_platforms || [];
        if (targetPlatforms.length === 0) {
            throw new Error("No target platforms selected for this post. Go back to Content details and select a platform.");
        }

        // 3. Fetch ONLY the connected accounts that match the user's selection
        const { data: accounts, error: accountsError } = await supabase
            .from("social_accounts")
            .select("postforme_account_id, platform")
            .eq("client_id", clientId)
            .eq("is_active", true)
            .in("platform", targetPlatforms); // ✨ NEW: Filters the query using the user's choices!

        if (accountsError || !accounts || accounts.length === 0) {
            throw new Error("Could not find active connections for the selected platforms. Check your Settings.");
        }

        // Extract just the PostForMe IDs
        const postForMeAccountIds = accounts.map(acc => acc.postforme_account_id);

        // 4. Build the PostForMe API Payload
        const finalCaption = `${content.caption || ""} \n\n${content.hashtags || ""}`.trim();

        const postPayload: any = {
            accounts: postForMeAccountIds,
            content: imageUrls.map(url => ({
                type: "image",
                url: url
            })),
            caption: finalCaption,
        };

        if (scheduledAt) {
            postPayload.schedule_for = scheduledAt; // Must be ISO 8601 string
        }

        // 5. Send the POST request to PostForMe
        const response = await fetch("https://api.postforme.dev/v1/posts", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify(postPayload),
        });

        const resultData = await response.json();

        if (!response.ok) {
            console.error("PostForMe Publishing Error:", resultData);
            return NextResponse.json(
                { error: resultData.message || "Failed to publish via PostForMe" },
                { status: response.status }
            );
        }

        // 6. Update the post status and save the Tracking ID
        await supabase
            .from("content")
            .update({
                status: scheduledAt ? "approved" : "posted",
                postforme_tracking_id: resultData.id || null
            })
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