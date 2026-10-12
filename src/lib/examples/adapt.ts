/**
 * "Use this prompt" from an example (QA-018, 2026-10-12): the recipe was written for one of our
 * made-up brands (e.g. Mavuno) and carried its CRITICAL BRAND CONSTRAINT, so the active brand's
 * image was told to say "MAVUNO". The constraint is removed (the generator adds the active brand's
 * own), the example brand's name becomes the active brand's, and the text is cut at a word.
 */
export function adaptRecipePrompt(prompt: string, brandName: string | null | undefined, max = 1200): { text: string; from: string | null } {
  let text = prompt.trim();
  const from = /belongs to the brand "([^"]{2,60})"/i.exec(text)?.[1] ?? null;
  text = text.replace(/CRITICAL BRAND CONSTRAINT:[\s\S]*?placeholder logos[^.]*\.\s*/i, "");
  text = text.replace(/CRITICAL BRAND CONSTRAINT:[^.]*\.\s*(Any visible text[^.]*\.\s*)?/i, "");
  if (from && brandName && from.toLowerCase() !== brandName.toLowerCase()) {
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${esc}\\b`, "gi"), (m) => (m === m.toUpperCase() && m !== m.toLowerCase() ? brandName.toUpperCase() : brandName));
  }
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > max) {
    const cut = text.slice(0, max - 1);
    const at = cut.lastIndexOf(" ");
    text = `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.-]+$/, "")}…`;
  }
  return { text, from };
}
