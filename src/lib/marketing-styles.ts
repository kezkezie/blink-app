/** Image Studio style presets (shared by the classic Image Studio and the studio Generate). */
export const MARKETING_STYLES = [
  {
    id: "studio",
    label: "📸 Studio Product Shoot",
    promptAddon: `Reference: Irving Penn product portraits, Bottega Veneta campaigns. The background is silence that amplifies — not empty space. NO TEXT, NO TYPOGRAPHY, NO LOGOS anywhere in the image.`,
  },
  {
    id: "lifestyle",
    label: "🌿 Lifestyle Photography",
    promptAddon: `Reference: Kinfolk magazine, Aesop campaign photography, Monocle editorial. The product was not placed here — it lives here. NO TEXT, NO TYPOGRAPHY, NO LOGOS anywhere in the image.`,
  },
  {
    id: "cinematic",
    label: "🎬 Cinematic",
    promptAddon: `Reference: Roger Deakins lighting, Denis Villeneuve visual language. A single frame from a film that has not been made yet. NO TEXT, NO TYPOGRAPHY, NO LOGOS anywhere in the image.`,
  },
  {
    id: "poster",
    label: "🔥 Editorial Ad Campaign",
    promptAddon: `Reference: Apple launch photography, Mubi film poster art, Virgil Abloh design language, modern social-media graphic design. The poster is an event, not a flyer. Typography is FLAT 2D graphic design — bold clean vector lettering, flat layered echoes, rounded color label chips. STRICTLY NO 3D extruded, beveled, embossed, or puffy text.`,
  },
  {
    id: "brand",
    label: "✨ Brand Integrated (Logo)",
    promptAddon: `Image 1 is the brand's own logo and must be used as the identity reference. Integrate it naturally into the scene as a printed mark, embossed detail, label, packaging graphic, or surface application. Preserve its proportions, recognizable shapes, and brand colors. Do not invent another logo, brand name, or lettering. Keep the mark clear, undistorted, and appropriately sized within the composition. Build the surrounding product scene, lighting, materials, and atmosphere around this supplied brand asset.`,
  },
  {
    id: "abstract",
    label: "🎨 Abstract / 3D Render",
    promptAddon: `Reference: Zaha Hadid architecture as product design, Kaws sculpture meets Octane rendering. One dominant form. Surface tells the story through light, shadow, and material precision.`,
  },
  {
    id: "flatlay",
    label: "📐 Flatlay / Top-Down",
    promptAddon: `Reference: Wallpaper* magazine spreads, System Magazine editorial. Objects in conversation, not arranged. Surface chosen like a frame. NO TEXT, NO TYPOGRAPHY, NO LOGOS anywhere in the image.`,
  },
];

export type MarketingStyle = (typeof MARKETING_STYLES)[number];
