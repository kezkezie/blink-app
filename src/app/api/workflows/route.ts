// app/api/workflows/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // Get the target workflow path from the URL
    const path = req.nextUrl.searchParams.get("path");
    if (!path)
      return NextResponse.json(
        { error: "Missing workflow path" },
        { status: 400 }
      );

    // Ensure this matches your live n8n URL
    const n8nBaseUrl =
      process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE ||
      "https://n8n.srv1166077.hstgr.cloud/webhook";
    const targetUrl = `${n8nBaseUrl}/${path}`;

    const contentType = req.headers.get("content-type") || "";
    let response;

    if (contentType.includes("multipart/form-data")) {
      // Forward Image Uploads (FormData)
      const formData = await req.formData();
      response = await fetch(targetUrl, {
        method: "POST",
        body: formData,
      });
    } else {
      // Forward Data (JSON)
      const body = await req.json();
      response = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    if (!response.ok) {
      console.error(`n8n responded with status: ${response.status}`);
      return NextResponse.json(
        { error: `n8n error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json().catch(() => ({ success: true }));
    return NextResponse.json(data);
  } catch (error) {
    console.error("Proxy Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
