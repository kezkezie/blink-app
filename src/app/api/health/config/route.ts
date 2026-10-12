import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";

/**
 * Which server settings are missing (names only, never values), for the production e2e.
 * Added 2026-10-12: production had no N8N_WEBHOOK_SECRET, so n8n refused every image and the
 * app called it a timeout; NEXT_PUBLIC_APP_URL was missing too, so social connects returned to
 * localhost. Signed-in only.
 */
export const dynamic = "force-dynamic";

const REQUIRED: Array<{ name: string; why: string }> = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", why: "database" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", why: "server database access" },
  { name: "N8N_WEBHOOK_SECRET", why: "images and logos (n8n refuses calls without it)" },
  { name: "OPENAI_API_KEY", why: "captions, transcripts" },
  { name: "ANTHROPIC_API_KEY", why: "Ask BlinkSpot, brand fill, websites" },
  { name: "KIE_API_TOKEN", why: "image and video models" },
  { name: "REPLICATE_API_TOKEN", why: "face swap, some video" },
  { name: "POSTFORME_API_KEY", why: "social accounts and publishing" },
  { name: "NEXT_PUBLIC_APP_URL", why: "links back to the app (social connect, emails)" },
];

export async function GET(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const missing = REQUIRED.filter((r) => !process.env[r.name]?.trim()).map((r) => ({ name: r.name, why: r.why }));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const warnings = process.env.VERCEL_ENV === "production" && /localhost|127\.0\.0\.1/.test(appUrl) ? ["NEXT_PUBLIC_APP_URL points at localhost in production"] : [];
  return NextResponse.json({ ok: missing.length === 0 && warnings.length === 0, missing, warnings }, { headers: { "Cache-Control": "no-store" } });
}
