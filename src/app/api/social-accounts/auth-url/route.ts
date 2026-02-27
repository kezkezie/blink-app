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

    // Construct platform-specific required data based on the API docs
    let platformData = undefined;

    if (platform === "instagram") {
      platformData = {
        instagram: {
          connection_type: "facebook", // "facebook" is strictly required for auto-posting & analytics
        },
      };
    } else if (platform === "linkedin") {
      platformData = {
        linkedin: {
          connection_type: "organization", // Required when using standard app credentials
        },
      };
    }

    // Build the final request payload
    const requestBody: any = {
      platform: platform,
      external_id: clientId, // This links the social account to the user in your database
      permissions: ["posts", "feeds"], // Requesting feeds so you can pull analytics later
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
