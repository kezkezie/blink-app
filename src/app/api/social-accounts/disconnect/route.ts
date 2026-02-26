import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { accountId } = body;

    const apiKey = process.env.POSTFORME_API_KEY;

    // Tell Post For Me to permanently sever the connection
    const response = await fetch(
      `https://api.postforme.dev/v1/social-accounts/${accountId}/disconnect`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (!response.ok) throw new Error("Failed to disconnect from provider");

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
