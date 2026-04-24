import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { triggerWorkflow } from '@/lib/workflows';

export async function POST(req: Request) {
    try {
        // 1. Claude sends this JSON payload based on the user's chat
        const body = await req.json();
        const { apiKey, prompt, brandName } = body;

        // 2. Validate the API Key (You would generate these for users in their settings)
        // For now, let's assume you look up the client_id using the apiKey
        const { data: client } = await supabaseAdmin.from('clients').select('id').eq('api_key', apiKey).single();
        if (!client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // 3. Find the brand_id using the brandName Claude extracted
        const { data: brand } = await supabaseAdmin.from('brand_profiles')
            .select('id')
            .eq('client_id', client.id)
            .ilike('brand_name', brandName)
            .single();

        // 4. Create the draft in your `content` table (just like your frontend does)
        const { data: content } = await supabaseAdmin.from('content').insert({
            client_id: client.id,
            brand_id: brand?.id,
            content_type: 'sequence_clip',
            caption: `Agent Request: ${prompt}`,
            status: 'draft',
            ai_model: 'kling-3.0/video'
        }).select('id').single();

        // 5. Fire your n8n Webhook
        await triggerWorkflow("blink-generate-video-v1", {
            client_id: client.id,
            post_id: content?.id,
            user_prompt: prompt,
            video_mode: "standard"
        });

        // 6. Tell Claude it worked!
        return NextResponse.json({
            success: true,
            message: `Video generation started successfully! You can view it in the BlinkSpot dashboard in 5 minutes. Post ID: ${content?.id}`
        });

    } catch (error) {
        return NextResponse.json({ error: "Failed to generate video" }, { status: 500 });
    }
}