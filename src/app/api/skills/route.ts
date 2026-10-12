import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { BUILTIN_SKILLS, SKILL_LIMITS, parseSkillMarkdown, rawSkillUrl, skillId } from "@/lib/assistant/skills";

/**
 * Ask BlinkSpot skills for this account (2026-10-12): list the built-in ones and your own; add one
 * by pasting it or importing a SKILL.md from a link; switch one off; delete it. A skill only
 * changes how Ask answers for this account; it can't spend credits or publish (Ask can't either).
 */
async function clientFor(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const { data } = await supabaseAdmin.from("clients").select("id").eq("user_id", auth.value).maybeSingle();
  if (!data?.id) return { error: NextResponse.json({ error: "Account not found" }, { status: 404 }) };
  return { clientId: data.id as string };
}

export async function GET(request: NextRequest) {
  const c = await clientFor(request);
  if ("error" in c) return c.error;
  const { data } = await supabaseAdmin.from("assistant_skills").select("id, slug, name, description, body, source_url, enabled, created_at").eq("client_id", c.clientId).order("created_at");
  return NextResponse.json({
    builtin: BUILTIN_SKILLS.map(({ id, name, description, body }) => ({ id, name, description, body })),
    mine: data ?? [],
    limits: SKILL_LIMITS,
  });
}

export async function POST(request: NextRequest) {
  const c = await clientFor(request);
  if ("error" in c) return c.error;
  let body: { url?: unknown; name?: unknown; description?: unknown; body?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const { count } = await supabaseAdmin.from("assistant_skills").select("id", { count: "exact", head: true }).eq("client_id", c.clientId);
  if ((count ?? 0) >= SKILL_LIMITS.perAccount) return NextResponse.json({ error: `That's the limit of ${SKILL_LIMITS.perAccount} skills. Delete one first.` }, { status: 409 });

  let name = typeof body.name === "string" ? body.name.trim() : "";
  let description = typeof body.description === "string" ? body.description.trim() : "";
  let text = typeof body.body === "string" ? body.body.trim() : "";
  let source: string | null = null;
  if (typeof body.url === "string" && body.url.trim()) {
    source = rawSkillUrl(body.url);
    const got = await safeFetchBytes(source, { maxBytes: 100_000, timeoutMs: 10_000 });
    if (!got.ok) return NextResponse.json({ error: "Couldn't read that link. Use a public link to the skill's text (a SKILL.md file or a GitHub page for one)." }, { status: 400 });
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(got.bytes);
    if (raw.includes("\u0000") || /^\s*<(!doctype|html)/i.test(raw)) return NextResponse.json({ error: "That link is a web page, not a skill file. Open the file and use its raw link." }, { status: 400 });
    const parsed = parseSkillMarkdown(raw);
    name = name || parsed.name; description = description || parsed.description; text = parsed.body;
  }
  if (!name || !description || !text) return NextResponse.json({ error: "A skill needs a name, when to use it, and the instructions." }, { status: 400 });
  if (text.length > SKILL_LIMITS.body) return NextResponse.json({ error: `The instructions are too long (${text.length.toLocaleString("en-US")} characters; ${SKILL_LIMITS.body.toLocaleString("en-US")} at most).` }, { status: 400 });

  let slug = skillId(name);
  if (BUILTIN_SKILLS.some((k) => k.id === slug)) slug = `my-${slug}`.slice(0, 40);
  const { data: taken } = await supabaseAdmin.from("assistant_skills").select("slug").eq("client_id", c.clientId).like("slug", `${slug}%`);
  if (taken?.some((t) => t.slug === slug)) slug = `${slug.slice(0, 36)}-${(taken.length + 1).toString()}`;

  const { data, error } = await supabaseAdmin.from("assistant_skills").insert({
    client_id: c.clientId, slug, name: name.slice(0, SKILL_LIMITS.name), description: description.slice(0, SKILL_LIMITS.description), body: text, source_url: source,
  }).select("id, slug, name, description, body, source_url, enabled, created_at").single();
  if (error) return NextResponse.json({ error: "Couldn't save the skill." }, { status: 500 });
  return NextResponse.json({ skill: data });
}

export async function PATCH(request: NextRequest) {
  const c = await clientFor(request);
  if ("error" in c) return c.error;
  let body: { id?: unknown; enabled?: unknown; name?: unknown; description?: unknown; body?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (typeof body.id !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, SKILL_LIMITS.name);
  if (typeof body.description === "string" && body.description.trim()) patch.description = body.description.trim().slice(0, SKILL_LIMITS.description);
  if (typeof body.body === "string" && body.body.trim()) {
    if (body.body.length > SKILL_LIMITS.body) return NextResponse.json({ error: "The instructions are too long." }, { status: 400 });
    patch.body = body.body.trim();
  }
  const { data, error } = await supabaseAdmin.from("assistant_skills").update(patch).eq("id", body.id).eq("client_id", c.clientId).select("id, slug, name, description, body, source_url, enabled, created_at").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  return NextResponse.json({ skill: data });
}

export async function DELETE(request: NextRequest) {
  const c = await clientFor(request);
  if ("error" in c) return c.error;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  await supabaseAdmin.from("assistant_skills").delete().eq("id", id).eq("client_id", c.clientId);
  return NextResponse.json({ ok: true });
}
