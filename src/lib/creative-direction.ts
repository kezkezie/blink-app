/**
 * BlinkSpot Creative Direction Engine
 *
 * Transforms brand DNA + user intent into a multi-layered creative brief.
 * Behaves like an AI creative director with taste, not a prompt assembler.
 *
 * Architecture:
 *   brand DNA + user intent
 *     → campaign archetype (randomized, brand-weighted)
 *     → design energy (randomized, tone-weighted)
 *     → emotional tone
 *     → composition system
 *     → lighting direction
 *     → depth & layering
 *     → visual tension (randomized 2–3 elements)
 *     → subject expansion
 *     → assembled campaign brief
 *     → style rendering language (appended from MARKETING_STYLES)
 */

// ── TYPES ────────────────────────────────────────────────────────────────────

export interface BrandContext {
  name?: string;
  industry?: string;
  imageStyle?: string;
  brandVoice?: string;
  logoUrl?: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  primaryFont?: string;
  websiteUrl?: string;
}

export interface GenerationConfig {
  topic: string;
  style: string;
  mode: string;
  customTypography?: string;
}

export interface CreativeDirection {
  campaignArchetype: string;
  designEnergy: string;
  archetype: keyof typeof ARCHETYPES;
  emotion: keyof typeof EMOTIONAL_TONES;
  composition: keyof typeof COMPOSITION_SYSTEMS;
  lighting: keyof typeof LIGHTING_SYSTEMS;
  depth: keyof typeof DEPTH_LAYERING;
  energy: keyof typeof VISUAL_ENERGY;
  tensionElements: string[];
  subjectPlacement: keyof typeof SUBJECT_PLACEMENT;
  typographyBehavior?: keyof typeof TYPOGRAPHY_BEHAVIORS;
}

export interface AssembledCreative {
  prompt: string;
  negativePrompt: string;
  direction: CreativeDirection;
}

// ── RANDOMIZATION ENGINE ──────────────────────────────────────────────────────

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMultipleRandom<T>(arr: readonly T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function weightedPick<T>(items: readonly T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let threshold = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    threshold -= weights[i];
    if (threshold <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ── CAMPAIGN ARCHETYPES ───────────────────────────────────────────────────────
// Randomized per generation to prevent repetition. Brand-weighted selection.

const CAMPAIGN_ARCHETYPES = [
  {
    label: "luxury fashion editorial",
    direction: "The product is a cultural artifact, styled with the precision of a Vogue shoot. The image feels like it belongs on a museum wall and a magazine cover simultaneously.",
    industries: ["fashion", "beauty", "luxury", "jewelry", "lifestyle", "cosmetics"],
  },
  {
    label: "high-end architectural campaign",
    direction: "The product and its environment are creative equals. Space is sculpture. The image communicates through architectural tension, not product description.",
    industries: ["home", "interior", "furniture", "real estate", "architecture", "design"],
  },
  {
    label: "Apple-style product launch",
    direction: "Absolute restraint. The product floats in engineered silence. Nothing competes. The simplicity is the loudest possible statement.",
    industries: ["tech", "saas", "software", "startup", "ai", "fintech"],
  },
  {
    label: "Nike cinematic motion",
    direction: "Emotional urgency. The image leans forward into its own future. Kinetic, alive, the viewer feels forward momentum even in a still frame.",
    industries: ["fitness", "sport", "health", "wellness", "lifestyle"],
  },
  {
    label: "Milan Design Week editorial",
    direction: "Where furniture, fashion, and architecture argue beautifully. The image looks like a published editorial from a design week event that actually happened.",
    industries: ["furniture", "home", "interior", "design", "art", "luxury"],
  },
  {
    label: "neo-brutalist social campaign",
    direction: "Raw material contrast, typographic aggression, deliberate rule-breaking. The image feels designed by someone who has seen too many safe campaigns and refuses.",
    industries: ["music", "streetwear", "gaming", "art", "agency", "media", "events"],
  },
  {
    label: "futuristic startup poster",
    direction: "Clean geometry, light refraction, the product belongs to tomorrow. The image makes the viewer feel they are seeing something slightly ahead of where the world currently is.",
    industries: ["tech", "saas", "ai", "crypto", "fintech", "startup"],
  },
  {
    label: "luxury monochrome statement",
    direction: "A desaturated world where material texture and form become everything. Color is withheld as a design decision. The image communicates through shadow and surface.",
    industries: ["luxury", "fashion", "beauty", "jewelry", "architecture", "premium"],
  },
  {
    label: "Swiss editorial magazine spread",
    direction: "Grid tension and compositional freedom coexisting. Discipline that makes the single expressive break more powerful. The image feels typographically and visually considered at the same time.",
    industries: ["publishing", "design", "art", "media", "fashion", "brand"],
  },
  {
    label: "museum-grade product showcase",
    direction: "The product as artifact. Displayed with curatorial intention, as if it belongs in a permanent collection. The viewer treats it with corresponding reverence.",
    industries: ["jewelry", "luxury", "art", "design", "beauty", "premium"],
  },
  {
    label: "cinematic sculpture campaign",
    direction: "The product as monument. Environmental drama as supporting cast. The image has the compositional weight of a film still from a movie that has not been made yet.",
    industries: ["furniture", "home", "beauty", "luxury", "lifestyle"],
  },
  {
    label: "experimental graphic composition",
    direction: "Convention broken not for shock but for revelation. The image looks like it came from a design studio that treats every project as an opportunity to invent a new visual language.",
    industries: ["art", "design", "music", "agency", "fashion", "streetwear"],
  },
] as const;

// ── DESIGN ENERGY ────────────────────────────────────────────────────────────
// Randomized per generation. Sets the overall emotional register and visual rhythm.

const DESIGN_ENERGY_OPTIONS = [
  {
    label: "calm luxury minimalism",
    direction: "Held breath before the exhale. The image is quiet, commanding, and unrushed. Premium through restraint.",
    tones: ["quiet", "minimal", "calm", "premium", "elegant", "luxury"],
  },
  {
    label: "high-tension kinetic motion",
    direction: "The image has velocity. Lines and forms pull outward. The viewer feels momentum and urgency without anything physically moving.",
    tones: ["bold", "energy", "dynamic", "power", "vibrant", "fast"],
  },
  {
    label: "editorial fashion energy",
    direction: "A charged creative decision on every centimeter of the frame. The image feels like it went through three rounds of creative direction before arriving here.",
    tones: ["editorial", "fashion", "design", "creative", "curated"],
  },
  {
    label: "futuristic architectural drama",
    direction: "Cold precision meeting organic presence. The image makes the familiar feel slightly alien and more beautiful for it.",
    tones: ["technical", "precise", "futuristic", "clean", "modern"],
  },
  {
    label: "brutalist premium tension",
    direction: "Raw texture and refined object in deliberate collision. The image should not be comfortable but it should be impossible to look away from.",
    tones: ["bold", "raw", "edgy", "disruptive", "strong"],
  },
  {
    label: "soft emotional atmosphere",
    direction: "Warm and enveloping. The image holds the viewer rather than impressing them. Desire created through feeling, not specification.",
    tones: ["warm", "friendly", "authentic", "approachable", "human"],
  },
  {
    label: "bold graphic aggression",
    direction: "Scale contrast and visual weight used with surgical precision. The image takes up more space in the mind than it does on the screen.",
    tones: ["aggressive", "bold", "strong", "graphic", "powerful"],
  },
  {
    label: "experimental graphic composition",
    direction: "Established visual conventions exist here only to be broken with intention. The image looks like it was made by someone who has seen everything and chose to invent something new.",
    tones: ["experimental", "creative", "unconventional", "art", "design"],
  },
] as const;

// ── VISUAL TENSION ELEMENTS ───────────────────────────────────────────────────
// 2–3 picked randomly per generation to create unpredictability and aliveness.

const VISUAL_TENSION_ELEMENTS = [
  "the subject partially leaves the frame — what is cropped implies a larger world beyond the edges",
  "a foreground element interrupts the primary subject, creating unexpected depth and visual intrigue",
  "extreme scale contrast between two elements — one element is enormous, one is intimate",
  "the composition has aggressive asymmetric weight — visual gravity is deliberately off-center",
  "the subject is cropped dramatically — exclusion is as powerful as what is shown",
  "a depth layer that defies the scene's logic — foreground interruption that shouldn't exist physically but feels right",
  "perspective distortion that makes the familiar feel architecturally unfamiliar",
  "shadow as a positive compositional element — the cast shadow is as important as the object",
  "the environment bleeds into the subject — the boundary between object and space is intentionally ambiguous",
  "negative space used aggressively — the empty field has as much visual weight as the subject",
] as const;

// ── EXISTING SYSTEMS ──────────────────────────────────────────────────────────

const ARCHETYPES = {
  editorial_luxury: {
    label: "Editorial Luxury",
    brief: (subject: string) =>
      `${subject} elevated to luxury editorial hero — isolated within an architectural environment, material texture rendered with absolute clarity, the object as a cultural statement`,
    industryAffinity: ["fashion", "beauty", "jewelry", "luxury", "lifestyle", "wellness", "cosmetics", "skincare"],
  },
  cinematic_campaign: {
    label: "Cinematic Campaign",
    brief: (subject: string) =>
      `${subject} captured as a cinematic campaign still — the subject exists within a world that amplifies its meaning, environment chosen for emotional resonance over product clarity`,
    industryAffinity: ["entertainment", "food", "travel", "fitness", "sport", "beverage", "automotive", "media"],
  },
  brutalist_graphic: {
    label: "Brutalist Graphic",
    brief: (subject: string) =>
      `${subject} treated with graphic authority — aggressive compositional tension, raw scale contrast between subject and field, deliberate rule-breaking placement that demands attention`,
    industryAffinity: ["music", "streetwear", "gaming", "art", "agency", "media", "events", "nightlife"],
  },
  tech_precision: {
    label: "Tech Precision",
    brief: (subject: string) =>
      `${subject} rendered with technical precision — clean geometric environment, UI-inspired visual language, cold premium palette, the subject as an engineering and design statement`,
    industryAffinity: ["tech", "saas", "fintech", "startup", "ai", "software", "crypto", "data", "b2b"],
  },
  campaign_emotional: {
    label: "Campaign Emotional",
    brief: (subject: string) =>
      `${subject} placed within an emotionally resonant human context — authentic atmosphere, documentary-quality light, the subject serves the feeling not the catalog`,
    industryAffinity: ["health", "wellness", "ngo", "community", "education", "social", "charity", "parenting"],
  },
  aspirational_lifestyle: {
    label: "Aspirational Lifestyle",
    brief: (subject: string) =>
      `${subject} embedded in an aspirational lifestyle environment — the context elevates the subject, desire created through implication rather than description`,
    industryAffinity: ["food", "home", "interior", "real estate", "architecture", "restaurant", "hospitality"],
  },
  luxury_minimal: {
    label: "Luxury Minimal",
    brief: (subject: string) =>
      `${subject} as the sole protagonist within extreme negative space — silence as design philosophy, the emptiness amplifies rather than isolates, premium through restraint`,
    industryAffinity: ["luxury", "finance", "legal", "consulting", "architecture", "jewelry", "premium"],
  },
} as const;

const EMOTIONAL_TONES = {
  quiet_luxury: "atmosphere of earned sophistication — calm, premium, and understated. The image communicates status without announcing it",
  aspirational_heat: "forward momentum and desire — the image leans into the future, kinetic ambition, you want what this represents",
  playful_confidence: "bold self-assured energy with a light touch — vibrant without noise, fun that reads as intentional not accidental",
  raw_authenticity: "unfiltered honest atmosphere — grounded, real, no digital polish. The imperfection IS the message",
  cool_authority: "clinical precision and expert distance — the visual communicates mastery through restraint not expression",
  warm_connection: "genuine human empathy — approachable warmth, the image invites rather than impresses",
  dark_sophistication: "moody depth and quiet mystery — shadow-heavy, exclusive, the image withholds as much as it reveals",
  electric_energy: "high-voltage visual presence — the image has a pulse, urgent, unmissable, kinetic at rest",
} as const;

const COMPOSITION_SYSTEMS = {
  asymmetric_tension: "visual weight is deliberately imbalanced — the subject commands from an unexpected position. The silence on one side is active, not empty. The viewer's eye is pulled then released",
  edge_breaking: "the subject refuses containment — it presses against and beyond the frame. Partial visibility creates more presence than full visibility. The image implies a larger world",
  diagonal_thrust: "visual energy flows corner to corner in a single directional pulse — the composition has velocity, the eye cannot rest, everything moves toward a point of release",
  layered_depth: "the image has atmosphere — a foreground element, a commanding subject, and an environment that recedes with intention. Each plane breathes independently",
  negative_space_dominance: "silence is the loudest design element. The subject occupies its territory with authority, surrounded by held space that amplifies rather than empties",
  grid_override: "order is established, then deliberately broken at one precise point — the tension between structure and freedom is the visual energy",
  centered_authority: "centering is deployed as a power statement, not a default — bilateral symmetry that commands rather than rests. Formal, inevitable, impossible to look past",
} as const;

const LIGHTING_SYSTEMS = {
  golden_side_light: "warm directional side-light — long cast shadows travel across the frame, rich gradient from deep shadow to warm highlight, material surfaces glow",
  studio_rim_light: "precise rim lighting separates subject from background with a clean edge of light — controlled fill, material rendering at its most honest",
  hard_architectural_light: "high-contrast single source — dramatic hard shadows cut geometric shapes across the frame, minimal fill, the darkness is as important as the light",
  soft_nordic_diffusion: "even overcast diffusion — premium Scandinavian light quality, all surfaces receive equal attention, flat but rich",
  neon_urban_practicals: "colored practical light sources — neon signs or colored gels interact with shadow zones, urban premium atmosphere, shadows carry color",
  backlit_silhouette: "strong backlight source reduces the subject to a powerful silhouette — form over detail, the outline becomes the entire message",
  natural_interior_window: "soft directional natural window light — warmth of the interior environment, lifestyle premium quality, the light feels lived-in",
  cinematic_volumetric: "visible volumetric light shafts or haze — light becomes a physical presence in the frame, atmospheric depth, cinematic production value",
} as const;

const DEPTH_LAYERING = {
  foreground_interruption: "a graphic element, shadow, or object cuts across the primary subject in the foreground plane — depth created through visual interruption, not blur",
  cinematic_bokeh: "tack-sharp subject against a heavily blurred environmental background — lens-quality depth separation, the subject is the only reality",
  atmospheric_haze: "soft environmental haze or light bleed creates background separation — subject emerges from depth rather than sitting in front of it",
  hard_geometry_stack: "flat graphic layers stacked at visible depth intervals — graphic depth, each plane defined by contrast not softness",
  mirror_reflection: "a reflective surface beneath or beside the subject mirrors it — depth created through repetition, the subject exists twice in the frame",
  shadow_geometry: "cast shadows create a secondary compositional layer — the shadow is as designed as the subject, geometric and intentional",
} as const;

const VISUAL_ENERGY = {
  kinetic_force: "dynamic energy — motion paths implied through composition, diagonal elements, the image appears to move even at rest",
  still_authority: "absolute stillness — commanding presence through total compositional rest, power expressed as zero movement",
  flowing_grace: "organic rhythm — curved lines, soft transitions, natural movement that feels inevitable not staged",
  geometric_precision: "hard architectural order — structural rhythm, precision-cut visual edges, every element placed with engineering accuracy",
  chaotic_signal: "controlled visual disruption — colliding scales, deliberate compositional noise that reads as intentional chaos, not accident",
} as const;

const TENSION_SYSTEMS = {
  scale_contrast: "at least two elements with extreme scale difference — a micro detail alongside an architectural macro element",
  oversized_type: "typographic element at architectural scale — letterforms as dominant visual structure, type treated as building material",
  subject_overflow: "the primary subject is too large for the frame — cropped aggressively on multiple edges, partial visibility creates more presence than full visibility",
  layered_foreground: "a distinct foreground element interrupts and partially obscures the subject — depth through occlusion, layers interact",
  aggressive_crop: "unconventional crop removes context deliberately — only what is essential survives, the omission is meaningful",
  diagonal_motion_lines: "implied motion trails or directional lines at diagonals — the image has a sense of velocity even if nothing is moving",
} as const;

const SUBJECT_PLACEMENT = {
  lower_third_anchor: "the subject is grounded — weight at the base, the upper field open and breathing, a sense of calm authority",
  upper_float: "the subject levitates — the space beneath it is active, the subject has escaped gravity without losing presence",
  extreme_edge: "the subject inhabits the margin — the vast opposing field becomes a silence that gives the subject enormous power",
  full_frame_overflow: "the subject consumes the frame — no context, no distance, pure immersive presence",
  centered_command: "the subject looks back at you — bilateral stillness used as a formal power move, the composition commands rather than requests",
} as const;

const TYPOGRAPHY_BEHAVIORS = {
  oversized_display: "headline typography at architectural scale — letterforms ARE the composition, text and image are inseparable design partners",
  editorial_integration: "type woven into the image space — text and visual subject interact, the words exist inside the world of the image not above it",
  minimal_accent: "a single word or brand name in small, precise, high-contrast placement — typographic restraint where less carries more weight",
  structural_grid: "the entire layout grid is built FROM the typography outward — type defines the compositional architecture",
  ghost_presence: "ultra-light barely-visible type as texture — subliminal brand presence, felt more than read",
} as const;

// ── SELECTION ENGINE ──────────────────────────────────────────────────────────

function normalizeIndustry(raw?: string): string {
  return (raw || "").toLowerCase().replace(/[^a-z\s]/g, "");
}

function selectCampaignArchetype(brand: BrandContext, style: string): typeof CAMPAIGN_ARCHETYPES[number] {
  const industry = normalizeIndustry(brand.industry);

  // Build weighted list — higher weight for archetypes matching this brand's industry
  const weights = CAMPAIGN_ARCHETYPES.map(a => {
    const match = a.industries.some(ind => industry.includes(ind));
    return match ? 3 : 1; // 3x more likely if industry matches
  });

  // Style-specific nudges
  if (style === "abstract") {
    const idx = CAMPAIGN_ARCHETYPES.findIndex(a => a.label === "experimental graphic composition");
    if (idx >= 0) weights[idx] += 3;
  }
  if (style === "cinematic") {
    const idx = CAMPAIGN_ARCHETYPES.findIndex(a => a.label === "cinematic sculpture campaign");
    if (idx >= 0) weights[idx] += 3;
  }

  return weightedPick(CAMPAIGN_ARCHETYPES, weights);
}

function selectDesignEnergy(brand: BrandContext): typeof DESIGN_ENERGY_OPTIONS[number] {
  const voice = (brand.brandVoice || brand.imageStyle || "").toLowerCase();
  const industry = normalizeIndustry(brand.industry);

  const weights = DESIGN_ENERGY_OPTIONS.map(e => {
    const toneMatch = e.tones.some(t => voice.includes(t));
    return toneMatch ? 3 : 1;
  });

  return weightedPick(DESIGN_ENERGY_OPTIONS, weights);
}

function selectVisualTension(): string[] {
  return pickMultipleRandom(VISUAL_TENSION_ELEMENTS, 2);
}

function selectArchetype(brand: BrandContext, style: string): keyof typeof ARCHETYPES {
  const industry = normalizeIndustry(brand.industry);
  const voice = (brand.brandVoice || brand.imageStyle || "").toLowerCase();

  if (style === "flatlay") return "editorial_luxury";
  if (style === "abstract") return "brutalist_graphic";
  if (style === "poster") {
    if (["music", "gaming", "art", "event"].some(k => industry.includes(k))) return "brutalist_graphic";
    return "editorial_luxury";
  }

  for (const [key, archetype] of Object.entries(ARCHETYPES)) {
    if (archetype.industryAffinity.some(k => industry.includes(k))) {
      return key as keyof typeof ARCHETYPES;
    }
  }

  if (["minimal", "clean", "simple", "premium", "elegant"].some(k => voice.includes(k))) return "luxury_minimal";
  if (["bold", "raw", "edgy", "disruptive"].some(k => voice.includes(k))) return "brutalist_graphic";
  if (["warm", "authentic", "human", "community"].some(k => voice.includes(k))) return "campaign_emotional";
  if (["technical", "precise", "data", "professional"].some(k => voice.includes(k))) return "tech_precision";

  return "cinematic_campaign";
}

function selectEmotion(brand: BrandContext, style: string): keyof typeof EMOTIONAL_TONES {
  const voice = (brand.brandVoice || brand.imageStyle || "").toLowerCase();
  const industry = normalizeIndustry(brand.industry);

  if (["quiet", "minimal", "restrained", "subtle", "luxury"].some(k => voice.includes(k))) return "quiet_luxury";
  if (["bold", "energy", "power", "dynamic", "vibrant"].some(k => voice.includes(k))) return "electric_energy";
  if (["warm", "friendly", "human", "approachable"].some(k => voice.includes(k))) return "warm_connection";
  if (["playful", "fun", "young", "fresh", "creative"].some(k => voice.includes(k))) return "playful_confidence";
  if (["authentic", "real", "honest", "raw", "genuine"].some(k => voice.includes(k))) return "raw_authenticity";
  if (["professional", "expert", "trusted", "authority"].some(k => voice.includes(k))) return "cool_authority";
  if (["dark", "moody", "exclusive", "mystery", "noir"].some(k => voice.includes(k))) return "dark_sophistication";

  if (["luxury", "jewelry", "fashion", "beauty"].some(k => industry.includes(k))) return "quiet_luxury";
  if (["tech", "saas", "fintech", "startup"].some(k => industry.includes(k))) return "cool_authority";
  if (["music", "streetwear", "gaming"].some(k => industry.includes(k))) return "electric_energy";
  if (["health", "wellness", "community"].some(k => industry.includes(k))) return "warm_connection";
  if (style === "lifestyle") return "aspirational_heat";
  if (style === "cinematic") return "dark_sophistication";

  return "aspirational_heat";
}

function selectComposition(brand: BrandContext, style: string): keyof typeof COMPOSITION_SYSTEMS {
  const voice = (brand.brandVoice || "").toLowerCase();

  if (style === "studio" || style === "flatlay") {
    if (["minimal", "clean", "restrained"].some(k => voice.includes(k))) return "negative_space_dominance";
    return "asymmetric_tension";
  }
  if (style === "cinematic") return "layered_depth";
  if (style === "poster") {
    if (["bold", "edgy", "raw"].some(k => voice.includes(k))) return "edge_breaking";
    return "centered_authority";
  }
  if (style === "lifestyle") return "asymmetric_tension";
  if (style === "abstract") return "edge_breaking";
  if (style === "brand") return "centered_authority";

  return "asymmetric_tension";
}

function selectLighting(brand: BrandContext, style: string, archetype: keyof typeof ARCHETYPES): keyof typeof LIGHTING_SYSTEMS {
  const industry = normalizeIndustry(brand.industry);

  if (style === "cinematic") return "cinematic_volumetric";
  if (style === "studio") return "studio_rim_light";
  if (style === "lifestyle") {
    if (["home", "interior", "food", "restaurant"].some(k => industry.includes(k))) return "natural_interior_window";
    return "golden_side_light";
  }
  if (style === "poster") {
    if (archetype === "brutalist_graphic") return "hard_architectural_light";
    return "studio_rim_light";
  }
  if (style === "flatlay") return "soft_nordic_diffusion";
  if (style === "abstract") return "neon_urban_practicals";

  if (["tech", "saas", "startup", "ai"].some(k => industry.includes(k))) return "hard_architectural_light";
  if (["luxury", "fashion", "beauty"].some(k => industry.includes(k))) return "studio_rim_light";
  if (["food", "lifestyle", "wellness"].some(k => industry.includes(k))) return "natural_interior_window";

  return "cinematic_volumetric";
}

function selectDepth(style: string, archetype: keyof typeof ARCHETYPES): keyof typeof DEPTH_LAYERING {
  if (style === "cinematic" || style === "lifestyle") return "cinematic_bokeh";
  if (style === "studio") return "shadow_geometry";
  if (style === "flatlay") return "hard_geometry_stack";
  if (style === "poster") {
    if (archetype === "brutalist_graphic") return "foreground_interruption";
    return "shadow_geometry";
  }
  if (style === "abstract") return "atmospheric_haze";
  if (archetype === "luxury_minimal") return "mirror_reflection";
  return "cinematic_bokeh";
}

function selectEnergy(brand: BrandContext, archetype: keyof typeof ARCHETYPES): keyof typeof VISUAL_ENERGY {
  const voice = (brand.brandVoice || brand.imageStyle || "").toLowerCase();

  if (archetype === "brutalist_graphic") return "chaotic_signal";
  if (archetype === "luxury_minimal" || archetype === "editorial_luxury") return "still_authority";
  if (archetype === "tech_precision") return "geometric_precision";
  if (archetype === "aspirational_lifestyle" || archetype === "campaign_emotional") return "flowing_grace";

  if (["dynamic", "energy", "bold", "power", "fast"].some(k => voice.includes(k))) return "kinetic_force";
  if (["calm", "minimal", "quiet", "restrained"].some(k => voice.includes(k))) return "still_authority";

  return "kinetic_force";
}

function selectTension(style: string, archetype: keyof typeof ARCHETYPES): keyof typeof TENSION_SYSTEMS {
  if (style === "poster") return "oversized_type";
  if (archetype === "brutalist_graphic") return "subject_overflow";
  if (archetype === "luxury_minimal") return "aggressive_crop";
  if (archetype === "tech_precision") return "scale_contrast";
  if (style === "cinematic") return "layered_foreground";
  return "scale_contrast";
}

function selectPlacement(composition: keyof typeof COMPOSITION_SYSTEMS, style: string): keyof typeof SUBJECT_PLACEMENT {
  if (composition === "centered_authority") return "centered_command";
  if (composition === "edge_breaking") return "full_frame_overflow";
  if (composition === "negative_space_dominance") return "extreme_edge";
  if (style === "lifestyle") return "lower_third_anchor";
  if (style === "cinematic") return "extreme_edge";
  return "lower_third_anchor";
}

function selectTypography(style: string, archetype: keyof typeof ARCHETYPES): keyof typeof TYPOGRAPHY_BEHAVIORS | undefined {
  if (style === "poster") {
    if (archetype === "brutalist_graphic") return "oversized_display";
    return "editorial_integration";
  }
  if (style === "abstract") return "ghost_presence";
  return undefined;
}

// ── CONCEPT EXPANSION ─────────────────────────────────────────────────────────

function expandConcept(topic: string, brand: BrandContext, archetype: keyof typeof ARCHETYPES): string {
  const archetypeObj = ARCHETYPES[archetype];
  const subject = topic.trim() || inferSubjectFromBrand(brand);
  return archetypeObj.brief(subject);
}

function inferSubjectFromBrand(brand: BrandContext): string {
  const industry = normalizeIndustry(brand.industry);

  if (["fashion", "beauty", "cosmetics", "skincare"].some(k => industry.includes(k))) return "a signature product from the collection";
  if (["food", "restaurant", "beverage", "cafe"].some(k => industry.includes(k))) return "a hero dish or signature product crafted with intention";
  if (["tech", "saas", "software", "ai"].some(k => industry.includes(k))) return "the product interface on a premium device in context";
  if (["fitness", "sport", "health"].some(k => industry.includes(k))) return "a decisive training moment captured at peak intensity";
  if (["home", "interior", "furniture", "real estate"].some(k => industry.includes(k))) return "a signature interior composition that defines the brand's spatial language";
  if (["jewelry", "luxury", "watches"].some(k => industry.includes(k))) return "the hero product under precise jeweler's light";
  if (["music", "entertainment", "media"].some(k => industry.includes(k))) return "a defining artist or brand moment";
  if (["finance", "consulting", "legal"].some(k => industry.includes(k))) return "an architectural representation of precision and trust";

  return brand.description
    ? `a visual representation of ${brand.description.substring(0, 80)}`
    : `the core offering of ${brand.name || "the brand"} expressed as a campaign visual`;
}

// ── NEGATIVE PROMPT BUILDER ───────────────────────────────────────────────────

function buildNegativePrompt(archetype: keyof typeof ARCHETYPES, style: string): string {
  const base = [
    "watermark", "logo overlay", "text overlay", "generic stock photo aesthetic",
    "centered catalog composition", "flat e-commerce lighting",
    "corporate clip art", "plastic texture", "oversaturated colors",
    "busy cluttered background", "amateur photography", "HDR artifacts",
    "template flyer layout", "Canva aesthetic", "infographic layout",
    "rigid grid zones", "corporate PowerPoint design",
  ];

  const styleSpecific: Record<string, string[]> = {
    cinematic: ["overexposed highlights", "flat lighting", "symmetrical composition"],
    poster: ["clip art borders", "gradient backgrounds", "default system fonts", "unbalanced text placement"],
    lifestyle: ["posed stiffness", "obvious studio backdrop", "catalog placement"],
    studio: ["environmental distractions", "uneven lighting", "soft focus product edges"],
    flatlay: ["random object placement", "uneven spacing", "dark shadow trenches between objects"],
    abstract: ["realistic photography style", "natural textures", "busy patterns"],
  };

  const archetypeSpecific: Record<string, string[]> = {
    editorial_luxury: ["busy backgrounds", "garish color combinations", "multiple competing focal points"],
    brutalist_graphic: ["soft rounded edges", "pastel colors", "safe balanced layout"],
    tech_precision: ["organic shapes", "handwritten elements", "decorative flourishes"],
    luxury_minimal: ["busy compositions", "saturated backgrounds", "multiple competing elements"],
  };

  return [
    ...base,
    ...(styleSpecific[style] || []),
    ...(archetypeSpecific[archetype] || []),
  ].join(", ");
}

// ── SYNTHESIS HELPERS ─────────────────────────────────────────────────────────
// Each function produces ONE authored sentence combining multiple systems.
// This replaces the old "enumerate all systems" approach.

function synthesizeThesis(subject: string, emotion: keyof typeof EMOTIONAL_TONES): string {
  const map: Record<keyof typeof EMOTIONAL_TONES, string> = {
    quiet_luxury: `${subject} as a cultural statement — not advertised, presented. Status communicated through restraint, not announcement.`,
    aspirational_heat: `${subject} frozen at the exact moment desire forms — the viewer reaches toward something they cannot yet name.`,
    playful_confidence: `${subject} with the self-assurance of something that already knows its own power. The image is alive.`,
    raw_authenticity: `${subject} in its truest form — unpolished, honest, real. The imperfection carries the message.`,
    cool_authority: `${subject} rendered with clinical precision. Mastery communicated through what the image withholds, not what it shows.`,
    warm_connection: `${subject} belonging to a life worth wanting — desire created through intimacy, not specification.`,
    dark_sophistication: `${subject} withheld just enough to make the viewer lean in. The image reveals on its own terms.`,
    electric_energy: `${subject} charged and alive — the image has a pulse. The viewer feels velocity even in a still frame.`,
  };
  return map[emotion];
}

function synthesizeCompositionLine(
  composition: keyof typeof COMPOSITION_SYSTEMS,
  placement: keyof typeof SUBJECT_PLACEMENT,
): string {
  const placementPhrase: Record<keyof typeof SUBJECT_PLACEMENT, string> = {
    lower_third_anchor: "anchors at the base of the frame",
    upper_float: "floats, freed from visual gravity",
    extreme_edge: "inhabits the far margin",
    full_frame_overflow: "consumes the frame entirely — no context, pure immersive presence",
    centered_command: "occupies the center with bilateral authority",
  };
  const compositionEnding: Record<keyof typeof COMPOSITION_SYSTEMS, string> = {
    asymmetric_tension: "Visual weight is deliberately imbalanced — the opposing field is active silence, not empty space.",
    edge_breaking: "The subject refuses containment — what is cropped implies a larger world beyond the edges.",
    diagonal_thrust: "Visual energy flows corner to corner — the composition has velocity; the eye cannot rest.",
    layered_depth: "Three planes breathe independently — foreground, subject, recession — each with its own weight.",
    negative_space_dominance: "The empty field carries equal visual weight to the subject. Silence IS the design decision.",
    grid_override: "Structure established, then broken at one precise point — that tension is the energy of the entire image.",
    centered_authority: "Symmetry deployed as a power statement, not a default — formal, inevitable, impossible to look past.",
  };
  return `The subject ${placementPhrase[placement]}. ${compositionEnding[composition]}`;
}

function synthesizeLightingLine(lighting: keyof typeof LIGHTING_SYSTEMS): string {
  const map: Record<keyof typeof LIGHTING_SYSTEMS, string> = {
    golden_side_light: "Warm directional side-light — long cast shadows travel across the frame, material surfaces glow with earned warmth.",
    studio_rim_light: "Precise rim light isolates the subject with a clean edge. Controlled fill. Material rendered at its most honest — no flattery.",
    hard_architectural_light: "Single hard source — geometric shadow patterns cut across the frame. The darkness is as important as the light.",
    soft_nordic_diffusion: "Even, premium diffused light — all surfaces receive equal attention. Flat but rich with material presence.",
    neon_urban_practicals: "Colored practical sources interact with shadow zones. Urban atmosphere. The shadows carry color.",
    backlit_silhouette: "Strong backlight — the subject becomes a powerful silhouette. Form over detail; the outline is the entire statement.",
    natural_interior_window: "Soft natural window light — the warmth of an inhabited interior. The light feels lived-in, not set up.",
    cinematic_volumetric: "Volumetric light as a physical presence in the frame — haze and light shafts create cinematic atmospheric depth.",
  };
  return map[lighting];
}

function synthesizeCameraLine(archetype: keyof typeof ARCHETYPES): string {
  const map: Record<keyof typeof ARCHETYPES, string> = {
    editorial_luxury: "35mm prime lens. Medium format rendering quality. Ultra-fine material grain. Award-winning commercial photography standard.",
    cinematic_campaign: "Anamorphic lens. Cinematic depth separation. Lens character that signals film quality. A24 cinematography standard.",
    brutalist_graphic: "Wide lens with graphic intent. High contrast. Poster-quality visual impact — the image works at any scale.",
    tech_precision: "Technical precision lens. Clean geometric depth. Cold premium palette. Apple product photography standard.",
    campaign_emotional: "35mm at f/1.8. Documentary light quality. Believable, non-staged. Human truth over production perfection.",
    aspirational_lifestyle: "35mm. Fujifilm tonal warmth. Lifestyle editorial quality. The image looks lived-in, not produced.",
    luxury_minimal: "Ultra-sharp prime. Single focal point. Controlled depth. The emptiness around the subject is engineered.",
  };
  return map[archetype];
}

function synthesizeAtmosphereLine(emotion: keyof typeof EMOTIONAL_TONES): string {
  const map: Record<keyof typeof EMOTIONAL_TONES, string> = {
    quiet_luxury: "The viewer should feel admitted, not impressed — let into something exclusive that does not need to announce itself.",
    aspirational_heat: "The viewer should feel forward momentum — a version of themselves in the future that includes this.",
    playful_confidence: "The viewer should feel the image smiling back — energy that reads as intentional, never accidental.",
    raw_authenticity: "The viewer should feel the image is telling the truth — no polish, no performance, just presence.",
    cool_authority: "The viewer should feel certainty — the image communicates expertise through what it leaves out.",
    warm_connection: "The viewer should feel invited rather than impressed — held by the image, not performed at.",
    dark_sophistication: "The viewer should feel they have arrived during something private. The image reveals slowly, on its own terms.",
    electric_energy: "The viewer should feel the image before they understand it — kinetic, alive, impossible to look away.",
  };
  return map[emotion];
}

function synthesizeTypographyLine(
  typographyBehavior: keyof typeof TYPOGRAPHY_BEHAVIORS | undefined,
  customTypography?: string,
): string | null {
  if (customTypography) {
    return `Typography: ${customTypography}. Type behaves as a physical object in the world — depth, shadow interaction, architectural weight. It belongs to the scene, not above it.`;
  }
  if (!typographyBehavior) return null;
  const map: Record<keyof typeof TYPOGRAPHY_BEHAVIORS, string> = {
    oversized_display: "Typography at architectural scale — letterforms ARE the composition. Text and image are equal partners, inseparable.",
    editorial_integration: "Type woven into the image space — words exist inside the world, sharing depth, shadow, and perspective with the subject.",
    minimal_accent: "Brand name in one precise placement — small, high-contrast, absolute. Typographic restraint where less carries more.",
    structural_grid: "The entire layout builds from the typography outward — type defines the compositional architecture.",
    ghost_presence: "Type barely visible — brand presence felt as texture, subliminal rather than read.",
  };
  return map[typographyBehavior];
}

// ── PROMPT ASSEMBLY ───────────────────────────────────────────────────────────

function assembleCreativeBrief(
  topic: string,
  direction: CreativeDirection,
  brand: BrandContext,
  customTypography?: string,
): string {
  const rawTopic = topic.trim() || inferSubjectFromBrand(brand);
  // Extract the core concept — first sentence or first 100 chars.
  // Guards against AI Magic Writer output (which may be 200+ words) being embedded in the thesis.
  const firstPeriod = rawTopic.search(/\.\s/);
  const subject = (firstPeriod > 10 && firstPeriod <= 120)
    ? rawTopic.substring(0, firstPeriod)
    : rawTopic.length <= 120
    ? rawTopic
    : rawTopic.substring(0, 120).replace(/\s\S*$/, "");

  // ONE emotional thesis — the root of the entire image
  const thesis = synthesizeThesis(subject, direction.emotion);

  // ONE compositional decision
  const composition = synthesizeCompositionLine(direction.composition, direction.subjectPlacement);

  // ONE lighting philosophy
  const lighting = synthesizeLightingLine(direction.lighting);

  // Camera + quality standard
  const camera = synthesizeCameraLine(direction.archetype);

  // What the viewer feels — atmosphere
  const atmosphere = synthesizeAtmosphereLine(direction.emotion);

  // Typography — only if relevant, behavioral not descriptive
  const typeDirective = synthesizeTypographyLine(direction.typographyBehavior, customTypography);

  // Color anchor — only if brand has a primary color
  const colorNote = brand.primaryColor
    ? `Color: ${brand.primaryColor} absorbed across surfaces, light, and shadow — woven in, not applied.`
    : null;

  // Restraint — the most important directive
  const restraint = "Restraint: leave negative space intact. Not every surface needs rendering. Omission creates sophistication. Avoid AI over-density, competing focal points, and visual clutter.";

  return [thesis, composition, lighting, camera, atmosphere, typeDirective, colorNote, restraint]
    .filter(Boolean)
    .join("\n\n");
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

export function selectCreativeDirection(brand: BrandContext, config: GenerationConfig): CreativeDirection {
  const archetype = selectArchetype(brand, config.style);
  const emotion = selectEmotion(brand, config.style);
  const composition = selectComposition(brand, config.style);
  const lighting = selectLighting(brand, config.style, archetype);
  const depth = selectDepth(config.style, archetype);
  const energy = selectEnergy(brand, archetype);
  const subjectPlacement = selectPlacement(composition, config.style);
  const typographyBehavior = config.customTypography ? undefined : selectTypography(config.style, archetype);

  // Randomized systems — fresh every generation
  const campaignArchetypeObj = selectCampaignArchetype(brand, config.style);
  const designEnergyObj = selectDesignEnergy(brand);
  const tensionElements = selectVisualTension();

  return {
    archetype,
    emotion,
    composition,
    lighting,
    depth,
    energy,
    tensionElements,
    subjectPlacement,
    typographyBehavior,
    campaignArchetype: campaignArchetypeObj.label,
    designEnergy: designEnergyObj.label,
  };
}

export function assemblePrompt(
  topic: string,
  direction: CreativeDirection,
  brand: BrandContext,
  stylePromptAddon: string,
  brandConstraint: string,
  customTypography?: string,
): AssembledCreative {
  const creativeBrief = assembleCreativeBrief(topic, direction, brand, customTypography);
  const negativePrompt = buildNegativePrompt(direction.archetype, direction.composition);

  const prompt = [brandConstraint, creativeBrief, stylePromptAddon]
    .filter(Boolean)
    .join("\n\n");

  return { prompt, negativePrompt, direction };
}
