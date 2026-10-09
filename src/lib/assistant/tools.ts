/**
 * Ask BlinkSpot: the tools the in-app assistant can use (IDEA 003).
 *
 * The assistant never spends credits and never publishes. It reads the account (brand, library,
 * balance, prices) and PROPOSES actions; each proposal becomes a button that opens the right studio
 * already filled in, showing the price, and the user presses Generate there. Every read is scoped to
 * the signed-in client and the brand they have open.
 */
import { supabaseAdmin } from "@/lib/supabase-server";
import { estimateVideoCredits, resolveEffectiveVideoModel, resolveVideoModel } from "@/lib/video-model-registry";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";

export type AssistantAction = {
  kind: "open_video_studio" | "open_image_studio" | "open_page";
  label: string;
  href: string;
  estimatedCredits?: number;
  note?: string;
};

export type ToolContext = { clientId: string; brandId: string | null };
export type ToolResult = { content: string; action?: AssistantAction };

const VIDEO_STYLES = ["storytelling", "showcase", "logo_reveal", "ugc", "clothing"] as const;
type VideoStyle = (typeof VIDEO_STYLES)[number];
const ASPECTS = ["9:16", "16:9", "1:1", "4:5"] as const;

/** Quality tiers shown to users instead of model names. */
export const VIDEO_QUALITY: Record<"draft" | "standard" | "cinema", { model: string; label: string }> = {
  draft: { model: "replicate:prunaai/p-video", label: "Draft" },
  standard: { model: "bytedance/seedance-2", label: "Standard" },
  cinema: { model: "bytedance/seedance-2-5", label: "Cinema 1080p" },
};

const PAGES: Record<string, { href: string; label: string }> = {
  library: { href: "/studio/library", label: "Open Library" },
  upload: { href: "/studio/library/upload", label: "Upload media" },
  plan: { href: "/studio/plan", label: "Open the calendar" },
  approvals: { href: "/studio/plan/approvals", label: "Open approvals" },
  analytics: { href: "/studio/plan/analytics", label: "Open analytics" },
  brand: { href: "/studio/brand", label: "Open Brand" },
  billing: { href: "/studio/account/billing", label: "Open billing" },
  settings: { href: "/studio/account/settings", label: "Open settings" },
};

/** Tool declarations in the Anthropic Messages format (Kie's Claude endpoint uses the same shape). */
export const ASSISTANT_TOOLS = [
  {
    name: "get_brand",
    description: "Read the active brand's profile: name, industry, description, voice, image style, colours, font and website. Call this before writing any prompt so it matches the brand.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_credits",
    description: "Read the account's credit balance and plan.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_library",
    description: "List the brand's most recent finished work (newest first): id, type, caption, status, date.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["all", "video", "image"], description: "Filter by media kind." },
        limit: { type: "integer", minimum: 1, maximum: 12 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "quote_video",
    description: "Price a video before proposing it. Quality draft|standard|cinema (cinema = Seedance 2.5 at 1080p). Returns credits for the whole video.",
    input_schema: {
      type: "object",
      properties: {
        quality: { type: "string", enum: ["draft", "standard", "cinema"] },
        seconds: { type: "integer", minimum: 3, maximum: 120, description: "Total length in seconds (sum of all scenes)." },
        style: { type: "string", enum: [...VIDEO_STYLES] },
      },
      required: ["quality", "seconds"],
      additionalProperties: false,
    },
  },
  {
    name: "quote_image",
    description: "Price images. Engines: nb2 (Nano Banana 2, 4K, best quality), gpt-image-2-text-to-image (fast, good text), z-image (cheapest drafts).",
    input_schema: {
      type: "object",
      properties: {
        engine: { type: "string", enum: Object.keys(IMAGE_ENGINE_REGISTRY) },
        count: { type: "integer", minimum: 1, maximum: 8 },
      },
      required: ["engine"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_video",
    description: "Propose a video. Creates a button that opens Video Studio with the style and brief filled in; the user checks the price and presses Generate. For anything longer than one shot use style 'storytelling' (multi-scene, assembled in the editor) and write the brief as the story concept.",
    input_schema: {
      type: "object",
      properties: {
        style: { type: "string", enum: [...VIDEO_STYLES], description: "storytelling = multi-scene long video; showcase = cinematic product shot; logo_reveal = product reveal; ugc = person talking about the product; clothing = try-on." },
        brief: { type: "string", maxLength: 1200, description: "The concept (storytelling) or the shot prompt (single shot), written for the brand." },
        seconds: { type: "integer", minimum: 3, maximum: 120 },
        aspect_ratio: { type: "string", enum: [...ASPECTS] },
        quality: { type: "string", enum: ["draft", "standard", "cinema"] },
      },
      required: ["style", "brief"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_image",
    description: "Propose an image or poster. Creates a button that opens Image Studio with the idea filled in.",
    input_schema: {
      type: "object",
      properties: {
        idea: { type: "string", maxLength: 1000 },
        engine: { type: "string", enum: Object.keys(IMAGE_ENGINE_REGISTRY) },
        count: { type: "integer", minimum: 1, maximum: 4 },
      },
      required: ["idea"],
      additionalProperties: false,
    },
  },
  {
    name: "open_page",
    description: "Offer a button to a page: library, upload, plan (calendar), approvals, analytics, brand, billing, settings.",
    input_schema: {
      type: "object",
      properties: { page: { type: "string", enum: Object.keys(PAGES) } },
      required: ["page"],
      additionalProperties: false,
    },
  },
] as const;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" ? Math.round(v) : Number.NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : fallback;

/** Whole-video price at a quality tier (model named small, the number is what matters). */
export function quoteVideo(quality: keyof typeof VIDEO_QUALITY, seconds: number, style: string) {
  const tier = VIDEO_QUALITY[quality];
  const modelId = resolveEffectiveVideoModel(tier.model, style);
  const credits = estimateVideoCredits(modelId, seconds, { videoMode: style, hasStartFrame: true }) ?? 0;
  const spec = resolveVideoModel(modelId);
  return { credits, model: spec?.label ?? modelId, perSecond: spec?.creditsPerSecond ?? null };
}

export function quoteImage(engine: string, count: number) {
  const spec = IMAGE_ENGINE_REGISTRY[engine] ?? IMAGE_ENGINE_REGISTRY.nb2;
  return { credits: spec.creditCost * count, perImage: spec.creditCost, engine: spec.engine };
}

/**
 * Prices and account facts the model gets up front, so a typical request ("plan a 20 s video")
 * takes two model turns instead of four. Measured on Kie at ~75 s per turn, that matters.
 */
export function priceSheet() {
  const rows = [5, 10, 20, 30].map((sec) => {
    const q = (k: keyof typeof VIDEO_QUALITY) => quoteVideo(k, sec, "showcase").credits;
    return `${sec}s: draft ${q("draft")}, standard ${q("standard")}, cinema ${q("cinema")}`;
  });
  const images = Object.values(IMAGE_ENGINE_REGISTRY).map((e) => `${e.engine} ${e.creditCost}`).join(", ");
  return `Video credits (whole video, before start frames; storytelling adds ~18 per scene for its start frame): ${rows.join("; ")}.\nImage credits per image: ${images}.`;
}

export async function loadAccountBrief(ctx: ToolContext): Promise<string> {
  const [brand, balance] = await Promise.all([
    ctx.brandId ? runAssistantTool("get_brand", {}, ctx) : Promise.resolve({ content: "No brand is open." }),
    runAssistantTool("get_credits", {}, ctx),
  ]);
  return `Active brand (already loaded, no need to call get_brand): ${brand.content}\nAccount (already loaded, no need to call get_credits): ${balance.content}\n${priceSheet()}`;
}

export async function runAssistantTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case "get_brand": {
      if (!ctx.brandId) return { content: "No brand is open. Ask the user to pick or create a brand (brand switcher, top right)." };
      const { data } = await supabaseAdmin
        .from("brand_profiles")
        .select("brand_name, company_name, industry, description, brand_voice, image_style, primary_color, secondary_color, primary_font, website_url")
        .eq("id", ctx.brandId)
        .eq("client_id", ctx.clientId)
        .eq("is_active", true)
        .maybeSingle();
      return { content: data ? JSON.stringify(data) : "Brand not found." };
    }
    case "get_credits": {
      const [{ data: bal }, { data: client }] = await Promise.all([
        supabaseAdmin.from("credit_balances").select("balance").eq("client_id", ctx.clientId).maybeSingle(),
        supabaseAdmin.from("clients").select("plan_tier").eq("id", ctx.clientId).maybeSingle(),
      ]);
      return { content: JSON.stringify({ balance: bal?.balance ?? 0, plan: client?.plan_tier ?? "free" }) };
    }
    case "list_library": {
      if (!ctx.brandId) return { content: "No brand is open." };
      const kind = oneOf(input.kind, ["all", "video", "image"] as const, "all");
      const limit = int(input.limit, 1, 12, 8);
      let q = supabaseAdmin
        .from("content")
        .select("id, content_type, caption, status, created_at")
        .eq("client_id", ctx.clientId)
        .eq("brand_id", ctx.brandId)
        .not("content_type", "in", "(sequence_clip,raw_clip,generated_audio,storyboard)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (kind === "video") q = q.in("content_type", ["reel", "video", "story_sequence", "story"]);
      if (kind === "image") q = q.in("content_type", ["post_image", "carousel", "post"]);
      const { data } = await q;
      const rows = (data ?? []).map((r) => ({ ...r, caption: str(r.caption, 140) }));
      return { content: JSON.stringify(rows) };
    }
    case "quote_video": {
      const quality = oneOf(input.quality, ["draft", "standard", "cinema"] as const, "standard");
      const seconds = int(input.seconds, 3, 120, 10);
      const style = oneOf(input.style, VIDEO_STYLES, "storytelling");
      return { content: JSON.stringify({ quality, seconds, ...quoteVideo(quality, seconds, style), note: "Storytelling also renders a start frame per scene (about 18 credits each)." }) };
    }
    case "quote_image": {
      const engine = oneOf(input.engine, Object.keys(IMAGE_ENGINE_REGISTRY), "nb2");
      return { content: JSON.stringify(quoteImage(engine, int(input.count, 1, 8, 1))) };
    }
    case "propose_video": {
      const style = oneOf(input.style, VIDEO_STYLES, "storytelling") as VideoStyle;
      const brief = str(input.brief, 1200);
      if (!brief) return { content: "A brief is required." };
      const seconds = int(input.seconds, 3, 120, style === "storytelling" ? 20 : 5);
      const aspect = oneOf(input.aspect_ratio, ASPECTS, style === "ugc" ? "9:16" : "16:9");
      const quality = oneOf(input.quality, ["draft", "standard", "cinema"] as const, "standard");
      const quote = quoteVideo(quality, seconds, style);
      const scenes = style === "storytelling" ? Math.max(1, Math.round(seconds / 5)) : 0;
      const estimatedCredits = quote.credits + scenes * 18;
      const params = new URLSearchParams({ mode: style, brief, aspect, from: "ask" });
      return {
        content: `Proposal shown to the user as a button. Estimated ${estimatedCredits} credits (${VIDEO_QUALITY[quality].label}, ${seconds}s${scenes ? `, ${scenes} scenes` : ""}). Nothing has been spent.`,
        action: {
          kind: "open_video_studio",
          label: style === "storytelling" ? "Open the scene planner" : "Open Video Studio",
          href: `/studio/video?${params}`,
          estimatedCredits,
          note: `${VIDEO_QUALITY[quality].label} · ${seconds}s · ${aspect}`,
        },
      };
    }
    case "propose_image": {
      const idea = str(input.idea, 1000);
      if (!idea) return { content: "An idea is required." };
      const engine = oneOf(input.engine, Object.keys(IMAGE_ENGINE_REGISTRY), "nb2");
      const quote = quoteImage(engine, int(input.count, 1, 4, 1));
      const params = new URLSearchParams({ prompt: idea, from: "ask" });
      return {
        content: `Proposal shown to the user as a button. About ${quote.credits} credits. Nothing has been spent.`,
        action: { kind: "open_image_studio", label: "Open Image Studio", href: `/studio/image?${params}`, estimatedCredits: quote.credits, note: `${quote.perImage} credits per image` },
      };
    }
    case "open_page": {
      const page = PAGES[oneOf(input.page, Object.keys(PAGES), "library")];
      return { content: "Button shown.", action: { kind: "open_page", label: page.label, href: page.href } };
    }
    default:
      return { content: `Unknown tool: ${name}` };
  }
}
