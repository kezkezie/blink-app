import { NextRequest, NextResponse } from "next/server";
import { originOf, serverMetadata } from "@/lib/oauth";

/** BlinkSpot's sign-in endpoints for AI apps like Claude (RFC 8414; lib/oauth.ts). */
export function GET(request: NextRequest) {
  return NextResponse.json(serverMetadata(originOf(request)), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } });
}
