"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { triggerWorkflow } from "@/lib/workflows";
import { useWorkflowStore } from "@/app/store/useWorkflowStore";
import { assemblePrompt, selectCreativeDirection, type BrandContext } from "@/lib/creative-direction";
import { MARKETING_STYLES } from "@/lib/marketing-styles";
import { contactRule } from "@/lib/inspo";

/**
 * The studio's one way to make images (Generate and Inspo Remix): the same workflow, billing,
 * refunds and Library rows as the classic Image Studio's synchronous path.
 */

export type BrandKit = BrandContext & { socials?: string };
export type ImageEngine = "nb2" | "gpt-image-2-text-to-image" | "gpt-image-2-image-to-image" | "z-image";

/** The active brand's identity, as the classic Image Studio loads it. */
export function useBrandKit(brandId: string | null | undefined, fallbackName?: string) {
  const [kit, setKit] = useState<BrandKit | null>(null);
  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    supabase
      .from("brand_profiles")
      .select("brand_name, company_name, website_url, social_urls, description, industry, image_style, brand_voice, logo_url, primary_color, secondary_color, primary_font")
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
        });
      });
    return () => { cancelled = true; };
  }, [brandId, fallbackName]);
  return kit;
}

export function brandConstraintFor(kit: BrandKit) {
  return [
    `CRITICAL BRAND CONSTRAINT: This content belongs to the brand "${kit.name}".`,
    kit.websiteUrl ? `The website is ${kit.websiteUrl}.` : "",
    kit.description ? `Brand description: ${kit.description}.` : "",
    kit.industry ? `Industry: ${kit.industry}.` : "",
    kit.primaryColor ? `Brand colours: ${[kit.primaryColor, kit.secondaryColor].filter(Boolean).join(", ")}.` : "",
    `Do NOT invent fictional brand names, fake website URLs, placeholder logos, or generic company names.`,
    `Any text, signage, labels, or website URLs visible in the image MUST reflect "${kit.name}" only.`,
    contactRule(kit.websiteUrl, kit.socials),
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
  style: (typeof MARKETING_STYLES)[number]["id"];
  count?: number;
  caption: string;
};

export type GeneratedImage = { id: string | null; url: string };

export async function generateBrandImages(req: GenerateRequest): Promise<GeneratedImage[]> {
  const refs = req.references ?? [];
  const styleObj = MARKETING_STYLES.find((s) => s.id === req.style);
  const constraint = brandConstraintFor(req.kit);
  let assembled = req.assembledPrompt ? `${req.assembledPrompt}\n\n${constraint}` : "";
  let negative: string | undefined;
  if (!assembled) {
    const direction = selectCreativeDirection(req.kit, { topic: req.prompt, style: req.style, mode: "standard" });
    const built = assemblePrompt(req.prompt, direction, req.kit, styleObj?.promptAddon ?? "", constraint);
    assembled = built.prompt;
    negative = built.negativePrompt;
  }
  const referenceUrls = req.style === "brand" && req.kit.logoUrl ? [req.kit.logoUrl, ...refs] : refs;
  const payload = {
    client_id: req.clientId,
    brand_id: req.brandId,
    mode: "standard",
    prompt: req.prompt.slice(0, 3900),
    assembled_prompt: assembled.slice(0, 11900),
    ...(negative ? { negative_prompt: negative.slice(0, 3900) } : {}),
    reference_image_urls: referenceUrls,
    ...(req.engine === "gpt-image-2-image-to-image" ? { input_urls: referenceUrls } : {}),
    kie_model: req.engine === "nb2" ? "nano-banana-2" : req.engine,
    imageEngine: req.engine,
    aspect_ratio: req.aspect,
    style: req.style,
    strict_brand_alignment: true,
    numImages: 1,
    brand_name: req.kit.name,
    brand_website: req.kit.websiteUrl,
    brand_description: req.kit.description,
    brand_industry: req.kit.industry,
    brand_primary_color: req.kit.primaryColor,
    brand_secondary_color: req.kit.secondaryColor,
    logo_url: req.kit.logoUrl,
    is_sync: true,
  };

  const { addTask, removeTask } = useWorkflowStore.getState();
  const taskId = `img-${Date.now()}`;
  addTask(taskId, "Generating Image");
  try {
    const settled = await Promise.allSettled(Array.from({ length: Math.min(4, Math.max(1, req.count ?? 1)) }).map(() => triggerWorkflow("blink-generate-images", payload)));
    const urls: string[] = [];
    let refusal: string | null = null;
    let firstError: string | null = null;
    for (const r of settled) {
      if (r.status === "rejected") { firstError ??= r.reason instanceof Error ? r.reason.message : String(r.reason); continue; }
      const v = (r.value ?? {}) as { success?: boolean; message?: string; imageUrls?: string[] | string };
      if (v.success === false) { refusal = v.message || refusal; continue; }
      urls.push(...(Array.isArray(v.imageUrls) ? v.imageUrls : v.imageUrls ? [v.imageUrls] : []));
    }
    if (!urls.length) throw new Error(refusal || firstError || "No image came back. If credits were taken they are refunded.");
    const saved: GeneratedImage[] = [];
    for (const url of urls) {
      const { data } = await supabase
        .from("content")
        .insert({ client_id: req.clientId, brand_id: req.brandId, content_type: "post_image", caption: req.caption.slice(0, 300), status: "draft", image_urls: [url], ai_model: payload.kie_model })
        .select("id")
        .single();
      saved.push({ id: data?.id ?? null, url });
    }
    return saved;
  } finally {
    removeTask(taskId);
  }
}

/** A friendly message for a failed generation. */
export function generationErrorMessage(e: unknown) {
  const msg = e instanceof Error ? e.message : "";
  if (/status: 50[24]|timed out/i.test(msg)) return "The render took longer than the connection allowed. It may still finish; check your Library in a minute before trying again.";
  if (/status: 402|insufficient/i.test(msg)) return "Not enough credits for this. Top up in Billing.";
  // n8n's failure reply is currently malformed (see projects/blinkspot/known-issues.md), so a failed
  // render reaches us as a bare 502. The usual cause is an oversized PNG that can't be saved.
  if (/status: 502/i.test(msg)) return "The image was made but couldn't be saved (usually a file that's too large). Your credits are refunded automatically. Try again, or use Best quality.";
  return msg || "The image could not be made.";
}
