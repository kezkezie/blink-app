/**
 * The prompt a video model renders (Kezie, 2026-10-18: LADI APP, an auto parts marketplace, got a
 * perfume ad from a brake-disc scene). n8n's "AI enhance" step sent each scene to GPT-4o told to
 * "IGNORE saved brand profiles, focus on the reference images"; with no images it answered "I'm
 * sorry, but I can't fulfill that request", and that sentence went to Seedance as the prompt (the
 * brand also arrived as "A Premium Brand": scenes carried no brand id). Now the app writes the
 * prompt with Claude inside the brand's world ("Keep it on brand", on by default), never passes a
 * refusal on, and turns n8n's step off. Pure parts here; the call is in video-prompt-server.ts.
 */
import { REFUSAL } from "@/lib/ai-safe-text";

export const VIDEO_PROMPT_SYSTEM = `You write the one prompt a text-and-image-to-video model (Seedance, Kling) renders for a social media ad scene.
Write 45 to 110 words, present tense, concrete and visual: the subject and exactly what it does, the setting, the camera move (push-in, orbit, tracking, handheld, static), the light, the mood, the pace. One continuous shot. Keep everything the scene asks for.
If a start frame is attached, the video begins on it: describe how it moves from there and keep its subject, people and setting; don't describe a different picture.
No on-screen text, captions or logos unless the scene asks for exact words (then quote them). No brand names of other companies. Real, plausible people and places; nothing sexual or graphic.
Reply with the prompt only: no title, no quotes, no notes, and never explain or comment on a change (if you swap the product, just describe the new shot).`;

export const ON_BRAND_RULES = `Stay inside this brand's world. Every product, place, prop and person belongs to what this brand does. Never show a product from another category (perfume, cosmetics, drinks, food, fashion, gadgets...) unless the scene names it. If the scene's product doesn't fit the brand (for example a perfume bottle for a car parts brand), show this brand's own product or service instead, in the same kind of shot.`;

export function videoPromptUser(i: { scene: string; brand?: string | null; onBrand: boolean; seconds: number; hasStartFrame: boolean; aspect?: string | null }) {
  return [
    i.onBrand && i.brand ? `The brand:\n${i.brand}\n\n${ON_BRAND_RULES}` : "No brand rules for this scene: follow it as written.",
    `Length: ${Math.round(i.seconds)} seconds${i.aspect ? `, ${i.aspect}` : ""}.${i.hasStartFrame ? " A start frame is attached." : " No start frame: the model creates the first picture from your words."}`,
    `The scene:\n${i.scene.trim()}`,
  ].join("\n\n");
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Claude's prompt, cleaned; a refusal, an empty or a tiny answer gives way to the fallback. */
export function validVideoPrompt(raw: string | null | undefined, fallback: string): { prompt: string; written: boolean } {
  const cleaned = (raw ?? "").replace(/^["'“”]+|["'“”]+$/g, "").replace(/^\s*(prompt|video prompt)\s*:\s*/i, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  // A note to us ("I'm swapping in the brand's product...") would be rendered as part of the scene.
  // Lines people say (in quotes) stay.
  const note = (sentence: string) => !/["“”]/.test(sentence) && /\b(I(?:'|’)m|I am|I(?:'|’)ve|I have|I(?:'|’)ll|I will|I swapped|I replaced|swapping in|doesn(?:'|’)t fit)\b/i.test(sentence);
  const text = cleaned.split(/(?<=[.!?])\s+/).filter((sentence) => !note(sentence)).join(" ").slice(0, 1800);
  if (!text || words(text) < 12 || REFUSAL.test(text.slice(0, 200)) || /\b(i can(?:'|’)?t|i cannot|as an ai)\b/i.test(text.slice(0, 120))) return { prompt: fallback, written: false };
  return { prompt: text, written: true };
}

/** Without Claude: the scene as written, with the brand's world named so the model has the subject. */
export function fallbackVideoPrompt(scene: string, brandName?: string | null, industry?: string | null, onBrand = true) {
  const base = scene.replace(/\s+/g, " ").trim();
  if (!onBrand || !brandName) return base;
  return `${base} This is an ad for ${brandName}${industry ? `, ${industry}` : ""}: everything shown belongs to that world.`;
}
