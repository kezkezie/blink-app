import { supabaseAdmin } from "@/lib/supabase-server";
import { runAssistantTool, quoteImage, quoteVideo, VIDEO_QUALITY } from "@/lib/assistant/tools";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";
import { MOTION_CREDITS } from "@/lib/motion/spec";
import { SITE_PAGE_CREDITS } from "@/lib/sites/code";
import { PLAN_CREDITS as CAROUSEL_PLAN_CREDITS } from "@/lib/carousel";
import { brandAllowed, type KeyScope } from "./keys";
import type { McpTool, ToolOut } from "./protocol";
import { GENERATE_LOOKS, type GenerateLook } from "@/lib/generate-prompt";
import { NOT_ENOUGH_CREDITS } from "@/lib/credits-meter";
import { updatePosts } from "@/lib/assistant/actions";
import { cancelPendingPost, pfmApiKey } from "@/lib/social-schedule";
import { sendPost } from "@/lib/social-post-server";
import { IMAGE_QUALITY, VIDEO_PLAN, brandPicture, jobStates, makeImages, makeVideo, type Defer } from "./make-server";

/**
 * Stage 1 tools (2026-10-20): read the brands, the Library and the calendar, and price things.
 * Stage 2-3 (2026-10-21, Kezie: "the MCP should do everything, posting, scheduling, images and
 * video"): make images and videos, carousels from Library pictures, captions, and post or schedule,
 * each behind the key's permission (spend, post), its monthly budget, max_credits and an
 * idempotency key. The brand, library and schedule reads are Ask BlinkSpot's
 * own (lib/assistant/tools.ts), so the website, Ask and outside agents see the same thing.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARTS = "(sequence_clip,raw_clip,generated_audio,storyboard,story_sequence)";
const brandProp = { brand_id: { type: "string", description: "The brand's id, from list_brands." } };

const IMAGE_ASPECTS = ["1:1", "4:5", "3:4", "9:16", "16:9"] as const;
const VIDEO_ASPECTS = ["9:16", "16:9", "1:1"] as const;
/** The one format Post For Me's current tier accepts per platform (as the studio sends). */
const DEFAULT_FORMAT: Record<string, string> = { tiktok: "post", instagram: "feed", youtube: "standard" };
const spendProps = {
  max_credits: { type: "integer", minimum: 0, description: "The most this call may cost; it is refused if the price is higher. Get the price from get_quote." },
  idempotency_key: { type: "string", maxLength: 80, description: "Any unique string for this request. The same key within 24 hours returns the first result instead of making (and paying) again." },
};

export function mcpTools(scope: KeyScope, opts: { defer?: Defer } = {}): McpTool[] {
  const defer: Defer = opts.defer ?? ((w) => { void w; });
  const can = (p: "spend" | "post") => scope.permissions.includes(p);
  const NO_SPEND = "This connection can't make things. The owner can turn on \"Can make things\" for it in BlinkSpot > Settings > AI connections.";
  const NO_POST = "This connection can't post. The owner can turn on \"Can post\" for it in BlinkSpot > Settings > AI connections.";
  /** Credits this key committed this month (its budget is per calendar month, UTC). */
  const spentThisMonth = async () => {
    const now = new Date();
    const { data } = await supabaseAdmin.from("mcp_activity").select("credits").eq("key_id", scope.keyId).gte("created_at", new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()).limit(5000);
    return (data ?? []).reduce((n, r) => n + (Number(r.credits) || 0), 0);
  };
  /** Why this spend can't go ahead, or null. */
  const spendProblem = async (credits: number, args: Record<string, unknown>) => {
    if (!can("spend")) return NO_SPEND;
    const max = Number(args.max_credits);
    if (args.max_credits !== undefined && Number.isFinite(max) && credits > max) return `That costs ${credits} credits, more than max_credits (${max}). Check get_quote and ask the user, then try again with a higher max_credits.`;
    const spent = await spentThisMonth();
    if (spent + credits > scope.budget) return `This connection's budget is ${scope.budget} credits a month and ${spent} are used, so a ${credits}-credit job doesn't fit. The owner can raise it in BlinkSpot > Settings > AI connections.`;
    const { data } = await supabaseAdmin.from("credit_balances").select("balance").eq("client_id", scope.clientId).maybeSingle();
    if (Number(data?.balance ?? 0) < credits) return NOT_ENOUGH_CREDITS(credits);
    return null;
  };
  const idem = (args: Record<string, unknown>) => (typeof args.idempotency_key === "string" && args.idempotency_key.trim() ? args.idempotency_key.trim().slice(0, 80) : null);
  /** The earlier result for this idempotency key (24 h), if any. */
  const replay = async (tool: string, args: Record<string, unknown>): Promise<ToolOut | null> => {
    const k = idem(args);
    if (!k) return null;
    const { data } = await supabaseAdmin.from("mcp_activity").select("meta").eq("key_id", scope.keyId).eq("tool", tool).eq("ok", true).filter("meta->>idempotency_key", "eq", k).gte("created_at", new Date(Date.now() - 86_400_000).toISOString()).limit(1).maybeSingle();
    const result = (data?.meta as { result?: unknown } | null)?.result;
    return result ? { text: JSON.stringify({ ...(result as object), replayed: true }), data: { ...(result as object), replayed: true }, meta: { logged: true } } : null;
  };
  /** Spending calls log themselves at once, so the next call's budget check sees them. */
  const record = async (tool: string, brandId: string, credits: number, result: Record<string, unknown>, args: Record<string, unknown>): Promise<ToolOut> => {
    await supabaseAdmin.from("mcp_activity").insert({ key_id: scope.keyId, client_id: scope.clientId, tool, ok: true, brand_id: brandId, credits, meta: { idempotency_key: idem(args), result } });
    return { text: JSON.stringify(result), data: result, meta: { logged: true } };
  };
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

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
    {
      name: "create_image", title: "Make images", readOnly: false,
      description: "Make on-brand images (posters, product shots, lifestyle photos) exactly like BlinkSpot's Generate: the brand's colours, font and logo, an art director's design pass, and the exact words you give drawn on it. They go straight to the Library as drafts. Takes 30-90 seconds: call get_job with the post_ids. quality best (nb2, about 18 credits each), fast, or draft (cheapest, no design pass). picture_post_ids: Library pictures to build on (products, a photo to restyle).",
      inputSchema: { type: "object", properties: {
        ...brandProp,
        brief: { type: "string", minLength: 8, maxLength: 2000, description: "What the image is: the subject, the setting, the offer, the mood." },
        words: { type: "string", maxLength: 200, description: "The exact words to show on the image (headline, price, call to action). Leave out for no words." },
        look: { type: "string", enum: GENERATE_LOOKS.map((l) => l.id), description: "poster (default), studio, lifestyle, cinematic, flatlay, abstract, or plain (your brief as written)." },
        aspect: { type: "string", enum: [...IMAGE_ASPECTS], description: "4:5 (default, feed), 1:1, 3:4, 9:16 (Stories, Reels), 16:9." },
        quality: { type: "string", enum: Object.keys(IMAGE_QUALITY) },
        count: { type: "integer", minimum: 1, maximum: 4 },
        use_logo: { type: "boolean", description: "Put the brand's real logo on it (default true when the brand has one)." },
        picture_post_ids: { type: "array", maxItems: 4, items: { type: "string" } },
        ...spendProps,
      }, required: ["brief"], additionalProperties: false },
      run: async (args) => {
        const again = await replay("create_image", args); if (again) return again;
        const b = await brandFor(args);
        if ("error" in b) return { text: b.error, error: true };
        const brief = str(args.brief, 2000);
        if (brief.length < 8) return { text: "Say what the image is (a few words at least).", error: true };
        if (!scope.userId) return { text: "This connection has no owner on record. Make a new one in Settings.", error: true };
        const quality = (Object.keys(IMAGE_QUALITY).includes(String(args.quality)) ? args.quality : "best") as keyof typeof IMAGE_QUALITY;
        const count = Math.min(4, Math.max(1, Number(args.count) || 1));
        const credits = quoteImage(IMAGE_QUALITY[quality], count).credits;
        const problem = await spendProblem(credits, args);
        if (problem) return { text: problem, error: true };
        const ids = Array.isArray(args.picture_post_ids) ? args.picture_post_ids.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 4) : [];
        const pictures = (await Promise.all(ids.map((id) => brandPicture(scope.clientId, b.id, id)))).filter((u): u is string => !!u);
        if (pictures.length < ids.length) return { text: "One of picture_post_ids isn't a picture in this brand's Library. Use search_library for ids.", error: true };
        const look = (GENERATE_LOOKS.some((l) => l.id === args.look) ? args.look : "poster") as GenerateLook;
        const aspect = (IMAGE_ASPECTS as readonly string[]).includes(String(args.aspect)) ? String(args.aspect) : "4:5";
        const made = await makeImages({ userId: scope.userId, clientId: scope.clientId, brandId: b.id, brief, words: str(args.words, 200) || undefined, look, aspect, quality, count, useLogo: args.use_logo !== false, pictures, defer });
        if (!made.ok) return { text: made.error, error: true };
        return record("create_image", b.id, credits, { post_ids: made.ids, credits, status: "making", next: "Call get_job with these post_ids in about 30 seconds; images usually take 30-90 seconds.", library: made.ids.map((id) => `https://www.blinkspot.io/studio/library/${id}`) }, args);
      },
    },
    {
      name: "create_video", title: "Make a video", readOnly: false,
      description: "Make a short on-brand video clip (4-15 seconds), saved to the Library. Best with start_image_post_id: a Library picture (for example one from create_image) as the first frame, so the clip looks exactly like the brand. BlinkSpot writes the motion prompt in the brand's world. Charged only when the video arrives (get_quote for the price; draft is cheapest, cinema is 1080p). Takes 2-6 minutes: check with get_job. No words appear in AI video: add them in BlinkSpot's video editor.",
      inputSchema: { type: "object", properties: {
        ...brandProp,
        brief: { type: "string", minLength: 8, maxLength: 1200, description: "What happens: subject, action, camera move, mood." },
        seconds: { type: "integer", minimum: 4, maximum: 15 },
        aspect: { type: "string", enum: [...VIDEO_ASPECTS], description: "9:16 (default, Reels and TikTok), 16:9, 1:1." },
        quality: { type: "string", enum: Object.keys(VIDEO_PLAN) },
        start_image_post_id: { type: "string", description: "A Library picture to start from (recommended)." },
        ...spendProps,
      }, required: ["brief"], additionalProperties: false },
      run: async (args) => {
        const again = await replay("create_video", args); if (again) return again;
        const b = await brandFor(args);
        if ("error" in b) return { text: b.error, error: true };
        const brief = str(args.brief, 1200);
        if (brief.length < 8) return { text: "Say what happens in the video.", error: true };
        if (!scope.userId) return { text: "This connection has no owner on record. Make a new one in Settings.", error: true };
        const quality = (Object.keys(VIDEO_PLAN).includes(String(args.quality)) ? args.quality : "standard") as keyof typeof VIDEO_PLAN;
        const seconds = Math.min(15, Math.max(4, Number(args.seconds) || 5));
        const aspect = (VIDEO_ASPECTS as readonly string[]).includes(String(args.aspect)) ? String(args.aspect) : "9:16";
        let startFrame: string | null = null;
        if (typeof args.start_image_post_id === "string") {
          if (!UUID.test(args.start_image_post_id) || !(startFrame = await brandPicture(scope.clientId, b.id, args.start_image_post_id))) return { text: "start_image_post_id isn't a picture in this brand's Library.", error: true };
        }
        const credits = quoteVideo(quality, seconds, "showcase").credits;
        const problem = await spendProblem(credits, args);
        if (problem) return { text: problem, error: true };
        const made = await makeVideo({ userId: scope.userId, clientId: scope.clientId, brandId: b.id, brief, seconds, aspect, quality, startFrame, credits, defer });
        if (!made.ok) return { text: made.error, error: true };
        return record("create_video", b.id, credits, { post_ids: made.ids, credits, charged: "only when the video arrives", status: "making", next: "Call get_job with the post_id in 2-3 minutes; videos take 2-6 minutes.", library: `https://www.blinkspot.io/studio/library/${made.ids[0]}` }, args);
      },
    },
    {
      name: "get_job", title: "Check a job", readOnly: true,
      description: "Where images and videos you started are: making, done (with the file's link and the Library page) or failed (with why; failed jobs are refunded or never charged). Pass post_ids from create_image or create_video.",
      inputSchema: { type: "object", properties: { post_ids: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" } } }, required: ["post_ids"], additionalProperties: false },
      run: async (args) => {
        const ids = (Array.isArray(args.post_ids) ? args.post_ids : []).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 12);
        if (!ids.length) return { text: "Pass post_ids from create_image or create_video.", error: true };
        const jobs = (await jobStates(scope.clientId, scope.brandIds, ids, defer)).map((j) => ({ ...j, ...(j.type === "image" && j.state === "done" ? { edit_in_editor: `https://www.blinkspot.io/studio/image?mode=design&content=${j.id}` } : {}) }));
        if (!jobs.length) return { text: "None of those posts are in this connection's brands.", error: true };
        return { text: JSON.stringify(jobs), data: { jobs } };
      },
    },
    {
      name: "make_carousel", title: "Make a carousel", readOnly: false,
      description: "A carousel post from 2-10 pictures already in the brand's Library, in your order, with its caption. Free. Then schedule_post it.",
      inputSchema: { type: "object", properties: {
        ...brandProp,
        picture_post_ids: { type: "array", minItems: 2, maxItems: 10, items: { type: "string" } },
        caption: { type: "string", maxLength: 2200, description: "The long caption." },
        caption_short: { type: "string", maxLength: 300, description: "The short caption: one or two sentences." },
        hashtags: { type: "string", maxLength: 500 },
      }, required: ["picture_post_ids", "caption"], additionalProperties: false },
      run: async (args) => {
        if (!can("spend")) return { text: NO_SPEND, error: true };
        const b = await brandFor(args);
        if ("error" in b) return { text: b.error, error: true };
        const ids = (Array.isArray(args.picture_post_ids) ? args.picture_post_ids : []).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 10);
        const slides = (await Promise.all(ids.map((id) => brandPicture(scope.clientId, b.id, id)))).filter((u): u is string => !!u);
        if (slides.length < 2 || slides.length < ids.length) return { text: "Give 2-10 picture_post_ids from this brand's Library (search_library kind image).", error: true };
        const caption = typeof args.caption === "string" ? args.caption.trim().slice(0, 2200) : "";
        if (!caption) return { text: "A caption is required.", error: true };
        const tags = typeof args.hashtags === "string" ? args.hashtags.split(/\s+/).filter((t) => /^#[\p{L}\p{N}_]{1,60}$/u.test(t)).slice(0, 30).join(" ") : "";
        const { data, error } = await supabaseAdmin.from("content").insert({
          client_id: scope.clientId, brand_id: b.id, content_type: "carousel", status: "draft", image_urls: slides, caption,
          caption_short: typeof args.caption_short === "string" ? args.caption_short.trim().slice(0, 300) || null : null, hashtags: tags || null, caption_written: true,
          creation_metadata: { operation: "carousel", kind: "pictures", slides: slides.length, via: "mcp" },
        }).select("id").single();
        if (error || !data) return { text: "Couldn't make the carousel.", error: true };
        const out = { post_id: data.id, slides: slides.length, library: `https://www.blinkspot.io/studio/library/${data.id}` };
        return { text: JSON.stringify(out), data: out };
      },
    },
    {
      name: "write_caption", title: "Write a post's captions", readOnly: false,
      description: "Save a post's captions and hashtags: caption (long, 2-3 short paragraphs) and caption_short (one or two sentences, the same message), and which one posts (caption_choice). A post needs a real caption before it can post; new images only have a working title. approve: true also approves it (needs the 'Can post' permission, and only when the user said so).",
      inputSchema: { type: "object", properties: {
        ...brandProp,
        post_id: { type: "string" }, caption: { type: "string", maxLength: 2200 }, caption_short: { type: "string", maxLength: 300 }, hashtags: { type: "string", maxLength: 500 },
        caption_choice: { type: "string", enum: ["long", "short"] }, approve: { type: "boolean" },
      }, required: ["post_id"], additionalProperties: false },
      run: async (args) => {
        if (!can("spend")) return { text: NO_SPEND, error: true };
        if (args.approve === true && !can("post")) return { text: NO_POST, error: true };
        const b = await brandFor(args);
        if ("error" in b) return { text: b.error, error: true };
        if (typeof args.post_id !== "string" || !UUID.test(args.post_id)) return { text: "post_id is required (from search_library or create_image).", error: true };
        const r = await updatePosts({ clientId: scope.clientId, brandId: b.id }, { posts: [{ id: args.post_id, caption: args.caption, caption_short: args.caption_short, hashtags: args.hashtags, approve: args.approve === true }] });
        if (r.error) return { text: r.error, error: true };
        if (args.caption_choice === "long" || args.caption_choice === "short") await supabaseAdmin.from("content").update({ caption_choice: args.caption_choice }).eq("id", args.post_id).eq("client_id", scope.clientId).eq("brand_id", b.id);
        if (!r.changes.length && !args.caption_choice) return { text: "Nothing changed: that post wasn't found in this brand, it already went out, or the captions are the same.", error: true };
        const out = { post_id: args.post_id, saved: r.changes, caption_choice: args.caption_choice ?? null };
        return { text: JSON.stringify(out), data: out };
      },
    },
    {
      name: "schedule_post", title: "Post or schedule", readOnly: false,
      description: "Post a Library post now, or schedule it, on the brand's connected accounts (get_schedule lists them). Only when the user asked for it to go out. when: \"now\" or an ISO date-time at least 5 minutes ahead. platforms: some of the connected ones (default: all connected). caption: long or short (default: the post's choice). A draft needs approve: true. It must have a real caption (write_caption first).",
      inputSchema: { type: "object", properties: {
        ...brandProp, post_id: { type: "string" }, when: { type: "string", description: "now, or e.g. 2026-10-25T09:00:00+03:00" },
        platforms: { type: "array", maxItems: 9, items: { type: "string", enum: ["instagram", "facebook", "tiktok", "youtube", "x", "twitter", "linkedin", "pinterest", "threads", "bluesky"] } },
        caption: { type: "string", enum: ["long", "short"] }, approve: { type: "boolean" },
      }, required: ["post_id", "when"], additionalProperties: false },
      run: async (args) => {
        if (!can("post")) return { text: NO_POST, error: true };
        const b = await brandFor(args);
        if ("error" in b) return { text: b.error, error: true };
        if (typeof args.post_id !== "string" || !UUID.test(args.post_id)) return { text: "post_id is required.", error: true };
        const { data: post } = await supabaseAdmin.from("content").select("id, status, generation_state, target_platforms").eq("id", args.post_id).eq("client_id", scope.clientId).eq("brand_id", b.id).maybeSingle();
        if (!post) return { text: "That post isn't in this brand's Library.", error: true };
        if (post.status === "posted") return { text: "That post already went out.", error: true };
        if (post.generation_state === "generating") return { text: "That post is still being made. Check get_job first.", error: true };
        const now = args.when === "now";
        const at = now ? null : new Date(String(args.when));
        if (!now && (!at || Number.isNaN(at.getTime()))) return { text: "when must be \"now\" or an ISO date-time.", error: true };
        if (at && at.getTime() < Date.now() + 5 * 60_000) return { text: "Pick a time at least 5 minutes from now, or when: \"now\".", error: true };
        if (!["approved", "scheduled"].includes(String(post.status))) {
          if (args.approve !== true) return { text: "This post isn't approved yet. If the user said to post it, call again with approve: true.", error: true };
          await supabaseAdmin.from("content").update({ status: "approved", approved_at: new Date().toISOString(), approved_by: "ai_connection" }).eq("id", post.id).eq("client_id", scope.clientId);
        }
        const { data: accounts } = await supabaseAdmin.from("social_accounts").select("platform").eq("client_id", scope.clientId).eq("brand_id", b.id).eq("is_active", true);
        const connected = [...new Set((accounts ?? []).map((a) => String(a.platform).toLowerCase()))];
        if (!connected.length) return { text: "This brand has no connected social accounts. The owner connects them in BlinkSpot > Settings.", error: true };
        const asked = Array.isArray(args.platforms) ? [...new Set(args.platforms.map((p) => (p === "twitter" ? "x" : String(p))))] : connected;
        const platforms = asked.filter((p) => connected.includes(p));
        if (!platforms.length) return { text: `None of those are connected for this brand. Connected: ${connected.join(", ")}.`, error: true };
        const settings = Object.fromEntries(platforms.map((p) => [p, { enabled: true, format: DEFAULT_FORMAT[p] ?? "post" }]));
        await supabaseAdmin.from("content").update({ target_platforms: settings }).eq("id", post.id).eq("client_id", scope.clientId);
        const sent = await sendPost(scope.clientId, { contentId: post.id, scheduledAt: at ? at.toISOString() : null, publishSettings: settings, ...(args.caption === "long" || args.caption === "short" ? { captionChoice: args.caption } : {}) });
        if (sent.status !== 200) return { text: String(sent.body.error ?? "Couldn't send it."), error: true, meta: { code: sent.body.code ?? null } };
        const out = { post_id: post.id, platforms, ...(at ? { scheduled_for: at.toISOString() } : { posted: "sent; it shows on the platforms within a few minutes" }), calendar: "https://www.blinkspot.io/studio/plan" };
        return { text: JSON.stringify(out), data: out };
      },
    },
    {
      name: "unschedule_post", title: "Take off the calendar", readOnly: false,
      description: "Take a scheduled post off the calendar and cancel it at the platforms. Posts that already went out can't be recalled.",
      inputSchema: { type: "object", properties: { ...brandProp, post_id: { type: "string" } }, required: ["post_id"], additionalProperties: false },
      run: async (args) => {
        if (!can("post")) return { text: NO_POST, error: true };
        const b = await brandFor(args);
        if ("error" in b) return { text: b.error, error: true };
        if (typeof args.post_id !== "string" || !UUID.test(args.post_id)) return { text: "post_id is required.", error: true };
        const { data: post } = await supabaseAdmin.from("content").select("id, status, postforme_tracking_id").eq("id", args.post_id).eq("client_id", scope.clientId).eq("brand_id", b.id).maybeSingle();
        if (!post) return { text: "That post isn't in this brand's Library.", error: true };
        if (post.status === "posted") return { text: "That post already went out; it can't be recalled from here.", error: true };
        const r = await cancelPendingPost(pfmApiKey(), post.postforme_tracking_id as string | null);
        if (r.outcome === "published") return { text: "It's being published right now, so it can't be stopped.", error: true };
        if (r.outcome === "error") return { text: "Couldn't reach the posting service. Nothing changed; try again.", error: true };
        await supabaseAdmin.from("content").update({ scheduled_at: null, postforme_tracking_id: null }).eq("id", post.id).eq("client_id", scope.clientId);
        const out = { post_id: post.id, unscheduled: true };
        return { text: JSON.stringify(out), data: out };
      },
    },
    {
      name: "motion_link", title: "Motion graphics link", readOnly: true,
      description: "Motion graphics (animated titles, numbers that move, explainers, app walkthroughs) render in the user's browser, so this gives a link that opens BlinkSpot's Motion graphics page with your brief filled in. Planning it there costs 4 credits; making it is free. Give the exact words, numbers and prices in the brief.",
      inputSchema: { type: "object", properties: { brief: { type: "string", minLength: 3, maxLength: 600 }, shape: { type: "string", enum: ["9:16", "1:1", "16:9"] } }, required: ["brief"], additionalProperties: false },
      run: async (args) => {
        const brief = str(args.brief, 600);
        if (brief.length < 3) return { text: "Say what the motion is for.", error: true };
        const shape = ["9:16", "1:1", "16:9"].includes(String(args.shape)) ? String(args.shape) : "9:16";
        const out = { link: `https://www.blinkspot.io/studio/motion?shape=${encodeURIComponent(shape)}&brief=${encodeURIComponent(brief)}`, note: "Open it signed in to BlinkSpot with the right brand chosen (top right)." };
        return { text: JSON.stringify(out), data: out };
      },
    },
  ];
}
