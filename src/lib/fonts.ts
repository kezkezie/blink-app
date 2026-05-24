export interface BrandFontConfig {
  family: string;
  category: 'sans-serif' | 'serif' | 'display' | 'monospace' | 'handwriting';
  weights: string[];
  vibe: string;
  nbModifier: string;
}

export const GOOGLE_FONTS_REGISTRY: BrandFontConfig[] = [

  // ── MODERN / CLEAN SANS-SERIF ─────────────────────────────────────────────
  {
    family: 'Plus Jakarta Sans',
    category: 'sans-serif',
    weights: ['400', '500', '600', '700', '800'],
    vibe: 'Modern Tech / Clean Minimal',
    nbModifier: 'sleek, clean, geometric modern sans-serif with precise letterforms',
  },
  {
    family: 'Inter',
    category: 'sans-serif',
    weights: ['400', '500', '600', '700'],
    vibe: 'Clean Minimal / Default',
    nbModifier: 'neutral, highly legible, modern sans-serif with balanced proportions',
  },
  {
    family: 'Inter Tight',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Compact Modern / Tight Editorial',
    nbModifier: 'tightly-spaced, compact modern sans-serif with editorial density and precise construction',
  },
  {
    family: 'DM Sans',
    category: 'sans-serif',
    weights: ['400', '500', '700'],
    vibe: 'Clean Modern / Digital',
    nbModifier: 'clean, geometric, digitally-native sans-serif with soft rounded terminals',
  },
  {
    family: 'Outfit',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Modern / Friendly Brand',
    nbModifier: 'warm, geometric sans-serif with friendly rounded proportions and modern clarity',
  },
  {
    family: 'Manrope',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Premium Editorial / Tech',
    nbModifier: 'premium, editorial geometric sans-serif with tight tracking and refined structure',
  },
  {
    family: 'Geist',
    category: 'sans-serif',
    weights: ['400', '500', '700', '900'],
    vibe: 'Developer / Tech Startup',
    nbModifier: 'ultra-modern, developer-aesthetic sans-serif with clean technical letterforms and neutral warmth',
  },
  {
    family: 'Urbanist',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Contemporary / Lifestyle',
    nbModifier: 'contemporary geometric sans-serif with elegant spacing and sophisticated lifestyle feel',
  },
  {
    family: 'Jost',
    category: 'sans-serif',
    weights: ['400', '500', '600', '700'],
    vibe: 'Geometric / Swiss Style',
    nbModifier: 'clean, precise geometric sans-serif influenced by Swiss typographic tradition',
  },
  {
    family: 'Figtree',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Friendly Modern',
    nbModifier: 'friendly, clean, modern sans-serif with balanced geometric proportions',
  },
  {
    family: 'Bricolage Grotesque',
    category: 'sans-serif',
    weights: ['400', '700', '800'],
    vibe: 'Quirky Editorial / Creative Agency',
    nbModifier: 'expressive, quirky editorial grotesque with distinctive ink-trap details and creative character',
  },
  {
    family: 'Schibsted Grotesk',
    category: 'sans-serif',
    weights: ['400', '700'],
    vibe: 'Editorial / News / Clean',
    nbModifier: 'neutral, highly functional editorial grotesque with news-media authority and clean structure',
  },
  {
    family: 'Public Sans',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Government / Institutional',
    nbModifier: 'authoritative, neutral, highly legible government-grade sans-serif with strong institutional presence',
  },
  {
    family: 'IBM Plex Sans',
    category: 'sans-serif',
    weights: ['400', '600', '700'],
    vibe: 'Corporate Tech / Structured',
    nbModifier: 'IBM-designed corporate tech sans-serif with systematic, structured authority and mechanical precision',
  },

  // ── STRONG / BRAND SANS-SERIF ─────────────────────────────────────────────
  {
    family: 'Montserrat',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800', '900'],
    vibe: 'Strong Brand / Versatile',
    nbModifier: 'geometric, confident sans-serif with strong brand presence and clean structure',
  },
  {
    family: 'Poppins',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Friendly / Rounded Brand',
    nbModifier: 'friendly, geometric rounded sans-serif with uniform, approachable letterforms',
  },
  {
    family: 'Raleway',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Elegant / Fashion Brand',
    nbModifier: 'elegant, geometric sans-serif with thin weight contrast and refined fashion sensibility',
  },
  {
    family: 'Rubik',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Rounded / Approachable',
    nbModifier: 'rounded geometric sans-serif with slightly soft terminals and friendly, modern brand feel',
  },
  {
    family: 'Work Sans',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Professional / Neutral',
    nbModifier: 'professional, optically-corrected sans-serif with clean neutral tone and business versatility',
  },
  {
    family: 'Barlow',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Industrial / Versatile',
    nbModifier: 'industrial-influenced, slightly condensed sans-serif with grounded, versatile brand presence',
  },
  {
    family: 'Space Grotesk',
    category: 'sans-serif',
    weights: ['400', '700'],
    vibe: 'Tech Startup / Modern SaaS',
    nbModifier: 'distinctive, slightly quirky geometric sans-serif with technical personality',
  },
  {
    family: 'Nunito',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Rounded / Warm / Consumer',
    nbModifier: 'well-rounded, friendly sans-serif with uniform stroke weight and warm consumer-product appeal',
  },
  {
    family: 'Libre Franklin',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Editorial / News Grotesque',
    nbModifier: 'news-inspired, wide grotesque sans-serif with editorial authority and traditional typographic roots',
  },
  {
    family: 'Archivo',
    category: 'sans-serif',
    weights: ['400', '600', '700', '800'],
    vibe: 'Versatile / Brand Grotesque',
    nbModifier: 'versatile, wide-body grotesque with newspaper and digital editorial character',
  },

  // ── DISPLAY / IMPACT ──────────────────────────────────────────────────────
  {
    family: 'Syne',
    category: 'display',
    weights: ['700', '800'],
    vibe: 'Bold & Creative / Loud Poster',
    nbModifier: 'ultra-bold, futuristic, wide display sans-serif with strong visual impact',
  },
  {
    family: 'Bebas Neue',
    category: 'display',
    weights: ['400'],
    vibe: 'Street / Urban / Sports',
    nbModifier: 'all-caps condensed display typeface with maximum visual dominance and bold impact',
  },
  {
    family: 'Anton',
    category: 'display',
    weights: ['400'],
    vibe: 'Ultra-Bold Impact / Headlines',
    nbModifier: 'ultra-condensed, heavy display sans-serif with extreme weight and towering headline presence',
  },
  {
    family: 'Oswald',
    category: 'display',
    weights: ['400', '600', '700'],
    vibe: 'Strong Condensed / Editorial',
    nbModifier: 'condensed, strong sans-serif display face with upright authority and editorial power',
  },
  {
    family: 'Fjalla One',
    category: 'display',
    weights: ['400'],
    vibe: 'Editorial Impact / Bold Headlines',
    nbModifier: 'heavy, wide editorial display sans-serif with strong ink presence and high-contrast strokes',
  },
  {
    family: 'Red Hat Display',
    category: 'display',
    weights: ['400', '700', '900'],
    vibe: 'Modern Tech Display',
    nbModifier: 'modern, structured tech display font with geometric clarity and confident visual weight',
  },
  {
    family: 'Archivo Black',
    category: 'display',
    weights: ['400'],
    vibe: 'Bold Brand / Maximum Impact',
    nbModifier: 'ultra-heavy, compact grotesque display typeface with assertive brand strength and bold visual presence',
  },
  {
    family: 'Bungee',
    category: 'display',
    weights: ['400'],
    vibe: 'Urban / Retro Display / Signage',
    nbModifier: 'urban, inline-style display typeface with retro sign-painting character and bold street graphic energy',
  },
  {
    family: 'Barlow Condensed',
    category: 'display',
    weights: ['600', '700', '800'],
    vibe: 'Condensed / Industrial / Newspaper',
    nbModifier: 'tight, condensed industrial sans-serif with efficient horizontal space and bold newspaper energy',
  },
  {
    family: 'Josefin Sans',
    category: 'display',
    weights: ['400', '600', '700'],
    vibe: 'Fashion / Geometric Minimal',
    nbModifier: 'elegant, geometric fashion sans-serif with high hairline strokes and refined minimal character',
  },
  {
    family: 'Teko',
    category: 'display',
    weights: ['400', '600', '700'],
    vibe: 'Condensed Tech / Strong',
    nbModifier: 'ultra-condensed, technical display typeface with efficient narrow form and authoritative presence',
  },

  // ── SERIF – ELEGANT / PREMIUM ─────────────────────────────────────────────
  {
    family: 'Playfair Display',
    category: 'serif',
    weights: ['400', '700'],
    vibe: 'Luxury / Premium / Elegant',
    nbModifier: 'sophisticated, high-contrast, elegant serif editorial with refined hairlines',
  },
  {
    family: 'Cormorant Garamond',
    category: 'serif',
    weights: ['400', '600'],
    vibe: 'Heritage / Old Money / High Fashion',
    nbModifier: 'ultra-refined, delicate high-contrast serif with extreme elegance and editorial grace',
  },
  {
    family: 'DM Serif Display',
    category: 'serif',
    weights: ['400'],
    vibe: 'Premium Editorial / Magazine',
    nbModifier: 'high-contrast editorial serif with strong headline presence and ink-trap details',
  },
  {
    family: 'Instrument Serif',
    category: 'serif',
    weights: ['400'],
    vibe: 'Contemporary Serif / Editorial',
    nbModifier: 'contemporary, refined serif with elegant contrast and editorial sophistication',
  },
  {
    family: 'EB Garamond',
    category: 'serif',
    weights: ['400', '600', '700'],
    vibe: 'Classic / Refined / Literary',
    nbModifier: 'classic old-style Garamond serif with refined elegance and literary distinction',
  },
  {
    family: 'Lora',
    category: 'serif',
    weights: ['400', '600', '700'],
    vibe: 'Warm Editorial / Blog / Lifestyle',
    nbModifier: 'warm, brushed-stroke editorial serif with balanced contemporary and literary character',
  },
  {
    family: 'Merriweather',
    category: 'serif',
    weights: ['400', '700'],
    vibe: 'Editorial / News / Strong',
    nbModifier: 'strong, slightly condensed editorial serif designed for maximum display-size authority',
  },
  {
    family: 'Libre Baskerville',
    category: 'serif',
    weights: ['400', '700'],
    vibe: 'Classic / Professional / Traditional',
    nbModifier: 'classic Baskerville-influenced serif with high contrast and traditional typographic dignity',
  },
  {
    family: 'Bitter',
    category: 'serif',
    weights: ['400', '600', '700'],
    vibe: 'Strong Slab / Editorial',
    nbModifier: 'strong slab-serif with sturdy ink-trap letterforms and confident editorial presence',
  },
  {
    family: 'Cinzel',
    category: 'serif',
    weights: ['400', '700', '900'],
    vibe: 'Luxury / Roman / Monumental',
    nbModifier: 'Roman-inspired, monumental serif with inscriptional all-caps letterforms and timeless luxury',
  },
  {
    family: 'Roboto Slab',
    category: 'serif',
    weights: ['400', '700'],
    vibe: 'Slab / Versatile / Tech Serif',
    nbModifier: 'clean, geometric slab-serif with mechanical construction and versatile tech-brand authority',
  },
  {
    family: 'Source Serif 4',
    category: 'serif',
    weights: ['400', '600', '700'],
    vibe: 'Editorial / Long-Form / Clean',
    nbModifier: 'clean, balanced editorial serif with high legibility and refined long-form typographic character',
  },
  {
    family: 'Crimson Text',
    category: 'serif',
    weights: ['400', '600', '700'],
    vibe: 'Old-Style / Literary / Vintage',
    nbModifier: 'old-style, literary serif with warm vintage character and refined ink-trapping at headlines',
  },
  {
    family: 'Arvo',
    category: 'serif',
    weights: ['400', '700'],
    vibe: 'Geometric Slab / Bold',
    nbModifier: 'geometric slab-serif with bold, structured letterforms and confident display presence',
  },

  // ── HANDWRITING / SCRIPT ──────────────────────────────────────────────────
  {
    family: 'Dancing Script',
    category: 'handwriting',
    weights: ['400', '700'],
    vibe: 'Script / Elegant Handwriting',
    nbModifier: 'flowing, bouncy script with casual elegance and handwritten warmth',
  },
  {
    family: 'Caveat',
    category: 'handwriting',
    weights: ['400', '700'],
    vibe: 'Casual / Handwritten / Authentic',
    nbModifier: 'casual, organic handwriting-style with authentic pen-stroked character',
  },
  {
    family: 'Pacifico',
    category: 'handwriting',
    weights: ['400'],
    vibe: 'Retro / Surf / Casual Friendly',
    nbModifier: 'retro, friendly script-influenced display with rounded casual warmth and beach-culture nostalgia',
  },

  // ── MONOSPACE ─────────────────────────────────────────────────────────────
  {
    family: 'JetBrains Mono',
    category: 'monospace',
    weights: ['400', '700'],
    vibe: 'Developer / Code / Technical',
    nbModifier: 'developer-aesthetic monospace with clear letterform distinction and technical precision',
  },
  {
    family: 'IBM Plex Mono',
    category: 'monospace',
    weights: ['400', '700'],
    vibe: 'Technical / Industrial Mono',
    nbModifier: 'IBM-designed technical monospace with industrial precision and authoritative mechanical character',
  },
  {
    family: 'Geist Mono',
    category: 'monospace',
    weights: ['400', '700'],
    vibe: 'Modern Developer / Vercel Style',
    nbModifier: 'ultra-modern developer monospace with clean minimal character and contemporary code-editor aesthetic',
  },
];

export const BLINK_GOOGLE_FONTS = GOOGLE_FONTS_REGISTRY;

export function matchFontToBrandVibe(description: string = '', industry: string = ''): BrandFontConfig {
  const ctx = `${description} ${industry}`.toLowerCase();

  if (ctx.includes('luxury') || ctx.includes('premium') || ctx.includes('boutique') || ctx.includes('furniture') || ctx.includes('interior') || ctx.includes('jewel')) {
    return GOOGLE_FONTS_REGISTRY.find(f => f.family === 'Playfair Display')!;
  }
  if (ctx.includes('fashion') || ctx.includes('couture') || ctx.includes('heritage') || ctx.includes('editorial')) {
    return GOOGLE_FONTS_REGISTRY.find(f => f.family === 'Cormorant Garamond')!;
  }
  if (ctx.includes('bold') || ctx.includes('creative') || ctx.includes('poster') || ctx.includes('music') || ctx.includes('event') || ctx.includes('entertainment')) {
    return GOOGLE_FONTS_REGISTRY.find(f => f.family === 'Syne')!;
  }
  if (ctx.includes('street') || ctx.includes('urban') || ctx.includes('sport') || ctx.includes('fitness') || ctx.includes('gym')) {
    return GOOGLE_FONTS_REGISTRY.find(f => f.family === 'Bebas Neue')!;
  }
  if (ctx.includes('tech') || ctx.includes('software') || ctx.includes('saas') || ctx.includes('app') || ctx.includes('startup')) {
    return GOOGLE_FONTS_REGISTRY.find(f => f.family === 'Space Grotesk')!;
  }
  if (ctx.includes('minimal') || ctx.includes('clean') || ctx.includes('modern')) {
    return GOOGLE_FONTS_REGISTRY.find(f => f.family === 'Plus Jakarta Sans')!;
  }
  if (ctx.includes('food') || ctx.includes('restaurant') || ctx.includes('cafe') || ctx.includes('beverage')) {
    return GOOGLE_FONTS_REGISTRY.find(f => f.family === 'Bricolage Grotesque')!;
  }
  if (ctx.includes('beauty') || ctx.includes('skincare') || ctx.includes('wellness') || ctx.includes('health')) {
    return GOOGLE_FONTS_REGISTRY.find(f => f.family === 'DM Sans')!;
  }

  return GOOGLE_FONTS_REGISTRY.find(f => f.family === 'Inter')!;
}

export function injectGoogleFont(fontFamily: string) {
  if (typeof window === 'undefined') return;
  const id = `gf-${fontFamily.toLowerCase().replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
}

export function loadCustomFont(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const fontName = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]/g, ' ').trim();
      try {
        const fontFace = new FontFace(fontName, buffer);
        await fontFace.load();
        (document.fonts as any).add(fontFace);
        resolve(fontName);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
