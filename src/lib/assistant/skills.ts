/**
 * Ask BlinkSpot skills (Kezie, 2026-10-12: "put in skills for it to be able to make anything ...
 * motion graphics, nice websites"). A skill is a short playbook Ask loads only when a request
 * needs it, the way Claude Code skills work: the system prompt lists each skill in one line, and
 * the use_skill tool returns the full text. Built-in skills live here; accounts can add their own
 * (table assistant_skills, Settings > Ask skills), pasted or imported from a SKILL.md link.
 */

import { GUIDE, WHERE_DO_I } from "@/lib/guide";

export type Skill = { id: string; name: string; description: string; body: string; builtin?: boolean };

export const SKILL_LIMITS = { name: 60, description: 300, body: 20_000, perAccount: 25 } as const;

/** Where everything is and what it costs, from the Guide's own data (2026-10-20), so the two never disagree. */
function appGuideBody() {
  const parts = GUIDE.map((s) => [`${s.title}: ${s.line}`, ...s.items.map((i) => `- ${i.title}: ${i.what}${i.need ? ` You need ${i.need}.` : ""}${i.cost ? ` Cost: ${i.cost}.` : ""} (${i.href})`)].join("\n"));
  const faq = WHERE_DO_I.map((f) => `- ${f.q} ${f.a} (${f.href})`).join("\n");
  return `How BlinkSpot is laid out (the same as the Guide page at /studio/guide, which also restarts the tour).\n\n${parts.join("\n\n")}\n\nWhere do I...?\n${faq}\n\nWhen you answer "how do I" or "where is", name the place and the button exactly as above, and offer open_page when there is one.`;
}

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: "app-guide",
    name: "Where everything is in BlinkSpot",
    description: "Every place, maker and editor tool (magic outline, AI eraser, motion walkthroughs...), what each needs and costs, and where to find things. Load for any how-do-I, where-is or what-does-this-do question.",
    body: appGuideBody(),
  },
  {
    id: "sensitive-subjects",
    name: "Medical, intimate and lingerie brands",
    description: "Cosmetic surgery and implants, sexual and intimate health, lingerie and swimwear: what can be made, the best model, and what to suggest instead of nudity.",
    body: `Sensitive subjects (BlinkSpot's line, 2026-10-18).

The line: no nudity, nipples, genitals or sexual imagery, for anyone, and no AI-made before-and-after "results". Say it kindly and briefly, with the reasons that matter to the user: every image and video service refuses it, Instagram, Facebook and TikTok remove it (Meta also restricts before-and-after body pictures for cosmetic procedures), and invented surgery results would mislead patients; real before-and-afters come from real, consenting patients and are posted by the clinic itself. Never suggest a way around the filters.

What these brands post, and BlinkSpot makes well:
- Cosmetic surgery and implants: the implant as a studio product (on a plinth, in its sterile packaging), consultations with fully clothed patients, surgeon and team portraits, the clinic interior, a confident lifestyle shot (fitted top, swimwear on a beach, face visible), a clean step-by-step diagram, testimonial quote cards.
- Sexual and intimate health: product flat lays and packaging heroes, couples in everyday moments (clothed), doctor tip cards, myth-vs-fact typographic posts.
- Lingerie and swimwear: editorial model shots (no sheer or see-through fabric), product on a hanger, flat lays, fabric close-ups.

Models: images on Best (Nano Banana 2): GPT Image (Fast) refuses most body wording. Video on Standard (Seedance 2); Sora refuses most medical scenes. Keep anatomy words out of the prompt and describe the product, the people (clothed) and the setting instead.
Then propose_image (or propose_video) with one of these ideas written for the brand.`,
  },
  {
    id: "poster-design",
    name: "Poster and ad design",
    description: "Posters, flyers, offers and ads with words on them: layout, the text-first rule, lighting and materials.",
    body: `Poster and ad design (from BlinkSpot's poster playbook).

1. A poster is graphic design, not a photo with text dropped on it. Say so in the prompt: "Graphic design poster, NOT a lifestyle photograph with text overlaid. Clean, solid background. The product is a standalone studio object. Text lives in its own zones and never covers the product."
2. Three zones. Upper: the brand name and a short tagline. Centre: the product, 55-60% of the frame. Lower right: the website or handle, small.
3. Text first. Write the exact words before describing the picture, each in quotes, 3-5 words at most:
   render "BRAND" in bold sans-serif, about 8% of the frame height, upper left
   render "Short tagline" in medium weight, about 60% of the headline size
   render "brand.com" small and clean, lower right
   Use only the brand's real name, website and contacts. Never invent prices, phone numbers or URLs; if the user gave an offer, quote it exactly.
4. Name everything: the lighting ("three-point softbox", "golden hour backlight", "chiaroscuro"), the lens ("35mm f/1.8", "macro f/8"), the materials ("deep navy velvet", "warm Calacatta marble", "matte frosted acrylic").
5. Space: a 10% safe margin on every edge, about 20% empty space on purpose, one hero only.
6. Colour: 60% background, 30% secondary, 10% accent in the brand colour (the call to action or the price).
7. Avoid the AI look: no floating random objects, no extra hands, no fake text in the background, no glossy plastic skin, no rainbow gradients unless asked.
8. Style recipes: Studio (infinite backdrop, softbox, macro, no text). Lifestyle (a real local setting, 35mm film look, candid). Cinematic (chiaroscuro, anamorphic, muted teal and amber). Flat lay (90 degrees overhead, neat arrangement, soft window light).
9. For a design the user saw somewhere, send them to Inspo Remix (open_page "inspo") instead of describing it.
Write the final prompt in 80-150 words, then propose_image with style "poster".`,
  },
  {
    id: "motion-graphics",
    name: "Motion graphics and animated text",
    description: "Motion graphics (the Motion graphics page), animated logos, kinetic type, product spins, loops and transitions for Reels and ads.",
    body: `Motion graphics in BlinkSpot.

What renders where:
- AI video models move pictures well but spell badly. Never ask a video model for words on screen. Put words in with the Video Editor (Text, captions, a hook line), where they are exact and editable.
- Logo reveal: give the start frame (a clean background or a texture) and the end frame (the logo on that background); the model animates between them. Keep it to 4-6 seconds.
- Product motion: one clear move per shot. Good moves: slow 360 orbit, push in, pull back to reveal, top-down rotate, parallax slide. Say the speed ("slow", "gentle", "snappy") and what stays still ("the product stays centred and sharp").
- Loops: say "seamless loop, the last frame matches the first" and keep the camera move small.

Write each shot prompt as: subject + action + camera move + light + mood + timing. Example: "The amber bottle on wet black stone, slow 180-degree orbit left, a thin rim light sweeps across the glass, droplets catch the light, calm and premium, 5 seconds."

Where Motion lives: its own page, Create > Motion graphics (/studio/motion). make_motion opens that page with the brief filled in. From inside the Video Editor, the Motion button (and make_motion) opens the same Motion over the timeline, and the clip lands on the timeline. Never send someone to the editor just to make motion graphics.
Motion graphics: for animated words, numbers, bar charts, a before-and-after number, key points from a post, a product reveal, a logo sting, a see-through lower third over footage, an end card or an app walkthrough, this is the first choice. Claude plans it from the brand's kit (4 credits), every letter is drawn exactly in the brand's font and colours, the preview and edits are free, and it saves to the Library. Give make_motion a brief with the exact words, numbers and prices.

Kinetic type (words that move): use Motion graphics, or plan it in the Editor. Short lines (2-4 words), one idea per beat, each line 0.6-1.2 s, cut on the music's beat (the Editor's Cut to the beat does this). Big, bold, high contrast, centred or on a strong left edge, inside the 10% safe area. For 9:16 keep words in the middle 60% so app buttons don't cover them.

Sequences: 3-6 shots of about 5 s, each a different angle or scale (wide, mid, close), a match cut or a whip between them. Use propose_video style "storytelling" for anything longer than one shot, then the user puts the scenes together in the Editor and adds the type and music there.
Cost: video is priced per second; say the total before proposing and suggest Draft quality to try the motion first.`,
  },
  {
    id: "landing-pages",
    name: "Landing pages that convert",
    description: "Building or improving a website or landing page: sections, order, headlines and the call to action.",
    body: `Landing pages (BlinkSpot's Website builder writes the page from the brand; open_page "website").

Order that works for small brands:
1. Hero: one promise in 6-10 words (the result the customer gets, not the company's name), one line under it saying who it's for and where, one button. The button says what happens: "Order on WhatsApp", "Book a table", not "Submit".
2. Proof right away: a number, a review, logos of places that stock it, or "500 orders this month". Real only.
3. What you get: 3 short blocks (picture + 4-word title + one sentence). Products with prices if the brand sells products.
4. How it works: 3 steps.
5. The offer or the menu.
6. Questions people ask before buying (delivery areas, payment, sizes, opening hours).
7. The same button again, plus contacts (WhatsApp, phone, map).

Copy rules: plain words, second person ("you"), short sentences, numbers over adjectives, local detail (the town, the neighbourhood, the currency). One call to action across the page. Never invent reviews, awards or prices.
Design: lots of space, two fonts at most, the brand colour only on buttons and highlights, real photos of the product beat stock photos. Mobile first: the button visible without scrolling.
If the user likes a site, use the "Like a site I love" start in the Website builder (layout and feel only, never their words or logos).`,
  },
  {
    id: "reels-hooks",
    name: "Reels, TikToks and hooks",
    description: "Short-form video ideas, hooks in the first 2 seconds, scripts for 15/30/60 s, captions.",
    body: `Short-form video (Reels, TikTok, Shorts).

The first 2 seconds decide everything. Hook types that work:
- The result first: show the finished thing, then how ("This took 4 minutes").
- A number: "3 things nobody tells you about ...".
- A mistake: "Stop doing this with your ...".
- A question the viewer has: "Is it worth paying more for ...?"
- A pattern break: an unexpected sound, a fast zoom, a hand reaching into frame.

Structures:
- 15 s: hook (2 s), 2-3 quick beats (3-4 s each), payoff and call to action (2 s).
- 30 s: hook, problem, 3 beats of the answer, proof, call to action.
- 60 s: a mini story: who, the problem, what changed, the result, the call to action.
One idea per video. Cut every 1-2 seconds for energy, longer for calm or premium brands. On-screen text for every key line (most people watch muted); add it in the Video Editor, outlined, in the middle of the frame.

In BlinkSpot: for a talking video use Lip-sync (a photo plus a voice). For product or story videos, propose_video style "storytelling" with one scene per beat. Long video already shot? The Editor's "Find the best moments" cuts shorts from it. Music: put a song on the Editor's audio track and Cut to the beat.
Captions: first line repeats the hook, then one short line of value, then the call to action, 3-5 hashtags that match the place and niche.`,
  },
  {
    id: "product-shots",
    name: "Product photography direction",
    description: "Studio, lifestyle and flat-lay product images: angles, props, light and a consistent set.",
    body: `Product photography direction.

Start from the product: what it's made of, its size, its colour, what makes it special. Say it exactly ("a 250 ml amber glass dropper bottle with a gold cap").
Angles: hero (slightly above, 30 degrees, the front label facing), straight-on for packaging, top-down for food and flat lays, macro for texture, in-hand for scale.
Light: soft and big for skincare and food (window light or a large softbox), hard and directional for drama (a single spotlight, deep shadows), backlight for glass and liquids, golden hour for lifestyle.
Surfaces and props: one surface material (linen, terrazzo, raw wood, wet stone), 1-3 props that tell the story (the ingredient, the place, the use), never clutter. Props in the brand palette.
Lifestyle: a real local setting the customer knows, people of the brand's audience, natural poses, the product clearly the hero.
A set that looks like one brand: same light, same surface family, same angle grammar, same colour grade across every image. Say "matching the set: same light and grade" in each prompt.
In BlinkSpot: Product shot in Video Studio animates a still; the Image studio makes the still. For an existing photo, Edit with AI (Library → a post → Edit with AI) scans it once (4 credits, kept on the post, free to reopen), then changes one thing and keeps the rest: the words, a colour (brand colours one tap away), a material, swapping a thing for a Library picture or a product photo, removing it, or a described change (18 credits). The result is a new post, already scanned; the original stays. Offer the cheap preview first.`,
  },
  {
    id: "ugc-ads",
    name: "UGC creator ads",
    description: "Ads that look like a real customer talking: scripts, the talking-photo flow and authenticity cues.",
    body: `UGC (user-generated style) ads.

Script (20-35 s):
1. Hook in the creator's voice: "Okay, I didn't expect this to work ..."
2. The problem in their words, specific and a little personal.
3. The moment they tried the product (show it, use it).
4. One or two concrete results (time saved, how it feels, what people said).
5. Soft call to action: "the link's in the bio", "they deliver in Westlands too".
Write it like speech: contractions, short sentences, one small imperfection. 70-90 words for 30 s.

In BlinkSpot: Lip-sync makes a photo talk with a voice (record your own or use a voice). Use a natural phone-camera photo of the person (eye level, daylight, a real room), not a studio portrait. B-roll of the product as separate short scenes, then cut them together in the Editor with captions.
Authenticity cues: a real setting, handheld framing, natural light, the person's own words and accent, the product used not posed. Avoid perfect skin, over-styled sets, and claims the brand can't back up (no medical or income promises).
Always say clearly that it's an ad if the brand will boost it, and only use a real person's face with their permission.`,
  },
  {
    id: "campaign-plan",
    name: "Campaign and content calendar",
    description: "Planning two to four weeks of posts: themes, mix, frequency and putting them on the calendar.",
    body: `Campaign and content calendars.

Mix for a small brand (per week): 1-2 promotional posts (an offer, a product), 1-2 proof posts (reviews, results, a customer), 1-2 value posts (a tip, a how-to, a myth busted), 1 behind-the-scenes (the team, the making, the place). Video at least twice a week if they can.
A campaign has one goal (launch, sale, bookings), one message, and a start, middle and end: tease (2-3 days before), launch day, proof and reminders, a last-chance post.
Frequency: 3-5 posts a week beats 2 a day for a week then silence. Same days and times build a habit.
Times (local): weekdays 12:00-13:00 and 18:00-21:00, weekends 10:00-12:00, unless the brand's own results say otherwise.
Each post in the plan: the day, the format (image, carousel, reel), the idea in one line, the hook, and the call to action.
In BlinkSpot: draft the posts first (images and videos in the Library), then get_schedule and propose_schedule to put them on the calendar; the user presses Apply. Posts with no platforms yet go on the calendar but don't publish until platforms are picked.`,
  },
];

/** "Name — description" lines for the system prompt (cheap: the full text loads on demand). */
export function skillIndex(skills: Array<Pick<Skill, "id" | "name" | "description">>) {
  return skills.map((s) => `- ${s.id}: ${s.name}. ${s.description}`).join("\n");
}

/** Split a SKILL.md into name, description and body (YAML-ish front matter, as Claude skills use). */
export function parseSkillMarkdown(md: string, fallbackName = "Imported skill"): { name: string; description: string; body: string } {
  const text = md.replace(/\r\n/g, "\n").trim();
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  const meta: Record<string, string> = {};
  let body = text;
  if (m) {
    body = m[2].trim();
    for (const line of m[1].split("\n")) {
      const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
      if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  const name = (meta.name || heading || fallbackName).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  const firstPara = body.split(/\n\s*\n/).map((p) => p.replace(/^#+\s.*$/gm, "").trim()).find((p) => p.length > 20) ?? "";
  const description = (meta.description || firstPara).replace(/\s+/g, " ").trim();
  return { name: name.slice(0, SKILL_LIMITS.name), description: description.slice(0, SKILL_LIMITS.description), body: body.slice(0, SKILL_LIMITS.body) };
}

/** A GitHub page link to the file's raw text (anything else is used as given). */
export function rawSkillUrl(url: string): string {
  const gh = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url.trim());
  return gh ? `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}` : url.trim();
}

export function skillId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "skill";
}
