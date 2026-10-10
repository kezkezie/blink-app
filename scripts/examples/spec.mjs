/**
 * BlinkSpot examples gallery (2026-10-10): made-up brands only, never a customer's work.
 * Each entry records the exact prompt and settings so the gallery can show "how it was made".
 * Image prompts follow the poster-designer rules (three-zone posters, quoted text first, named
 * light/lens/materials, safe zone, negative space).
 */

const constraint = (brand) => `CRITICAL BRAND CONSTRAINT: This content belongs to the brand "${brand}". Any visible text or signage MUST reflect "${brand}" only. No other brand names, no website URLs, no placeholder logos.`;
const posterRules = "10% inset safe zone on all edges. 20% intentional negative space. Single dominant focal point. Professional print quality.";

export const IMAGES = [
  {
    id: "mavuno-poster", brand: "Mavuno", title: "Juice launch poster", style: "Poster", aspect: "4:5",
    short: "Launch poster for a cold-pressed juice: one bottle, big headline, clean colour.",
    prompt: `${constraint("Mavuno")} render "MAVUNO" in bold deep-green serif display font, upper-left, 8% frame height. render "Pressed This Morning" in medium weight, 60% headline size, below it. render "Mango · Passion" in small clean sans-serif, lower-right corner. GRAPHIC DESIGN POSTER, NOT a lifestyle photograph with text overlaid. BACKGROUND: clean solid warm cream (#F7F3EA). PRODUCT ZONE: a frosted glass bottle of mango-passion cold-pressed juice with a kraft paper label, cold condensation droplets, half a mango and a split passion fruit at its base, standalone studio object, soft drop shadow, gentle rim light, center-right, 55% of frame. Three-point softbox lighting, 85mm, f/8. Text does NOT overlap the product. ${posterRules}`,
  },
  {
    id: "kasi-poster", brand: "Kasi Runners", title: "Sneaker drop poster", style: "Poster", aspect: "4:5",
    short: "A bold drop poster: the shoe floating, the date as the headline.",
    prompt: `${constraint("Kasi Runners")} render "KASI" in heavy condensed black sans-serif, upper-left, 10% frame height. render "Drop 01 · Friday" in bold black, smaller than the headline, directly below it. render "Limited pairs" in small clean font, lower-right corner. GRAPHIC DESIGN POSTER, NOT a photo with text on top. BACKGROUND: solid signal orange (#FF5A1F). PRODUCT ZONE: one chunky high-top sneaker in cream canvas with a black suede toe cap, black laces and a thick white rubber cupsole; the side panels are completely plain with no logo, no swoosh, no stripes, no brand marks of any kind. Floating at a dynamic 20-degree angle, crisp contact shadow below, center-right, 55% of frame. Hard key light from upper left, 100mm product lens, f/11, ultra-sharp textures. ${posterRules}`,
  },
  {
    id: "aloe-ash-studio", brand: "Aloe & Ash", title: "Skincare studio shot", style: "Studio", aspect: "4:5",
    short: "Clean product photo for a serum, no text, ready for any caption.",
    prompt: `${constraint("Aloe & Ash")} High-end commercial product photography. SUBJECT: a matte frosted amber glass dropper bottle of face serum with a small minimal label reading "ALOE & ASH", resting on a slab of raw travertine stone, a fresh aloe leaf cut open beside it showing clear gel. COMPOSITION: single focal point, left-center, 60% of frame, generous negative space on the right. Clean infinite backdrop in soft sand beige. LIGHTING: three-point softbox, gentle shadows, clean catchlights on the glass. CAMERA: macro lens, f/8, deep depth of field, materiality emphasis. No other text.`,
  },
  {
    id: "tano-coffee-lifestyle", brand: "Tano Coffee", title: "Coffee shop lifestyle", style: "Lifestyle", aspect: "4:5",
    short: "A real-feeling cafe moment for an Instagram feed.",
    prompt: `${constraint("Tano Coffee")} Authentic lifestyle photography. SUBJECT: a fresh flat white with rosetta latte art in a speckled handmade ceramic cup on a worn oak cafe counter, a barista's hand just letting go of the saucer, a small paper cup sleeve printed "TANO" softly out of focus behind. Morning golden-hour light through a window, steam visible. CAMERA: Fujifilm colour science, 35mm, f/2, slight film grain, candid and unposed. COMPOSITION: cup sharp in the lower third, breathing room above.`,
  },
  {
    id: "mkate-poster", brand: "Mkate Bakery", title: "Bakery weekend offer", style: "Poster", aspect: "4:5",
    short: "Weekend offer poster with a friendly headline and one hero pastry.",
    prompt: `${constraint("Mkate Bakery")} render "MKATE" in warm chunky rounded serif, upper-left, 8% frame height, colour deep brown. render "Fresh at 6AM" in medium weight, 60% headline size, below it. render "Saturday 2 for 1" in small clean font, lower-right corner. GRAPHIC DESIGN POSTER, NOT a lifestyle photograph. BACKGROUND: solid butter yellow (#F6D67A). PRODUCT ZONE: a golden flaky croissant and two sugar-dusted mandazi on a round kraft paper, standalone studio object, soft drop shadow, center-right, 55% of frame. Softbox key light, 85mm, f/8. Text does NOT overlap the food. ${posterRules}`,
  },
  {
    id: "kilele-poster", brand: "Kilele Homes", title: "Real estate listing", style: "Poster", aspect: "4:5",
    short: "Property listing post with the price line kept short and readable.",
    prompt: `${constraint("Kilele Homes")} render "KILELE HOMES" in elegant thin uppercase sans-serif with wide letter spacing, upper-left, 6% frame height, white. render "2-Bed · Ready December" in medium weight, below it, white. render "Book a viewing" in small clean font inside a thin white outlined pill, lower-right corner. Architectural photography of a modern apartment balcony at blue hour: warm interior lights, a lounge chair, potted palm, city lights bokeh beyond. The upper-left text sits over a calm dark sky area with a subtle dark scrim for legibility, never over the building details. 24mm tilt-shift lens, f/8, balanced exposure. ${posterRules}`,
  },
  {
    id: "pulse-poster", brand: "Pulse Studio", title: "Gym class promo", style: "Poster", aspect: "4:5",
    short: "Fitness class promo with energy: one athlete, one message.",
    prompt: `${constraint("Pulse Studio")} render "PULSE" in heavy italic black sans-serif, upper-left, 10% frame height, electric lime (#C6F432). render "Morning HIIT · 6:30" in bold white, 50% headline size, below it. render "First class free" in small clean white font, lower-right corner. Dramatic fitness photography: one athlete mid-jump-squat in a dark concrete studio, rim-lit by a single lime-green gel light, sweat catching the light, motion frozen at 1/2000s. 50mm, f/2.8. Text sits on the dark empty wall area, never on the athlete. ${posterRules}`,
  },
  {
    id: "night-market-flyer", brand: "Nairobi Night Market", title: "Event flyer", style: "Poster", aspect: "4:5",
    short: "Event flyer: the name, the vibe and the time, nothing else.",
    prompt: `${constraint("Nairobi Night Market")} render "NIGHT MARKET" in bold retro display sans-serif with a soft glow, upper-center, 10% frame height, warm white. render "Food · Music · Makers" in medium weight, 50% headline size, below it. render "Sat · 6PM till late" in small clean font, lower-right corner. Illustrated poster style: string lights zig-zagging over a few food stalls in silhouette, deep indigo night sky, warm amber and coral highlights, grain texture, flat vector shapes with subtle depth. Text sits in the open sky area above the lights. ${posterRules}`,
  },
  {
    id: "oud-noir-cinematic", brand: "Oud Noir", title: "Perfume hero shot", style: "Cinematic", aspect: "4:5",
    short: "Moody luxury shot for a perfume launch.",
    prompt: `${constraint("Oud Noir")} Cinematic luxury product shot. SUBJECT: a heavy faceted black glass perfume bottle with a brushed gold cap and a small engraved "OUD NOIR" mark, standing on dark wet slate, thin smoke drifting behind it. LIGHTING: chiaroscuro, one narrow gold-tinted strip light from the left, deep shadows, specular highlights on the facets. CAMERA: 100mm macro, f/5.6. Muted teal and amber palette. Single focal point, center, 50% of frame, lots of black negative space.`,
  },
  {
    id: "pwani-flatlay", brand: "Pwani Plate", title: "Restaurant flatlay", style: "Flatlay", aspect: "1:1",
    short: "Overhead menu shot that makes the food the hero.",
    prompt: `${constraint("Pwani Plate")} Overhead flatlay composition. CAMERA: directly above, 90 degrees, deep depth of field, everything sharp. SUBJECT: Swahili coastal meal on a turquoise-painted wooden table: a bowl of spiced pilau, coconut fish curry in a clay pot, two layered chapati, kachumbari salad, a lime wedge and a glass of passion juice, arranged with precise knolling and a symmetrical grid. LIGHTING: soft diffused window light, no harsh shadows. 20% negative space. No text.`,
  },
  {
    id: "kitenge-lookbook", brand: "Kitenge Co.", title: "Fashion lookbook", style: "Lifestyle", aspect: "4:5",
    short: "Lookbook frame for a clothing drop, on a real street.",
    prompt: `${constraint("Kitenge Co.")} Fashion editorial photography. SUBJECT: a confident young East African woman in a tailored orange-and-teal kitenge wrap dress with puffed sleeves, walking toward camera on a sunlit old-town street with whitewashed walls and a carved wooden door. LIGHTING: late golden-hour sun from the side, warm skin tones, soft fill. CAMERA: 85mm, f/2, shallow depth of field, Fujifilm colour science. COMPOSITION: full-length, subject on the left third, breathing room on the right. No text.`,
  },
  {
    id: "sauti-3d", brand: "Sauti", title: "Earbuds 3D render", style: "3D", aspect: "1:1",
    short: "A clean 3D-style render for a tech product.",
    prompt: `${constraint("Sauti")} Abstract 3D product render, Octane render style. SUBJECT: a pair of glossy white wireless earbuds hovering just above an open pebble-shaped charging case with a tiny embossed "SAUTI" mark, one earbud slightly rotated. A single soft coral sphere floats behind as an accent. HDRI studio lighting, soft reflections, subtle ground shadow. Background: smooth pale lilac. Restraint: one hero object, generous negative space. No other text.`,
  },
];

/** The person for the lip-sync example (and the Inspo Remix source). */
export const EXTRA_IMAGES = [
  {
    id: "wanjiru-portrait", brand: "Mavuno", title: "Lip-sync face", aspect: "9:16", hidden: true,
    prompt: `Natural portrait photography for a talking-head video. SUBJECT: a friendly East African woman in her late twenties with short natural hair and small gold earrings, wearing a mustard linen shirt, looking straight into the camera with a relaxed closed-mouth smile, head and shoulders, centered. BACKGROUND: a softly blurred bright kitchen with a fruit bowl. LIGHTING: soft window light from the left, gentle fill. CAMERA: 50mm, f/2.2, eye level. No text.`,
  },
  {
    id: "inspo-source", brand: "", title: "Inspo (found online)", aspect: "4:5", hidden: true,
    prompt: `GRAPHIC DESIGN POSTER. render "SUMMER" in huge bold white sans-serif across the top. render "Cold & Fresh" in medium weight below. Background: solid sky blue. A single tall glass of iced lemonade with a paper straw and lemon slices, centered, soft shadow, splash of water droplets frozen around it. Clean, minimal, playful.`,
  },
];

export const REMIX = {
  id: "mavuno-remix", brand: "Mavuno", title: "Inspo Remix", aspect: "4:5", style: "Remix", source: "inspo-source",
  short: "A poster found online, rebuilt in the brand's colours, product and words.",
  prompt: `${constraint("Mavuno")} Recreate the LAYOUT of the reference poster (big headline across the top, one centered drink, splash, clean solid background) for the brand Mavuno. Change everything else: render "MAVUNO" in bold deep-green serif display font across the top. render "Pressed This Morning" in medium weight below it. Background: solid warm mango orange (#E8913A). The drink is a frosted glass bottle of cold-pressed mango-passion juice with a kraft paper label, splash of juice droplets frozen around it. Do not copy the reference's words or colours. ${posterRules}`,
};

/**
 * Videos follow the app's own flow: a still first frame (Nano Banana 2) the user approves, then the
 * motion. Kling 3.0 on Kie returned frozen clips for all 7 text-to-video tries on 2026-10-10, so
 * these animate with Pruna p-video, which moved correctly in every test.
 */
const still = (id, aspect, prompt) => ({ id, aspect, prompt: `Photographic first frame of a video, sharp, ready to animate. ${prompt}` });
export const VIDEOS = [
  {
    id: "mavuno-orbit", mode: "showcase", tab: "Camera move", brand: "Mavuno", title: "Product shot: orbit", aspect: "16:9", duration: 5, engine: "seedance",
    short: "One sentence, and the camera moves around the product, with sound.",
    prompt: "Slow, smooth 180-degree orbit around a frosted glass bottle of mango juice standing on wet black stone, condensation droplets running down, sliced mango beside it. Soft rim light, steady gimbal motion.",
  },
  {
    id: "kasi-reveal", mode: "showcase", tab: "Reveal", brand: "Kasi Runners", title: "Product shot: reveal", aspect: "16:9", duration: 5, engine: "pvideo",
    short: "The box opens and the product rises into the light.",
    still: still("kasi-reveal-frame", "16:9", "A matte black shoebox with its lid lifted slightly on a dark studio floor inside a single hard spotlight circle, a chunky cream canvas high-top sneaker with a black suede toe cap and plain logo-free sides just visible inside, dust particles in the beam. Dramatic, 35mm."),
    prompt: "The lid slides off the box and the sneaker rises out of it, slowly rotating in the spotlight, dust drifting through the beam. Slick product reveal, camera slowly pushing in.",
  },
  {
    id: "sauti-creator", mode: "ugc", brand: "Sauti", title: "Creator talking", aspect: "9:16", duration: 5, engine: "pvideo", voice: "shimmer",
    script: "Okay, these Sauti buds last me the whole week. I'm obsessed.",
    short: "A selfie-style review: a photo of the creator plus a voice line.",
    still: still("sauti-creator-frame", "9:16", "Selfie-style phone photo: a young East African woman with long braids in a bright apartment, holding a small unbranded white pebble-shaped earbuds case up near her face, relaxed closed-mouth smile, looking into the lens. Natural window light, slight wide-angle phone look."),
    prompt: "She talks to the camera like a creator review, animated and friendly, small head movements, lifts the earbuds case slightly as she speaks. Handheld phone feel.",
  },
  {
    id: "kitenge-tryon", mode: "clothing", brand: "Kitenge Co.", title: "Try-on", aspect: "4:5", duration: 5, engine: "pvideo", image: "kitenge-lookbook",
    short: "The outfit on a person, moving so you see the cut and the fabric.",
    prompt: "She walks slowly toward the camera, then turns to show the back of the dress, the kitenge fabric and puffed sleeves swaying. Golden-hour light, steady camera, fashion film feel.",
  },
  {
    id: "tano-pour", mode: "showcase", tab: "From your photo", brand: "Tano Coffee", title: "Photo to video", aspect: "4:5", duration: 5, engine: "pvideo", image: "tano-coffee-lifestyle",
    short: "Your own photo brought to life: steam, light and a little movement.",
    prompt: "Steam curls up from the latte, the barista's hand slides the saucer forward a few centimetres, warm morning light flickers softly through the window. Gentle, realistic motion, camera almost still.",
  },
  {
    id: "oud-noir-push", mode: "showcase", tab: "From your photo", brand: "Oud Noir", title: "Photo to video: luxury", aspect: "4:5", duration: 5, engine: "pvideo", image: "oud-noir-cinematic",
    short: "A slow push-in on a still product photo.",
    prompt: "Very slow push-in toward the perfume bottle while thin smoke drifts across the frame, the gold strip light glints along the glass facets. Moody, cinematic, no fast motion.",
  },
];

export const STORY = {
  id: "mkate-story", mode: "storytelling", brand: "Mkate Bakery", title: "Scene by scene: bakery story", aspect: "16:9",
  short: "Three scenes that tell a story: the oven at dawn, the hands, the customer.",
  brief: "A 15 second story for a neighbourhood bakery: baking before dawn, hands kneading, a customer taking home warm pastries.",
  scenes: [
    { still: still("mkate-story-1-frame", "16:9", "Before dawn in a small Nairobi bakery: a baker in a flour-dusted apron pulls a tray of golden mandazi from a glowing open oven, steam rising, warm orange light, 35mm cinematic."), prompt: "The baker slides the tray out of the oven toward the camera, steam rising and curling in the warm light. Gentle handheld, cinematic." },
    { still: still("mkate-story-2-frame", "16:9", "Close-up of flour-dusted hands kneading soft dough on a worn wooden counter, morning light from a small window, flour particles floating in the air."), prompt: "The hands press, fold and push the dough in a steady rhythm, flour puffing up into the light. Slow motion." },
    { still: still("mkate-story-3-frame", "16:9", "At the counter of a small neighbourhood bakery in Nairobi, a smiling Kenyan baker in a plain cream apron with no text hands a warm brown paper bag of mandazi to a customer; through the glass door a sunny Nairobi street with matatus and acacia trees, warm and inviting, 35mm. No signs or words anywhere."), prompt: "The customer takes the paper bag, both smile and nod, the shop door light flickers with people passing outside. Warm, natural motion." },
  ],
};

export const LIPSYNC = {
  id: "mavuno-lipsync", mode: "lipsync", brand: "Mavuno", title: "Lip-sync", aspect: "9:16", image: "wanjiru-portrait", voice: "nova",
  short: "A photo of a face plus a voice line becomes a talking video.",
  script: "Hi, I'm Wanjiru from Mavuno. Our juice is pressed this morning, from farms you can name.",
  prompt: "She speaks warmly and naturally to the camera, small natural head movements, friendly expression, blinks normally.",
};

export const VOICES = [
  { id: "voice-mavuno", brand: "Mavuno", title: "Voiceover: juice ad", voice: "nova", script: "Mavuno. Cold-pressed this morning, from farms you can name. Order before ten, sip it by noon." },
  { id: "voice-kilele", brand: "Kilele Homes", title: "Voiceover: property", voice: "onyx", script: "Kilele Homes. Two-bedroom apartments in Kileleshwa, ready this December. Book a viewing today." },
  { id: "voice-night-market", brand: "Nairobi Night Market", title: "Voiceover: event", voice: "shimmer", script: "This Saturday, the Nairobi Night Market. Food, music and makers, from six till late." },
];

export const LOGOS = [
  { id: "logo-mavuno", brand: "Mavuno", title: "Logo: juice brand", font: "DM Serif Display", colors: ["#1F4D3A", "#E8913A", "#B8432F"], prompt: "A logo for \"Mavuno\" (cold-pressed juice). A simple droplet shape with a single leaf rising from its top, wordmark \"Mavuno\" below. Square composition, works small, transparent background." },
  { id: "logo-kasi", brand: "Kasi Runners", title: "Logo: sneaker brand", font: "Archivo Black", colors: ["#111111", "#FF5A1F"], prompt: "A logo for \"Kasi\" (running sneakers). A bold forward-slanted K made of two speed strokes, wordmark \"KASI\" beside it in heavy italic. Works small, transparent background." },
  { id: "logo-tano", brand: "Tano Coffee", title: "Logo: coffee shop", font: "Fraunces", colors: ["#3B2416", "#C8945A", "#F4ECE1"], prompt: "A logo for \"Tano Coffee\". A round badge: a coffee bean whose centre line forms the number 5, ring text \"TANO COFFEE\" around it. Works small, transparent background." },
];
