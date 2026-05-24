import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt, brandContext, useBrand, mode, style } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY environment variable" }, { status: 500 });
    }

    const brand = useBrand && brandContext ? brandContext : null;
    const isZeroPrompt = !prompt || prompt.trim().length < 5;

    // NB2 formula: [Subject] + [Action] + [Location/Context] + [Composition] + [Lighting] + [Camera] + [Style]
    const designRules = `
DESIGN RULES YOU MUST ENFORCE (from BlinkSpot's design intelligence matrix):
- 60/30/10 rule: Hero visual = 60% of frame. Supporting elements = 30%. Text/CTA = under 10%.
- Text coverage MAXIMUM: 20% of total frame. One headline + one short tagline max. Never bullets or paragraphs.
- 10% safe zone: No text or critical elements within 10% of any edge.
- 20-30% intentional negative space: Empty areas are not mistakes — they signal premium quality.
- Single focal point: One dominant element always. Never two competing heroes.
- Left-side dominance: Product or hero visual placed left-center or center.
- Text placement: Headline UPPER THIRD only, left-aligned. CTA/logo LOWER THIRD right-aligned.
- Semi-transparent gradient scrim behind any text placed over a photo.
- Color: Single accent for CTA only. Neutral or brand-color background. No purple-to-blue gradients.
- Camera: Always specify lens and shot type. Shallow depth of field (f/1.8) for lifestyle. Macro for product.
- Lighting: Always name the setup. Three-point softbox for studio. Golden hour for lifestyle. Chiaroscuro for cinematic.
- Materiality: Describe surfaces specifically ("natural linen sofa", "warm Calacatta marble", "matte frosted acrylic").`;

    const styleKey = style?.id || "studio";
    const isPosterStyle = styleKey === "poster";

    const styleBlueprints: Record<string, string> = {
      poster: `FMCG BILLBOARD POSTER BLUEPRINT — MODEL THIS AFTER MURPHY AI CINEMATIC FMCG ADS (Top Ramen "RICH IN EVERY BITE", Ching's Secret "DESI CHINESE FIRE"). This is a layered graphic design orientation: cinematic environmental photography as the base layer, with bold typographic design system composited on top. NOT a clean studio still-life.

SCENE (base layer — photorealistic cinematic): The hero food, product, or subject in dramatic action — slow-motion pour, noodles tossed in wok flame, steam rising, sauce cascading, hands holding product with intention. The action conveys the brand's core sensation or promise.

ENVIRONMENT: Dark, atmospheric, high-drama setting — dark stone kitchen, flame-lit street stall, dramatic industrial backdrop, or moody cinematic space. Rich with texture: cracked concrete, smoke, steam, fire glow, ambient haze.

PRODUCT PLACEMENT: The hero product (pack, container, or dish) occupies the center-right or center of frame. Label sharp and fully legible. Open packaging beside sealed unit. Rim-lit to separate from background.

COMPOSITION: Diagonal explosive motion or centered calm depending on brand energy. Camera: wide 28mm or 35mm anamorphic, shallow depth of field f/1.8, slight motion blur on environment, sharp focus on product and hero element.

TYPOGRAPHY LAYERS (render ALL as physically composited text in the scene):
- TOP LEFT: brand logo mark or brand name "${brand?.name || "BRAND"}" in small clean sans-serif, white, with creator credit line beneath it
- CENTER MASSIVE: render a huge bold headline in ALL CAPS — choose a strong 3-5 word phrase that captures the brand's power promise. Display font, ultra-bold weight, fills 40% of the vertical frame. White or brand accent color.
- RIGHT SIDE (faint, vertical stack): 4-5 single mood words stacked right side, low opacity (30-40%) — massive type, ghost-like behind the scene. Words like: SLOW / WARM / DEEP / SATISFY or FIRE / BOLD / REAL / RAW
- MID-LEFT: one short tagline in clean serif or condensed sans, smaller than headline — white, left-aligned
- BOTTOM LEFT: product descriptor line — "INSTANT NOODLES · CLASSIC MASALA · 2026" style, small caps, tracked out
- BOTTOM RIGHT: website URL "${brand?.websiteUrl || "brand.com"}" in small clean type
- VERTICAL EDGE (left or right): 3 brand attributes rotated 90 degrees — "TASTE · DEPTH · SATISFACTION" style

LIGHTING: Dramatic chiaroscuro — single strong warm key light from upper-left or behind product. Deep shadow fill. Rim lighting separating subject from background. Fire glow or warm ambient if scene calls for it.

PALETTE: Deep darks with one warm accent color — charcoal blacks, deep browns, warm ambers, and one saturated brand color. No pastels. No pure white backgrounds.

ATMOSPHERE: Cinematic. Feels like a movie frame. Smoke particles, steam wisps, or ambient haze adding depth. Photorealistic texture on every surface.`,

      studio: `STUDIO BLUEPRINT: Clean infinite backdrop (white, off-white, or deep neutral). Product as single focal point at 60% of frame. Three-point softbox lighting. Generous negative space on two sides. Macro lens, ultra-sharp focus, materiality emphasis. ABSOLUTELY NO TEXT, NO WORDS, NO TYPOGRAPHY, NO LOGOS, NO WATERMARKS anywhere in the image — pure visual photography only.`,

      lifestyle: `LIFESTYLE BLUEPRINT: Product in natural authentic context. Real environment not studio. Golden hour or soft window light. Fujifilm color science, 35mm, film grain. Candid, unposed. Breathing room around subject. ABSOLUTELY NO TEXT, NO WORDS, NO TYPOGRAPHY, NO LOGOS, NO WATERMARKS anywhere in the image — pure editorial photography only.`,

      cinematic: `CINEMATIC BLUEPRINT: Chiaroscuro lighting, muted teal and amber color grade. 35mm anamorphic lens, shallow depth of field f/1.8. Single dominant focal point. Moody, dramatic, movie-still. ABSOLUTELY NO TEXT, NO WORDS, NO TYPOGRAPHY, NO LOGOS, NO WATERMARKS anywhere in the image — pure cinematic photography only.`,

      brand: `BRAND LOGO BLUEPRINT: Product scene with brand logo reproduced faithfully as flat printed label or surface decal. Logo lower corner, 5-10% of total frame, white backing. Do NOT distort or reinterpret the logo. Clean neutral background.`,

      flatlay: `FLATLAY BLUEPRINT: 90-degree overhead shot, deep depth of field. Soft diffused window light. Precise knolling grid layout. 20% negative space around items. White/marble/wood grain background.`,

      abstract: `ABSTRACT/3D BLUEPRINT: Octane render, Unreal Engine 5. Smooth glossy textures, subsurface scattering. Single dominant form. HDRI lighting. Clean negative space. Quality through restraint.`,

    };

    const modeBlueprint: Record<string, string> = {
      product_drop: isPosterStyle
        ? `${styleBlueprints.poster} RELATIONAL DROP INSTRUCTION: The uploaded source image is the hero product to be integrated into the cinematic scene. Composite it into the environmental scene — match lighting direction (chiaroscuro, rim light), add realistic shadows and steam/atmosphere. Product label must remain sharp and legible. Retain original brand colors and materials.`
        : `PRODUCT DROP BLUEPRINT: Seamlessly composite the uploaded product into a new environment. Match product lighting direction exactly. Add realistic shadows and reflections. Product stays sharp and true to original colors. Scene is rich and contextual — not a plain backdrop.`,
      organic_blend: `ORGANIC BLEND BLUEPRINT: Arrange all uploaded images into one cohesive, realistic environment. Items flow naturally together. Consistent lighting across all elements. Rich negative space. No grid — feel organic and editorial.`,
      grid: `CAMPAIGN GRID BLUEPRINT: Pinterest-style aesthetic moodboard. Consistent color palette and vibe across all panels. Clean grid layout with balanced visual weight. Each section harmonious with the next.`,
    };

    const activeBlueprint = modeBlueprint[mode] || styleBlueprints[styleKey] || styleBlueprints.studio;

    const brandBlock = brand
      ? `BRAND IDENTITY (MANDATORY):
- Brand name: "${brand.name}"
- Website: ${brand.websiteUrl || "not specified"}
- Description: ${brand.description || "premium brand"}
- Industry: ${brand.industry || "not specified"}
- Primary color: ${brand.primaryColor || "not specified"}
- Secondary color: ${brand.secondaryColor || "not specified"}
- Visual style: ${brand.imageStyle || "not specified"}
- Brand voice: ${brand.brandVoice || "professional"}
ANY visible text, signage, labels, or website URLs in the image MUST reflect "${brand.name}" ONLY.
Never invent fictional brand names, placeholder logos, or fake website URLs.`
      : "";

    const zeroPromptInstruction = isZeroPrompt
      ? `The user provided NO prompt. Invent a compelling, specific visual concept from scratch using the brand identity and selected style. Choose a concrete product, scene, and mood that would resonate with the brand's target audience. Be creative and specific — do not generate a generic description.`
      : `The user provided this rough idea: "${prompt.trim()}". Transform it into a complete, professional creative director brief. Elevate it dramatically while preserving the user's core intent.`;

    const systemPrompt = `You are a world-class Creative Director and AI image prompt engineer. You write prompts for Nano Banana 2 (Gemini 3.1 Flash Image) — an advanced model that responds to specific, narratively structured prompts written like a director briefing a cinematographer.

Your prompts always follow this formula:
[Subject with material detail] + [Action/composition] + [Location/context] + [Composition rules] + [Lighting setup] + [Camera/lens/film] + [Color grade/style]

${designRules}

ACTIVE STYLE BLUEPRINT:
${activeBlueprint}

${brandBlock}

OUTPUT RULES:
- Output ONLY the final image prompt. No preamble, no labels, no conversational text.
- The prompt must be 200-350 words — rich, layered, and structured. Do not truncate early.
- Never use vague adjectives like "beautiful" or "amazing" — use specific technical terms.
- Always name the lighting setup, camera/lens, and composition zone.
- Always include at least one material texture description.
- If the brand has a primary color (${brand?.primaryColor || "none"}), reference it in the environment or accent.${isPosterStyle ? `
- POSTER-SPECIFIC: This is a LAYERED GRAPHIC DESIGN composition — cinematic scene as base, bold typography composited on top. The prompt MUST name all typography zones explicitly: headline (center massive), faint background words (right side ghost), mid-left tagline, bottom descriptor, bottom-right URL, vertical edge attributes. ALL text must reference the brand name "${brand?.name || "BRAND"}" and website "${brand?.websiteUrl || "brand.com"}".` : ["studio", "lifestyle", "cinematic"].includes(styleKey) ? `
- CRITICAL: This style is PHOTOGRAPHY ONLY. Your prompt MUST include the instruction "no text, no words, no typography, no logos, no watermarks anywhere in the image." Do not include any text elements, signage, labels, or brand names as visual elements in the scene.` : ""}`;

    const userMessage = zeroPromptInstruction + "\n\nWrite the final image prompt now:";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.85,
        max_tokens: 700,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "OpenAI API Error");

    const suggestion = data.choices[0].message.content.trim();
    return NextResponse.json({ suggestion });

  } catch (error: any) {
    console.error("AI Prompt Helper Error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate prompt" }, { status: 500 });
  }
}
