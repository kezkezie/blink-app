import { supabaseAdmin } from "@/lib/supabase-server";
import { runAssistantTool, quoteImage, quoteVideo, VIDEO_QUALITY } from "@/lib/assistant/tools";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";
import { MOTION_CREDITS } from "@/lib/motion/spec";
import { SITE_PAGE_CREDITS } from "@/lib/sites/code";
import { PLAN_CREDITS as CAROUSEL_PLAN_CREDITS } from "@/lib/carousel";
import { brandAllowed, type KeyScope } from "./keys";
import type { McpTool } from "./protocol";

/**
 * Stage 1 tools (2026-10-20): read the brands, the Library and the calendar, and price things.
 * Nothing here spends credits or posts. The brand, library and schedule reads are Ask BlinkSpot's
 * own (lib/assistant/tools.ts), so the website, Ask and outside agents see the same thing.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARTS = "(sequence_clip,raw_clip,generated_audio,storyboard,story_sequence)";
const brandProp = { brand_id: { type: "string", description: "The brand's id, from list_brands." } };

export function mcpTools(scope: KeyScope): McpTool[] {
  /** The brand this call is about: given and allowed, or the key's only brand. */
  const brandFor = async (args: Record<string, unknown>): Promise<{ id: string } | { error: string }> => {
    let id = typeof args.brand_id === "string" && UUID.test(args.brand_id) ? args.brand_id : null;
    if (!id && scope.brandIds?.length === 1) id = scope.brandIds[0];
    if (!id) return { error: "Say which brand: call list_brands and pass its brand_id." };
    if (!brandAllowed(scope, id)) return { error: "This key isn't allowed to use that brand. The owner can change it in BlinkSpot > Settings > AI connections." };
    const { data } = await supabaseAdmin.from("brand_profiles").select("id").eq("id", id).eq("client_id", scope.clientId).eq("is_active", true).maybeSingle();
    return data ? { id } : { error: "No such brand in this account." };
  };
  const ask = async (tool: string, args: Record<string, unknown>, input: Record<string, unknown> = {}) => {
    const b = await brandFor(args);
    if ("error" in b) return { text: b.error, error: true };
    const out = await runAssistantTool(tool, input, { clientId: scope.clientId, brandId: b.id, tzOffset: typeof args.timezone_offset_minutes === "number" ? args.timezone_offset_minutes : 0 });
    return { text: out.content };
  };

  return [
    {
      name: "list_brands", title: "List brands", readOnly: true,
      description: "The brands this BlinkSpot connection may use: id, name, industry and website. Start here.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        let q = supabaseAdmin.from("brand_profiles").select("id, brand_name, industry, website_url").eq("client_id", scope.clientId).eq("is_active", true).order("created_at");
        if (scope.brandIds) q = q.in("id", scope.brandIds);
        const { data } = await q;
        const brands = (data ?? []).map((b) => ({ id: b.id, name: b.brand_name, industry: b.industry ?? null, website: b.website_url ?? null }));
        return { text: JSON.stringify(brands), data: { brands } };
      },
    },
    {
      name: "get_brand", title: "Read a brand", readOnly: true,
      description: "A brand's profile: name, industry, description, voice, image style, colours, font, website and products. Read it before writing anything for the brand.",
      inputSchema: { type: "object", properties: brandProp, additionalProperties: false },
      run: (args) => ask("get_brand", args),
    },
    {
      name: "search_library", title: "Search the Library", readOnly: true,
      description: "The brand's finished work, newest first: id, type, caption, status, date and a preview link. Optional: kind (image, video, carousel), words to look for in captions, limit (up to 20).",
      inputSchema: { type: "object", properties: { ...brandProp, kind: { type: "string", enum: ["all", "image", "video", "carousel"] }, query: { type: "string", maxLength: 80 }, limit: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false },
      run: async (args) => {
        const b = await brandFor(args);
        if ("error" in b) return { text: b.error, error: true };
        const limit = Math.min(20, Math.max(1, Number(args.limit) || 10));
        let q = supabaseAdmin.from("content").select("id, content_type, caption, status, created_at, image_urls, video_urls, scheduled_at")
          .eq("client_id", scope.clientId).eq("brand_id", b.id).not("content_type", "in", PARTS).order("created_at", { ascending: false }).limit(limit);
        if (args.kind === "video") q = q.in("content_type", ["reel", "video", "story"]);
        if (args.kind === "image") q = q.in("content_type", ["post_image", "post"]);
        if (args.kind === "carousel") q = q.eq("content_type", "carousel");
        if (typeof args.query === "string" && args.query.trim()) q = q.ilike("caption", `%${args.query.trim().replace(/[%_,()]/g, " ").slice(0, 80)}%`);
        const { data } = await q;
        const first = (v: unknown) => (Array.isArray(v) ? v.find((x) => typeof x === "string") : typeof v === "string" ? v : null) ?? null;
        const items = (data ?? []).map((r) => ({
          id: r.id, type: r.content_type, caption: typeof r.caption === "string" ? r.caption.slice(0, 200) : null, status: r.status, created: r.created_at,
          scheduled: r.scheduled_at ?? null, preview: first(r.image_urls) ?? first(r.video_urls), open: `https://www.blinkspot.io/studio/library/${r.id}`,
        }));
        return { text: JSON.stringify(items), data: { items } };
      },
    },
    {
      name: "get_schedule", title: "Read the calendar", readOnly: true,
      description: "The brand's calendar: connected platforms, posts ready to schedule and what is scheduled in the next 30 days. Pass timezone_offset_minutes (e.g. 180 for Nairobi) for local times.",
      inputSchema: { type: "object", properties: { ...brandProp, timezone_offset_minutes: { type: "integer", minimum: -720, maximum: 840 } }, additionalProperties: false },
      run: (args) => ask("get_schedule", args),
    },
    {
      name: "get_credits", title: "Credits and budget", readOnly: true,
      description: "The account's credit balance and plan, and this connection's monthly budget.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const { data } = await supabaseAdmin.from("credit_balances").select("balance").eq("client_id", scope.clientId).maybeSingle();
        const out = { balance: Number(data?.balance ?? 0), connection_monthly_budget: scope.budget, can_spend: scope.permissions.includes("spend") };
        return { text: JSON.stringify(out), data: out };
      },
    },
    {
      name: "get_quote", title: "Price something", readOnly: true,
      description: "What something costs in credits before anyone makes it. kind: image (engine nb2 best, gpt-image-2-text-to-image fast, z-image draft; count), video (quality draft|standard|cinema; seconds; style), motion, website, carousel (slides).",
      inputSchema: { type: "object", properties: {
        kind: { type: "string", enum: ["image", "video", "motion", "website", "carousel"] },
        engine: { type: "string", enum: Object.keys(IMAGE_ENGINE_REGISTRY) }, count: { type: "integer", minimum: 1, maximum: 8 },
        quality: { type: "string", enum: Object.keys(VIDEO_QUALITY) }, seconds: { type: "integer", minimum: 3, maximum: 120 },
        style: { type: "string", enum: ["storytelling", "showcase", "logo_reveal", "ugc", "clothing"] }, slides: { type: "integer", minimum: 2, maximum: 10 },
      }, required: ["kind"], additionalProperties: false },
      run: async (args) => {
        const kind = String(args.kind);
        let out: Record<string, unknown>;
        if (kind === "image") out = quoteImage(typeof args.engine === "string" ? args.engine : "nb2", Math.min(8, Math.max(1, Number(args.count) || 1)));
        else if (kind === "video") {
          const quality = (Object.keys(VIDEO_QUALITY).includes(String(args.quality)) ? args.quality : "standard") as keyof typeof VIDEO_QUALITY;
          out = { ...quoteVideo(quality, Math.min(120, Math.max(3, Number(args.seconds) || 10)), typeof args.style === "string" ? args.style : "storytelling"), note: "Storytelling also renders a start frame per scene (about 18 credits each)." };
        } else if (kind === "motion") out = { credits: MOTION_CREDITS, note: "To plan it; making the video is free." };
        else if (kind === "website") out = { credits: SITE_PAGE_CREDITS, note: "One page; a described change after that is 6." };
        else if (kind === "carousel") { const slides = Math.min(10, Math.max(2, Number(args.slides) || 5)); const img = quoteImage("nb2", slides).credits; out = { credits: CAROUSEL_PLAN_CREDITS + img, plan: CAROUSEL_PLAN_CREDITS, images: img, slides }; }
        else return { text: "kind must be image, video, motion, website or carousel.", error: true };
        return { text: JSON.stringify({ kind, ...out }), data: { kind, ...out } };
      },
    },
  ];
}
