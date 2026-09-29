import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { complete } from "@/lib/llm";

/** Present-but-invalid is a rejection, never a silent truncation. */
function boundedString(value: unknown, max: number, required = true): string | null {
  if (value === undefined || value === null || value === "") return required ? null : "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > max || (required && !trimmed)) return null;
  return trimmed;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    // Every field is interpolated into the model prompt, so each is bounded.
    const companyName = boundedString(body?.companyName, 200);
    const industry = boundedString(body?.industry, 200, false);
    const context = boundedString(body?.context, 500);
    if (companyName === null || industry === null || context === null) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const prompt = `You are an expert brand identity strategist. Your client is "${companyName}", operating in the "${industry || "unspecified"}" industry.
    Please write a professional, high-quality suggestion for their brand's ${context}.
    Keep it concise (1 to 3 sentences max).
    Return ONLY the suggested text. Do not include quotes, markdown, or conversational filler.`;

    const content = await complete({ task: "brandSuggest", system: "You write concise, professional brand copy.", user: prompt });
    return NextResponse.json({ suggestion: content.trim() });
  } catch (error) {
    // Provider error detail is logged server-side only, never returned to the client.
    console.error("AI Suggestion Error:", error);
    return NextResponse.json({ error: "Failed to generate suggestion" }, { status: 500 });
  }
}
