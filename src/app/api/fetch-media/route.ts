import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
        return new NextResponse("Missing URL parameter", { status: 400 });
    }

    try {
        const res = await fetch(targetUrl);

        const headers = new Headers();
        headers.set("Content-Type", res.headers.get("Content-Type") || "application/octet-stream");
        headers.set("Content-Length", res.headers.get("Content-Length") || "");
        headers.set("Accept-Ranges", "bytes");
        // ✨ This is the magic line that fixes FFmpeg crashes! ✨
        headers.set("Access-Control-Allow-Origin", "*");

        return new NextResponse(res.body, {
            status: 200,
            headers
        });
    } catch (error) {
        console.error("Proxy fetch error:", error);
        return new NextResponse("Failed to fetch media", { status: 500 });
    }
}