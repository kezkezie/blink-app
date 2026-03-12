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

        // 1. Fetch the generated content (Image & Caption) from Supabase
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

        // 2. Fetch the active connected social accounts for this client
        const { data: accounts, error: accountsError } = await supabase
            .from("social_accounts")
            .select("postforme_account_id, platform")
            .eq("client_id", clientId)
            .eq("is_active", true);

        if (accountsError || !accounts || accounts.length === 0) {
            throw new Error("No active social media accounts connected. Please connect an account in Settings.");
        }

        // Extract just the PostForMe IDs to tell the API where to send the post
        const postForMeAccountIds = accounts.map(acc => acc.postforme_account_id);

        // 3. Build the PostForMe API Payload
        // Combining the long caption and hashtags for the final social media text
        const finalCaption = `${content.caption || ""} \n\n${content.hashtags || ""}`.trim();

        const postPayload: any = {
            accounts: postForMeAccountIds,
            content: imageUrls.map(url => ({
                type: "image", // PostForMe automatically handles resizing and format conversion
                url: url
            })),
            caption: finalCaption,
        };

        // If a schedule date was provided, add it. Otherwise, PostForMe publishes instantly.
        if (scheduledAt) {
            postPayload.schedule_for = scheduledAt; // Must be ISO 8601 string
        }

        // 4. Send the POST request to PostForMe
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

        // 5. Update the post status in Supabase
        // Note: We also save the PostForMe tracking ID so we can fetch analytics for this specific post later!
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