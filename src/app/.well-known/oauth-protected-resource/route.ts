import { NextRequest, NextResponse } from "next/server";
import { originOf, resourceMetadata } from "@/lib/oauth";

/** Where Claude learns how to sign in to BlinkSpot's MCP server (RFC 9728; lib/oauth.ts). */
export function GET(request: NextRequest) {
  return NextResponse.json(resourceMetadata(originOf(request)), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } });
}
