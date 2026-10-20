/**
 * Sensitive subjects (Kezie, 2026-10-18: a breast-implant brand "couldn't generate a lot of those
 * because it's breasts and nipples showing"; videos saying "we can't do this"). What BlinkSpot
 * will and won't make, said up front, with the ideas that do work and the model that works best.
 *
 * The line: no nudity or sexual imagery, for anyone. Every image and video service we use refuses
 * it, Instagram, Facebook and TikTok remove it (and Meta's ad rules restrict before-and-after body
 * pictures for cosmetic procedures), and with photo upload and face swap in the app, an unfiltered
 * model would let anyone make intimate pictures of a real person. AI-made "results" for a surgery
 * brand would also mislead patients: real before-and-afters come from real, consenting patients.
 * What clinics, wellness and lingerie brands actually post is very makeable: below.
 */
export type SensitiveKind = "medical" | "intimate" | "lingerie";

/**
 * Which video quality for what (Kezie, 2026-10-20: "tell them, if you want this kind of video, use
 * this model"). Measured on our own runs: Seedance 2 makes clinics, consultations, products and
 * clothed people; Sora refuses most medical and body scenes; no service we use makes nudity.
 */
export const VIDEO_MODEL_GUIDE: Array<{ quality: string; best: string; avoid?: string }> = [
  { quality: "Auto", best: "Picks the best model for the style you chose. Start here." },
  { quality: "Draft", best: "Cheap previews of an idea: everyday scenes, simple motion, checking timing.", avoid: "Faces and fine detail are rougher." },
  { quality: "Standard", best: "Most ads: people, products, food, places. Also clinics, consultations, surgeons and clothed lifestyle shots for medical and cosmetic brands." },
  { quality: "Cinema", best: "The same as Standard at 1080p and up to 30 s, for the hero video." },
  { quality: "Sora 2 (Pro)", best: "Very lifelike people talking to camera.", avoid: "Refuses most medical, body and many brand scenes: use Standard for those." },
];
export const VIDEO_LINE = "Nothing in BlinkSpot makes nudity or sexual scenes, for any brand: every video service refuses them, Instagram, Facebook and TikTok take them down, and Paystack's rules don't allow sexually explicit material. Medical topics are fine when they're shown the way clinics post them: consultations, the team, the product, diagrams.";

const MEDICAL = /\b(implants?|mastectomy|reconstruction|cosmetic surgery|plastic surgery|aesthetic (?:clinic|medicine)|breast (?:augmentation|lift|reduction|surgery)|liposuction|tummy tuck|bbl|botox|fillers?)\b/i;
const INTIMATE = /\b(sexual (?:health|wellness)|intimate (?:health|wellness)|fertility|menstrual|period care|condoms?|sex toys?|libido|vagina[sl]?|penis|erectile)\b/i;
const LINGERIE = /\b(lingerie|underwear|bras?|panties|swimwear|bikinis?|shapewear)\b/i;

export function sensitiveKind(...texts: Array<string | null | undefined>): SensitiveKind | null {
  const t = texts.filter(Boolean).join(" ");
  if (MEDICAL.test(t)) return "medical";
  if (INTIMATE.test(t)) return "intimate";
  if (LINGERIE.test(t)) return "lingerie";
  return null;
}

export type SensitiveGuide = { title: string; line: string; ideas: Array<{ label: string; brief: string }>; model: string; video: string };

export const SENSITIVE_GUIDES: Record<SensitiveKind, SensitiveGuide> = {
  medical: {
    title: "Medical and cosmetic brands",
    line: "No nudity or AI-made before-and-afters: the image services refuse them, social apps remove them, and real results must come from real patients. These work well and look professional:",
    ideas: [
      { label: "The implant as a product", brief: "Studio product photograph of a silicone implant on a white marble plinth, soft three-point light, clean clinical background, premium medical brand feel. No people." },
      { label: "Consultation", brief: "A surgeon in a white coat talking with a fully clothed patient in a bright, modern consultation room, warm and reassuring, natural light, candid moment." },
      { label: "Surgeon portrait", brief: "Confident portrait of a surgeon in scrubs with arms crossed in a modern clinic corridor, shallow depth of field, trustworthy and warm." },
      { label: "Confidence after", brief: "A smiling woman in a stylish fitted top walking along a sunny beach promenade, confident and relaxed, lifestyle photography. Face visible, fully clothed." },
      { label: "How it works (diagram)", brief: "Clean medical illustration infographic explaining the procedure in three simple steps, soft brand colours, labelled icons, no anatomy close-ups." },
    ],
    model: "Best (Nano Banana 2) makes clinical and lifestyle scenes most reliably. Fast (GPT Image) refuses most body-related wording.",
    video: "Seedance 2 (Standard) handles clinics, consultations and clothed people well. Sora refuses most medical scenes.",
  },
  intimate: {
    title: "Intimate and sexual-health brands",
    line: "No nudity or sexual imagery: the services refuse it and social apps remove it. Product-first and lifestyle scenes are what these brands post:",
    ideas: [
      { label: "Product flat lay", brief: "Overhead flat lay of the product in its packaging on soft linen with fresh botanicals, calm pastel palette, premium wellness brand feel." },
      { label: "Packaging hero", brief: "Studio shot of the product box standing on a pastel plinth with soft shadows, minimal, modern, discreet." },
      { label: "Couple, everyday", brief: "A happy couple laughing together in a sunny kitchen, fully clothed, candid lifestyle moment, warm natural light." },
      { label: "Expert tip card", brief: "Clean typographic social post with a short health tip from a doctor, brand colours, friendly and professional." },
    ],
    model: "Best (Nano Banana 2) for products and lifestyle. Keep body words out of the brief.",
    video: "Seedance 2 for product and lifestyle shots.",
  },
  lingerie: {
    title: "Lingerie and swimwear",
    line: "Models in lingerie or swimwear are fine; nudity and sheer see-through fabric are refused. Keep it fashion-editorial:",
    ideas: [
      { label: "Editorial model shot", brief: "Fashion editorial photograph of a model wearing the swimsuit on a sunlit terrace, confident pose, tasteful, magazine quality, natural light." },
      { label: "Product on a hanger", brief: "The bra on a minimalist wooden hanger against a soft pastel wall, studio light, clean product photography." },
      { label: "Flat lay", brief: "Overhead flat lay of the set with folded silk, a perfume bottle and fresh flowers, soft natural light." },
      { label: "Fabric close-up", brief: "Macro close-up of the lace detail and fabric texture, shallow depth of field, premium feel." },
    ],
    model: "Best (Nano Banana 2) for models; Fast (GPT Image) refuses some swimwear shots.",
    video: "Seedance 2 for fashion movement (a turn, a walk).",
  },
};
