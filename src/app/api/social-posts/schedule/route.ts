import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

        // Use the Admin Service Role Key to safely bypass RLS blocks in the backend
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

        // Safely parse the target platforms
        let targetPlatforms = content.target_platforms || [];
        if (typeof targetPlatforms === 'string') {
            try { targetPlatforms = JSON.parse(targetPlatforms); } catch (e) { targetPlatforms = [targetPlatforms]; }
        }

        if (targetPlatforms.length === 0) {
            throw new Error("No target platforms selected for this post. Go back to Content details and select a platform.");
        }

        // 3. Fetch ONLY the connected accounts that match the user's selection
        const { data: accounts, error: accountsError } = await supabaseAdmin
            .from("social_accounts")
            .select("postforme_account_id, platform")
            .eq("client_id", clientId)
            .eq("is_active", true)
            .in("platform", targetPlatforms);

        if (accountsError || !accounts || accounts.length === 0) {
            throw new Error("Could not find active connections for the selected platforms. Check your Settings.");
        }

        // Extract just the PostForMe IDs
        const postForMeAccountIds = accounts.map(acc => acc.postforme_account_id);

        // 4. Build the PostForMe API Payload
        const finalCaption = `${content.caption || ""} \n\n${content.hashtags || ""}`.trim();

        const postPayload: any = {
            social_accounts: postForMeAccountIds,
            media: imageUrls.map(url => ({
                url: url
            })),
            caption: finalCaption,
        };

        if (scheduledAt) {
            postPayload.scheduled_at = scheduledAt;
        }

        // ✨ FIXED ENDPOINT: Removed the "/v1/" to match PostForMe's official documentation
        const response = await fetch("https://api.postforme.dev/social-posts", {
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
        await supabaseAdmin
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