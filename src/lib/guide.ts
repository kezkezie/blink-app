/**
 * Orientation (Kezie, 2026-10-20: "orientation stuff that would tell people where to go and what to
 * do"). One source for the first-visit tour, the Getting started list and the Guide page, with
 * prices read from the constants that charge them, so the Guide can't drift from the bill.
 */
import { IMAGE_ENGINE_REGISTRY, STORYBOARD_FRAME_CREDITS } from "@/lib/image-engine-pricing";
import { SCAN_CREDITS, EDIT_CREDITS } from "@/lib/ai-edit";
import { PLAN_CREDITS as CAROUSEL_PLAN_CREDITS } from "@/lib/carousel";
import { MOTION_CREDITS } from "@/lib/motion/spec";
import { SITE_CHANGE_CREDITS, SITE_PAGE_CREDITS } from "@/lib/sites/code";
import { AI_ERASE_CREDITS, MAP_CREDITS } from "@/lib/editor/regions";
import { estimateVideoCredits } from "@/lib/video-model-registry";
import { SIGNUP_CREDITS } from "@/lib/plans";

export const TOUR_KEY = "blink.tour.v1";

export type TourStep = { target?: string; title: string; body: string };

/** The first-visit tour: the five places, Ask, and credits. `target` is a data-tour value. */
export const TOUR_STEPS: TourStep[] = [
  { title: "Welcome to BlinkSpot", body: "A quick look around: where things are and what they do. It takes under a minute, and you can open it again from the Guide." },
  { target: "create", title: "Create", body: "Start anything here: images, videos, carousels, motion graphics, or the image and video editors. Type an idea in the box, or pick a card." },
  { target: "library", title: "Library", body: "Everything you make lands here. Open a post to edit it, download it, make it a video, or schedule it." },
  { target: "plan", title: "Plan", body: "Your calendar. Schedule posts, and BlinkSpot posts them for you on the brand's connected accounts." },
  { target: "brand", title: "Brand", body: "Your logo, colours, fonts, voice and products. Everything you make follows them. Connect the brand's Instagram, TikTok and the rest here." },
  { target: "site", title: "Website", body: "A landing page written and designed from your brand. Change it section by section, or in code." },
  { target: "ask", title: "Ask BlinkSpot", body: "Ask anything, or have it do the work: fill in your brand from a pasted text, plan a week of posts, change a post, read a PDF. ⌘K opens it anywhere." },
  { target: "credits", title: "Credits", body: "The AI uses credits; every manual tool is free. The price is on each button before you press it, and failed AI work is refunded." },
  { title: "You're ready", body: "The Guide explains every place and button and what it costs. Start with Inspo Remix: drop a post you love and get it in your brand." },
];

export type GuideItem = { title: string; what: string; need?: string; cost?: string; href: string; keywords?: string };
export type GuideSection = { id: string; title: string; line: string; items: GuideItem[] };

const best = IMAGE_ENGINE_REGISTRY.nb2.creditCost;
const fast = IMAGE_ENGINE_REGISTRY["gpt-image-2-text-to-image"].creditCost;
const scene = estimateVideoCredits("auto", 5, { videoMode: "storytelling", hasStartFrame: true }) ?? 0;

export const GUIDE: GuideSection[] = [
  {
    id: "create", title: "Create", line: "Where everything starts. The box at the top takes an idea; the cards open each maker.",
    items: [
      { title: "Inspo Remix", what: "Drop a post you love (from Pinterest, Instagram, anywhere) and get the same idea in your brand: your product, colours and logo.", need: "an inspiration picture", cost: `${best} cr an image`, href: "/studio/image?mode=remix", keywords: "copy remake pinterest" },
      { title: "Image", what: "Say what you want; BlinkSpot suggests three ideas, then makes the one you pick. Best quality or Fast.", need: "an idea", cost: `${fast} to ${best} cr an image`, href: "/studio/image?mode=generate", keywords: "generate picture poster" },
      { title: "Carousel", what: "Slides that tell one story, or one wide picture split across slides.", need: "a topic", cost: `${CAROUSEL_PLAN_CREDITS} cr to plan, then each slide's image`, href: "/studio/image?mode=carousel", keywords: "slides swipe" },
      { title: "Edit with AI", what: "Scan a picture, then change parts of it with words: swap the product, change the background, fix the text.", need: "a picture in your Library", cost: `${SCAN_CREDITS} cr to scan, ${EDIT_CREDITS} cr an edit`, href: "/studio/image?mode=edit", keywords: "change fix replace" },
      { title: "Image editor", what: "Layers, text, shapes, pen and brush, plus AI: remove a background, the AI eraser, the magic outline, split a poster into layers.", need: "nothing", cost: "Manual tools free", href: "/studio/image?mode=design", keywords: "canvas design photoshop layers" },
      { title: "Video Studio", what: "Ads, product shots, creators, try-ons and lip-sync, scene by scene, with a start frame you can see before it moves.", need: "an idea or a photo", cost: `About ${scene} cr for a 5 second scene, plus ${STORYBOARD_FRAME_CREDITS} cr a frame`, href: "/studio/video", keywords: "film reel tiktok ad" },
      { title: "Video editor", what: "Cut clips, captions, music, voiceover, motion graphics and AI edits on a timeline.", need: "clips (or nothing)", cost: "Editing free", href: "/studio/video?tab=editor", keywords: "timeline cut captions" },
      { title: "Motion graphics", what: "Explainers, numbers that move (bar charts, before and after), a post turned into a video, launch teasers, product reveals, end cards and app walkthroughs, in your brand's font and colours. Paste a post or a table and it uses exactly those words and numbers.", need: "an idea, a post, numbers or app screenshots", cost: `${MOTION_CREDITS} cr to plan; making it is free`, href: "/studio/motion", keywords: "animation titles tutorial walkthrough" },
      { title: "Brand builder", what: "New business with no brand yet? Describe it and get a name, colours, fonts, a voice and logos.", need: "a sentence about the business", cost: "Free", href: "/studio/brand-builder", keywords: "logo name new business" },
    ],
  },
  {
    id: "editor", title: "Image editor tools", line: "Pick a tool on the left; hover any tool to see what it does.",
    items: [
      { title: "Magic outline (M)", what: "Click the edge of something in a photo and move along it: the line snaps to the edges. Then cut it out to a new layer, erase it, keep only it, or remove it with AI.", cost: "Free", href: "/studio/image?mode=design", keywords: "lasso select cut out magnetic" },
      { title: "AI eraser (A)", what: "Brush over what should go, or map the photo and click things. AI removes them and fills in what was behind.", cost: `${AI_ERASE_CREDITS} cr an erase, ${MAP_CREDITS} cr to map a photo`, href: "/studio/image?mode=design", keywords: "remove object clean up erase" },
      { title: "Remove background", what: "The photo on its own, with a see-through background.", cost: "1 cr", href: "/studio/image?mode=design", keywords: "cutout transparent" },
      { title: "Split into layers", what: "A flat poster becomes real text in the closest font, a vector logo and the photo without its words.", cost: "About 20 cr", href: "/studio/image?mode=design", keywords: "editable text poster" },
      { title: "Pen, brush, eraser, shapes, text", what: "The manual tools. Undo with ⌘Z; your work is kept on this device if you leave.", cost: "Free", href: "/studio/image?mode=design", keywords: "draw" },
    ],
  },
  {
    id: "library", title: "Library", line: "Everything you've made, newest first, per brand.",
    items: [
      { title: "Open a post", what: "See it full screen, download it, change it with Edit with AI or the Editor, animate it into a video, upscale it or schedule it.", cost: "Free", href: "/studio/library", keywords: "download share" },
      { title: "Upscale", what: "A sharper, bigger copy of an image or video.", cost: "Priced on its size, shown first", href: "/studio/library", keywords: "4k bigger sharper" },
    ],
  },
  {
    id: "plan", title: "Plan", line: "The calendar, and posting for you.",
    items: [
      { title: "Schedule a post", what: "Pick a day and time; BlinkSpot posts it on the accounts connected to that brand.", need: "a connected account", cost: "Free", href: "/studio/plan", keywords: "calendar auto post publish" },
      { title: "Connect accounts", what: "Each brand has its own Instagram, TikTok, Facebook, LinkedIn, X and YouTube. Connect them on the Brand page.", cost: "Free", href: "/studio/brand#socials", keywords: "instagram tiktok facebook connect social" },
    ],
  },
  {
    id: "brand", title: "Brand", line: "What everything you make follows.",
    items: [
      { title: "Brand kit", what: "Logo, colours, fonts, voice, products and contacts. A website or Instagram link fills most of it in.", cost: "Free", href: "/studio/brand", keywords: "logo colours fonts voice products" },
      { title: "Share a brand", what: "Invite a teammate or client to view or edit one brand, for a while or for good: the brand menu at the top right → Share.", cost: "Free", href: "/studio/brand", keywords: "team invite client" },
    ],
  },
  {
    id: "site", title: "Website", line: "Landing pages from your brand.",
    items: [
      { title: "Make a page", what: "Written and designed from your brand, with your pictures. Live at blinkspot.io/s/your-name.", cost: `${SITE_PAGE_CREDITS} cr a page`, href: "/studio/sites", keywords: "landing page site" },
      { title: "Change it", what: "Sections mode for words, pictures and links; Code mode for anything; or describe a change.", cost: `${SITE_CHANGE_CREDITS} cr a described change; editing yourself is free`, href: "/studio/sites", keywords: "edit html" },
    ],
  },
  {
    id: "ask", title: "Ask BlinkSpot", line: "The assistant in every page (⌘K).",
    items: [
      { title: "Ask or delegate", what: "Answers questions about BlinkSpot and marketing, and does the work: fills in a brand from pasted text, plans posts, makes images and websites, edits posts and canvases.", cost: "Included messages every day; more in credits", href: "/studio?ask=1", keywords: "assistant chat help" },
      { title: "Give it a file", what: "Attach a PDF, Word document, text, CSV or JSON with the paperclip and ask about it.", cost: "Same as a message", href: "/studio?ask=1", keywords: "pdf upload document read" },
    ],
  },
];

/** "Where do I...?" quick answers. */
export const WHERE_DO_I: Array<{ q: string; a: string; href: string }> = [
  { q: "Where do I start if I have no idea what to post?", a: "Inspo Remix with a post you like, or ask Ask BlinkSpot to plan your week.", href: "/studio/image?mode=remix" },
  { q: "Where do I connect Instagram or TikTok?", a: "Brand → Where this brand posts → Connect accounts. Each brand has its own.", href: "/studio/brand#socials" },
  { q: "Where do I edit a picture I already made?", a: "Open it in the Library, then Edit with AI (change it with words) or Editor (layers and tools).", href: "/studio/library" },
  { q: "Where do I turn a picture into a video?", a: "Open it in the Library and choose Animate this picture.", href: "/studio/library" },
  { q: "Where do I see what I spent?", a: "Billing lists every charge and refund, by brand.", href: "/studio/account/billing" },
  { q: "Where do I get more credits?", a: `Billing. Free starts with ${SIGNUP_CREDITS} credits; plans add credits every month and top-ups start at $3.`, href: "/studio/account/billing" },
  { q: "Where did my unfinished work go?", a: "Editors keep it on this device for 14 days: open the same editor and pick up where you left off.", href: "/studio/image?mode=design" },
];

/** The Getting started list on Create. */
export type StartStep = { id: "brand" | "first" | "socials" | "schedule" | "ask"; title: string; line: string; href: string };
export const START_STEPS: StartStep[] = [
  { id: "brand", title: "Set up your brand", line: "Logo and colours, so everything you make looks like you.", href: "/studio/brand" },
  { id: "first", title: "Make your first post", line: "Inspo Remix is the fastest: drop a post you love.", href: "/studio/image?mode=remix" },
  { id: "socials", title: "Connect a social account", line: "So BlinkSpot can post for this brand.", href: "/studio/brand#socials" },
  { id: "schedule", title: "Schedule a post", line: "Pick a day in Plan; it goes out by itself.", href: "/studio/plan" },
  { id: "ask", title: "Ask BlinkSpot something", line: "Try: plan my first week of posts.", href: "/studio?ask=1" },
];
export const ASK_TRIED_KEY = "blink.askTried";
export const START_HIDDEN_KEY = "blink.gettingStarted.hidden";

/** Items whose words match every word of the query (title, text, keywords). */
export function searchGuide(query: string): GuideSection[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return GUIDE;
  return GUIDE.map((s) => ({ ...s, items: s.items.filter((i) => { const hay = `${i.title} ${i.what} ${i.keywords ?? ""} ${s.title}`.toLowerCase(); return words.every((w) => hay.includes(w)); }) })).filter((s) => s.items.length);
}
