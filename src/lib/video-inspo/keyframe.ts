/**
 * Video Inspo, shot by shot (Kezie, 2026-10-22: "change the pictures to your brand ... then create
 * videos based on that, to fit exactly the video inspo idea"). Each scene's still from the
 * reference is remade as the same moment for the brand, with no words (Inspo Remix puts words in
 * that shouldn't be there; words go on in the Editor, spelled right). The Storyboard then animates
 * each frame. Pure: the prompt only.
 */
export type KeyframeInput = {
  brand: string; industry?: string | null; description?: string | null; colours: Array<string | null | undefined>;
  what: string; cast?: string | null; motion: boolean; products: number;
};

export function keyframePrompt(i: KeyframeInput): string {
  const colours = i.colours.filter((c): c is string => !!c && /^#?[0-9a-f]{6}$/i.test(c));
  // The brand is never named and its description never quoted: image models write what they're
  // given, and the reference frames are full of type they refill (2026-10-22: "NUF FARMS",
  // "Kiambu fresh" and the website came back on the frames). The scene comes from its video prompt,
  // which the planner writes with no words on screen; quotes and links are taken out anyway.
  const name = i.brand.trim();
  const clean = (t: string) => (name ? t.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "the business") : t)
    .replace(/["“”'‘’][^"“”'‘’]{1,80}["“”'‘’]/g, " ").replace(/\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|co\.ke|io|net|org)\b/gi, " ").replace(/\s+/g, " ").trim().slice(0, 450);
  const NO_WORDS = "This frame has NO text: no letters, words, numbers, names, logos, labels, captions or signs anywhere.";
  // What the business makes, as things to show: place names and other proper nouns out (they got written).
  const makes = clean(i.description ?? "").split(/(?<=[.!?])\s+/).slice(0, 2).join(" ")
    .replace(/(?!^)\b[A-Z][a-z]+\b/g, (w, at: number, all: string) => (/[.!?]\s*$/.test(all.slice(0, at)) ? w : "")).replace(/\s+/g, " ").replace(/\s+([.,])/g, "$1").trim().slice(0, 200);
  const lines = [
    NO_WORDS,
    `Image 1 is one frame from a reference video. Paint the same moment again for a different business${i.industry ? ` (${i.industry})` : ""}.`,
    makes ? `The business, to show only as things in the picture (never written): ${makes}` : "",
    `Keep from image 1: the composition, the camera angle and distance, the framing, where each thing sits, the light and the mood${i.motion ? ", and its flat animated style (simple shapes, flat colour, soft shadows)" : ""}. Where image 1 has words or a title, paint that area as plain background or the shape behind it.`,
    `What it shows now: ${clean(i.what)}.`,
    `Replace any person in image 1 with ${i.cast ? clean(i.cast) : "a person who fits this business, its place and its customers"}; never the same person, pose for pose. Their hands are theirs.`,
    i.products === 1 ? "Image 2 is the business's real product: show it exactly as photographed where the reference shows a product." : i.products > 1 ? `Images 2 to ${i.products + 1} are the business's real products: show them exactly as photographed where the reference shows products.` : "",
    colours.length ? `Colour it with ${colours.join(" and ")} where the reference uses its main colours (shapes, backgrounds, the sun, the ground).` : "",
    NO_WORDS,
  ];
  return lines.filter(Boolean).join("\n");
}
