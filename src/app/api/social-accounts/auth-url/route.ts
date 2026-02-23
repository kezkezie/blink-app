import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { platform, clientId } = await request.json();

    if (!platform || !clientId) {
      return NextResponse.json(
        { error: "Missing platform or client ID" },
        { status: 400 }
      );
    }

    // The URL where Post For Me should send the user AFTER they log in successfully.
    // We include the clientId so we know whose account to update in the database!
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUrl = `${baseUrl}/api/social-accounts/callback?client_id=${clientId}&platform=${platform}`;

    // Based on your api-1 postformedocs.json
    const POST_FOR_ME_API_URL =
      "https://api.postforme.dev/v1/social-accounts/auth-url";

    const response = await fetch(POST_FOR_ME_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_POSTFORME_API_KEY}`,
      },
      body: JSON.stringify({
        platform: platform,
        redirect_url_override: redirectUrl, // Using the exact key from the docs
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Post For Me Error:", data);
      return NextResponse.json(
        { error: data.message || "Failed to generate connection link" },
        { status: response.status }
      );
    }

    // Returns { url: "https://..." }
    return NextResponse.json({ url: data.url });
  } catch (error) {
    console.error("Auth URL Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
