import { NextRequest, NextResponse } from "next/server";
import { authorizeSocialScope } from "@/lib/postforme-route-auth";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    if ([...searchParams.keys()].some((key) => key !== "clientId")) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
    }
    const clientId = searchParams.get("clientId");

    const authorization = await authorizeSocialScope(req, clientId);
    if (!authorization.ok) {
      return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    }

    const apiKey = process.env.POSTFORME_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 500 });
    }

    // Fetch the live list of connected accounts for this specific client
    const response = await fetch(
      `https://api.postforme.dev/v1/social-accounts?external_id=${encodeURIComponent(authorization.scope.clientId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || "Failed to fetch accounts" },
        { status: response.status }
      );
    }

    // Return the array of accounts
    const accounts = Array.isArray(data.data)
      ? data.data.filter((account: { external_id?: unknown }) => account.external_id === authorization.scope.clientId)
      : [];

    return NextResponse.json({ accounts });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
