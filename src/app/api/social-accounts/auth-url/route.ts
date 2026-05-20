import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ✨ FIXED: Changed 'const' to 'let' so we can safely reassign 'platform'
    let { platform, clientId } = body;

    if (platform === "twitter") {
      platform = "x";
    }

    if (!platform || !clientId) {
      return NextResponse.json(
        { error: "Platform and clientId are required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.POSTFORME_API_KEY;

    if (!apiKey) {
      console.error("Missing POSTFORME_API_KEY environment variable.");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Platform-specific configuration required by PostForMe API
    let platformData: Record<string, any> | undefined = undefined;

    if (platform === "instagram") {
      // Instagram auto-posting MUST use Facebook Login (Business/Creator account required)
      platformData = {
        instagram: { connection_type: "facebook" },
      };
    } else if (platform === "facebook") {
      // Facebook Pages connection — requires page-level permissions
      platformData = {
        facebook: { connection_type: "page" },
      };
    } else if (platform === "linkedin") {
      // LinkedIn organization posting (company pages)
      platformData = {
        linkedin: { connection_type: "organization" },
      };
    }

    // Build the final request payload
    // Use redirect_url_override to guarantee www.blinkspot.io (non-www 307-redirects)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.blinkspot.io";
    const redirectBase = appUrl.replace("http://localhost:3000", "https://www.blinkspot.io");

    const requestBody: any = {
      platform: platform,
      external_id: clientId,
      permissions: ["posts", "feeds"],
      redirect_url_override: `${redirectBase}/dashboard/settings?success=account_connected`,
    };

    // Attach platform_data if it exists
    if (platformData) {
      requestBody.platform_data = platformData;
    }

    // Request the secure OAuth URL from Post For Me
    const response = await fetch(
      "https://api.postforme.dev/v1/social-accounts/auth-url",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Post For Me Error:", data);
      return NextResponse.json(
        { error: data.message || "Failed to generate connection link" },
        { status: response.status }
      );
    }

    // Return the secure URL to the frontend so it can generate the QR code
    return NextResponse.json({ url: data.url });
  } catch (error) {
    console.error("Auth URL Route Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
