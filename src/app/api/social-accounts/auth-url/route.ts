import { NextRequest, NextResponse } from "next/server";
import { authorizeSocialScope, hasOnlyKeys } from "@/lib/postforme-route-auth";

const ALLOWED_PLATFORMS = new Set([
  "instagram", "facebook", "linkedin", "tiktok", "youtube", "pinterest", "threads", "bluesky", "x",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!hasOnlyKeys(body, ["platform", "clientId", "brandId"])) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    let { platform } = body;
    const { clientId, brandId } = body;

    if (platform === "twitter") {
      platform = "x";
    }

    if (typeof platform !== "string" || !ALLOWED_PLATFORMS.has(platform)) {
      return NextResponse.json(
        { error: "Invalid platform" },
        { status: 400 }
      );
    }

    const authorization = await authorizeSocialScope(req, clientId, brandId);
    if (!authorization.ok) {
      return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    }

    const apiKey = process.env.POSTFORME_API_KEY;

    if (!apiKey) {
      console.error("Missing POSTFORME_API_KEY environment variable.");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // platform_data is required by PostForMe for Instagram, Facebook, and LinkedIn
    const platformData: Record<string, Record<string, string>> = {};
    if (platform === "instagram") {
      platformData.instagram = { connection_type: "facebook" };
    } else if (platform === "facebook") {
      platformData.facebook = { connection_type: "page" };
    } else if (platform === "linkedin") {
      platformData.linkedin = { connection_type: "organization" };
    }

    // redirect_url is set statically in the PostForMe dashboard (Quickstart Projects block runtime overrides)
    const requestBody: Record<string, unknown> = {
      platform: platform,
      external_id: authorization.scope.clientId,
      permissions: ["posts", "feeds"],
    };

    if (Object.keys(platformData).length > 0) {
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
      return NextResponse.json(
        { error: "Failed to generate connection link" },
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
