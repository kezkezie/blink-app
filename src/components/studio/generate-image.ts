"use client";

import { useEffect, useState } from "react";
import type { BrandDna } from "@/lib/brand-dna";
import { supabase } from "@/lib/supabase";
import { triggerWorkflow } from "@/lib/workflows";
import { useWorkflowStore } from "@/app/store/useWorkflowStore";
import { assemblePrompt, selectCreativeDirection, type BrandContext } from "@/lib/creative-direction";
import { MARKETING_STYLES } from "@/lib/marketing-styles";
import { contactRule } from "@/lib/inspo";
import { validateResearch, type BrandResearch } from "@/lib/brand-research";
import { softenForAi } from "@/lib/ai-safe-text";

/**
 * The studio's one way to make images (Generate and Inspo Remix): the same workflow, billing,
 * refunds and Library rows as the classic Image Studio's synchronous path.
 */

export type BrandKit = BrandContext & { socials?: string; dna?: BrandDna; research?: BrandResearch | null };
export type ImageEngine = "nb2" | "gpt-image-2-text-to-image" | "gpt-image-2-image-to-image" | "z-image";

/** The active brand's identity, as the classic Image Studio loads it. */
export function useBrandKit(brandId: string | null | undefined, fallbackName?: string) {
  const [kit, setKit] = useState<BrandKit | null>(null);
  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    supabase
      .from("brand_profiles")
      .select("brand_name, company_name, website_url, social_urls, description, industry, image_style, brand_voice, logo_url, primary_color, secondary_color, primary_font, dna, research")
      .eq("id", brandId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setKit({
          name: data?.brand_name || data?.company_name || fallbackName,
          industry: data?.industry ?? undefined,
          imageStyle: data?.image_style ?? undefined,
          brandVoice: data?.brand_voice ?? undefined,
          logoUrl: data?.logo_url ?? undefined,
          description: data?.description ?? undefined,
          primaryColor: data?.primary_color ?? undefined,
          secondaryColor: data?.secondary_color ?? undefined,
          primaryFont: data?.primary_font ?? undefined,
          websiteUrl: data?.website_url ?? undefined,
          socials: typeof data?.social_urls === "string" ? data.social_urls : undefined,
          dna: data?.dna && typeof data.dna === "object" ? (data.dna as BrandDna) : undefined,
          research: validateResearch(data?.research),
        });
      });
    return () => { cancelled = true; };
  }, [brandId, fallbackName]);
  return kit;
}

export function brandConstraintFor(kit: BrandKit) {
  const dna = kit.dna ?? {};
  // Contact details the brand gave us (Brand page → Contact) are the only ones allowed on an image.
  const contacts = [kit.socials, dna.whatsapp && `WhatsApp ${dna.whatsapp}`, dna.phone && `phone ${dna.phone}`, dna.email].filter(Boolean).join(", ");
  return [
    `CRITICAL BRAND CONSTRAINT: This content belongs to the brand "${kit.name}".`,
    kit.websiteUrl ? `The website is ${kit.websiteUrl}.` : "",
    // Softened for medical and intimate brands (lib/ai-safe-text): models refuse anatomy words.
    kit.description ? `Brand description: ${softenForAi(kit.description)}.` : "",
    kit.industry ? `Industry: ${kit.industry}.` : "",
    dna.audience ? `It is for: ${softenForAi(dna.audience)}.` : "",
    dna.location ? `Set for ${dna.location}: local people, places and details where it fits.` : "",
    kit.primaryColor ? `Brand colours: ${[kit.primaryColor, kit.secondaryColor].filter(Boolean).join(", ")}.` : "",
    dna.languages?.length ? `Write any on-image text in ${dna.languages.slice(0, 2).join(" or ")}.` : "",
    dna.avoidVisual ? `Never show: ${dna.avoidVisual}.` : "",
    `Do NOT invent fictional brand names, fake website URLs, placeholder logos, or generic company names.`,
    `Any text, signage, labels, or website URLs visible in the image MUST reflect "${kit.name}" only.`,
    contactRule(kit.websiteUrl, contacts || undefined),
  ].filter(Boolean).join(" ");
}

export type GenerateRequest = {
  clientId: string;
  brandId: string;
  kit: BrandKit;
  /** What to make. With `assembledPrompt` set, used only as the short prompt. */
  prompt: string;
  /** A finished prompt (Inspo Remix). Otherwise the Creative Direction engine builds one, as in classic. */
  assembledPrompt?: string;
  references?: string[];
  engine: ImageEngine;
  aspect: string;
  /** A look (lib/generate-prompt) or a classic marketing style; "plain" adds no art direction. */
  style: (typeof MARKETING_STYLES)[number]["id"] | "plain";
  count?: number;
  caption: string;
  /** "edit" changes the reference image itself (face swap, prompt edits) instead of making a new one. */
  mode?: "standard" | "edit";
  /** false for in-between editor steps: return the image without adding it to the Library. */
  save?: boolean;
  /**
   * A technical edit (the Editor's clean plate): the prompt goes as written, with no brand rules,
   * no "keep the text" and no logo, which would fight the instruction (2026-10-13).
   */
  plain?: boolean;
};

const IMAGE_ASPECTS = ["1:1", "4:5", "3:4", "9:16", "16:9", "3:2", "2:3"];
/** The closest aspect the image models accept, for a "w:h" ratio (any numbers, e.g. pixel sizes). */
export function nearestImageAspect(aspect: string) {
  if (IMAGE_ASPECTS.includes(aspect)) return aspect;
  const [w, h] = aspect.split(":").map(Number);
  const r = w && h ? w / h : 1;
  return IMAGE_ASPECTS.reduce((best, a) => { const [x, y] = a.split(":").map(Number); return Math.abs(x / y - r) < Math.abs(best.r - r) ? { a, r: x / y } : best; }, { a: "16:9", r: 16 / 9 }).a;
}

export type GeneratedImage = { id: string | null; url: string };

export async function generateBrandImages(req: GenerateRequest): Promise<GeneratedImage[]> {
  const refs = req.references ?? [];
  const styleObj = MARKETING_STYLES.find((s) => s.id === req.style);
  const constraint = brandConstraintFor(req.kit);
  let assembled = req.plain ? (req.assembledPrompt ?? req.prompt) : req.assembledPrompt ? `${req.assembledPrompt}\n\n${constraint}` : "";
  let negative: string | undefined;
  if (!assembled && req.mode === "edit") assembled = `${req.prompt}\nKeep everything else in image 1 exactly as it is (composition, lighting, people, text).`;
  if (!assembled) {
    const direction = selectCreativeDirection(req.kit, { topic: req.prompt, style: req.style, mode: "standard" });
    const built = assemblePrompt(req.prompt, direction, req.kit, styleObj?.promptAddon ?? "", constraint);
    assembled = built.prompt;
    negative = built.negativePrompt;
  }
  const referenceUrls = !req.plain && req.style === "brand" && req.kit.logoUrl ? [req.kit.logoUrl, ...refs] : refs;
  // Without the real logo in the references the models invent one (Kezie, 2026-10-12): forbid it.
  if (!(req.kit.logoUrl && referenceUrls.includes(req.kit.logoUrl)) && req.mode !== "edit") {
    assembled = assembled ? `${assembled}\nDraw no logo, icon or brand mark of any kind; where a brand mark would go, write "${req.kit.name}" as plain text.` : assembled;
  }
  const payload = {
    client_id: req.clientId,
    brand_id: req.brandId,
    mode: req.mode ?? "standard",
    prompt: req.prompt.slice(0, 3900),
    assembled_prompt: assembled.slice(0, 11900),
    ...(negative ? { negative_prompt: negative.slice(0, 3900) } : {}),
    reference_image_urls: referenceUrls,
    ...(req.engine === "gpt-image-2-image-to-image" ? { input_urls: referenceUrls } : {}),
    kie_model: req.engine === "nb2" ? "nano-banana-2" : req.engine,
    imageEngine: req.engine,
    aspect_ratio: req.aspect,
    style: req.style,
    strict_brand_alignment: !req.plain,
    numImages: 1,
    brand_name: req.kit.name,
    brand_website: req.kit.websiteUrl,
    brand_description: req.kit.description,
    brand_industry: req.kit.industry,
    brand_primary_color: req.kit.primaryColor,
    brand_secondary_color: req.kit.secondaryColor,
    ...(req.plain ? {} : { logo_url: req.kit.logoUrl }),
    is_sync: true,
  };

  const { addTask, removeTask } = useWorkflowStore.getState();
  const taskId = `img-${Date.now()}`;
  addTask(taskId, "Generating Image");
  const n = Math.min(4, Math.max(1, req.count ?? 1));
  // The Library post exists BEFORE the render and n8n writes the image onto it (post_id), so a phone
  // that locks or a tab that closes mid-render still gets the picture it paid for (2026-10-12: a
  // dropped connection used to lose a charged image, because only the browser saved it).
  let rowIds: Array<string | null> = Array(n).fill(null);
  if (req.save !== false) {
    const { data } = await supabase
      .from("content")
      .insert(Array.from({ length: n }, () => ({ client_id: req.clientId, brand_id: req.brandId, content_type: "post_image", caption: req.caption.slice(0, 300), status: "draft", ai_model: payload.kie_model, generation_status_text: "Making your image" })))
      .select("id");
    rowIds = rowIds.map((_, i) => (data?.[i]?.id as string | undefined) ?? null);
  }
  /** Certain failures (refused, invalid, not connected): the placeholder goes. A timeout keeps it, the image may still land. */
  const dropRow = (id: string | null) => { if (id) void supabase.from("content").delete().eq("id", id).then(() => {}, () => {}); };
  try {
    const settled = await Promise.allSettled(rowIds.map((id) => triggerWorkflow("blink-generate-images", { ...payload, ...(id ? { post_id: id } : {}) })));
    const urls: string[] = [];
    const saved: GeneratedImage[] = [];
    let refusal: string | null = null;
    let firstError: string | null = null;
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      const id = rowIds[i];
      if (r.status === "rejected") {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        firstError ??= msg;
        if (/status: 504|timed out|Failed to fetch|NetworkError|network/i.test(msg)) {
          if (id) void supabase.from("content").update({ generation_status_text: "Still making: check back in a minute" }).eq("id", id).then(() => {}, () => {});
        } else dropRow(id);
        continue;
      }
      const v = (r.value ?? {}) as { success?: boolean; message?: string; imageUrls?: string[] | string };
      if (v.success === false) { refusal = v.message || refusal; dropRow(id); continue; }
      const got = Array.isArray(v.imageUrls) ? v.imageUrls : v.imageUrls ? [v.imageUrls] : [];
      if (!got.length) { dropRow(id); continue; }
      urls.push(...got);
      if (id) {
        await supabase.from("content").update({ image_urls: got, generation_status_text: null }).eq("id", id);
        saved.push({ id, url: got[0] });
      } else saved.push(...got.map((url) => ({ id: null, url })));
    }
    if (!urls.length) throw new Error(refusal || firstError || "No image came back. If credits were taken they are refunded.");
    return saved;
  } finally {
    removeTask(taskId);
  }
}

/** A friendly message for a failed generation. */
export function generationErrorMessage(e: unknown) {
  const msg = e instanceof Error ? e.message : "";
  if (/upstream_auth/.test(msg)) return "The image service isn't connected right now, so nothing was made and nothing was charged. We've been told; try again a little later.";
  if (/status: 504|timed out/i.test(msg)) return "The render took longer than the connection allowed. It may still finish; check your Library in a minute before trying again.";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "The connection dropped while your image was being made. If it finished, it lands in your Library on its own in a minute; failed renders refund themselves.";
  if (/status: 402|insufficient/i.test(msg)) return "Not enough credits for this. Get more in Billing.";
  if (/status: 429/i.test(msg)) return "That's a lot of images in a short time. Wait a minute and try again.";
  // 502: n8n answered with an error (a crash, or it is down). Failed renders refund themselves.
  if (/status: 502/i.test(msg)) return "The image service had a problem with this one. If credits were taken they come back automatically. Try again in a minute.";
  return msg || "The image could not be made.";
}
