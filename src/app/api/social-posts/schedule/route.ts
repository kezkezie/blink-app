import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sendPost } from "@/lib/social-post-server";
import { clientIdMatches, workspaceFor } from "@/lib/brand-access";

/** POST { contentId, clientId, scheduledAt, publishSettings?, captionChoice? }: the signed-in person posts or schedules one post. */
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { contentId, clientId, scheduledAt, publishSettings, captionChoice } = body;
    if (!contentId || !clientId) {
      return NextResponse.json(
        { error: "Missing required parameters: contentId or clientId" },
        { status: 400 }
      );
    }

    // The post's workspace: the caller's own, or the owner's when an editor schedules a shared brand's post.
    const ws = typeof contentId === "string" ? await workspaceFor(user.id, { contentId }) : null;
    if (!ws || !clientIdMatches(clientId, ws)) return NextResponse.json({ error: "Forbidden: Client scope mismatch" }, { status: 403 });
    const out = await sendPost(ws.clientId, { contentId, scheduledAt, publishSettings, captionChoice });
    return NextResponse.json(out.body, { status: out.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[Schedule Route Error]", message);
    return NextResponse.json(
      { error: message || "Internal server error" },
      { status: 500 }
    );
  }
}
