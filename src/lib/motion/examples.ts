import { applyLook } from "./looks";
import type { MotionScene, MotionShape, MotionSpec } from "./spec";

/**
 * Examples to start from (Kezie, 2026-10-28, after Sirio's "300 boards" and Jack Roberts' "Claude
 * Video 2.0": the same prompt gives everyone the same generic graphic; what makes it good is a
 * library of ready designs, each with a name and the kind of sentence it's for). Each one is a
 * finished plan in one of our looks, written with the brand's own name, so opening it costs
 * nothing: change the words in the studio and make it.
 */
export type MotionCategory = "explain" | "numbers" | "launch" | "brand" | "walkthrough" | "overlay";

export const CATEGORIES: Array<{ id: MotionCategory; title: [string, string]; line: string; start: string; tags: string[]; example?: string }> = [
  { id: "explain", title: ["Explainers", "that draw the idea"], line: "One idea per scene, arriving as it's said: a hook, the steps, the number that matters, an end card.", start: "A 20 second explainer of how our product works: a hook, one idea per scene, the key number, then an end card", tags: ["Key points", "Story card", "Kinetic type"], example: "three-steps" },
  { id: "numbers", title: ["Numbers", "that move"], line: "Bars that grow, a number that counts up, a before and after. Paste your figures; nothing is invented.", start: "Our results as an animated bar chart, the best one highlighted, then the change as a before and after", tags: ["Bar chart", "Big number", "Before and after"], example: "growth-chart" },
  { id: "launch", title: ["Launches", "and product reveals"], line: "A bold hook, what's new, the price, your logo and the call to action. Your photos go in.", start: "A 15 second launch teaser: a bold hook, what's new, the price, then our logo and the call to action", tags: ["Product reveal", "Feature tiles", "End card"], example: "launch-day" },
  { id: "brand", title: ["Brand moments", "intros and stings"], line: "A punchy intro, your logo building on, an end card with your handle and website.", start: "A punchy 5 second intro with our main message, then our logo with the tagline", tags: ["Intro", "Logo sting", "End card"], example: "logo-sting" },
  { id: "walkthrough", title: ["App walkthroughs", "one tap at a time"], line: "Add screenshots and each one becomes a step: the camera eases to the button, a tap, and what it does.", start: "A walkthrough of our app: one step per screenshot, pointing at the button and saying what it does", tags: ["Screen steps", "Phone or laptop frame"] },
  { id: "overlay", title: ["Over your video", "names and captions"], line: "A see-through name bar for interviews and talking videos, in your colours, ready for the editor.", start: "A lower third with a name and title, over my video", tags: ["Lower third", "See-through"], example: "lower-third" },
];

export type MotionExample = {
  id: string; name: string; category: MotionCategory; look: string;
  /** The kind of line it's for, as people say it (Sirio's tags: what lets the right board be found). */
  forLine: string; tags: string[];
  scenes: (brand: string) => MotionScene[];
  overlay?: boolean; loop?: boolean;
};

const short = (brand: string) => brand.split(/\s+/).slice(0, 3).join(" ");

export const EXAMPLES: MotionExample[] = [
  { id: "launch-day", name: "Launch day", category: "launch", look: "launch", forLine: "Something new is here", tags: ["hook", "what's new", "call to action"],
    scenes: (b) => [
      { template: "kinetic-headline", seconds: 3, words: "It's finally here.", sub: `New from ${short(b)}`, enter: "focus", mark: "here.", markStyle: "color" },
      { template: "tiles", seconds: 4.5, title: "What's new", tiles: [{ title: "Faster", value: "2×" }, { title: "Made fresh", line: "Every single day" }, { title: "Free delivery", value: "Free" }] },
      { template: "end-card", seconds: 3, cta: "Order today", handle: `@${short(b).toLowerCase().replace(/[^a-z0-9]/g, "")}`, logo: true },
    ] },
  { id: "big-number", name: "The big number", category: "numbers", look: "swiss", forLine: "A number that matters", tags: ["a number", "proof"],
    scenes: (b) => [
      { template: "stat", seconds: 3.5, value: 12400, decimals: 0, suffix: "+", label: `happy customers of ${short(b)}` },
      { template: "kinetic-headline", seconds: 2.5, words: "And counting.", enter: "slam" },
    ] },
  { id: "before-after", name: "Before and after", category: "numbers", look: "keynote", forLine: "Something got better", tags: ["a change", "results"],
    scenes: () => [
      { template: "compare", seconds: 4, label: "Hours spent on posts each week", from: 12, to: 2, decimals: 0, suffix: " h", fromLabel: "Before", toLabel: "Now" },
      { template: "kinetic-headline", seconds: 2.5, words: "Ten hours back.", enter: "word", mark: "back.", markStyle: "box" },
    ] },
  { id: "growth-chart", name: "Growth chart", category: "numbers", look: "news", forLine: "Our numbers, month by month", tags: ["a trend", "the best month"],
    scenes: () => [
      { template: "bars", seconds: 5, title: "Orders per month", bars: [{ label: "Jan", value: 120 }, { label: "Feb", value: 180 }, { label: "Mar", value: 260 }, { label: "Apr", value: 410 }], decimals: 0, highlight: 3 },
    ] },
  { id: "three-steps", name: "Three steps", category: "explain", look: "whiteboard", forLine: "How it works", tags: ["a list of steps", "how to"],
    scenes: (b) => [
      { template: "kinetic-headline", seconds: 2.5, words: "How it works", enter: "line" },
      { template: "points", seconds: 6, title: `${short(b)} in three steps`, points: ["Pick what you love", "We make it fresh", "It's at your door"] },
    ] },
  { id: "myth-fact", name: "Myth vs fact", category: "explain", look: "dossier", forLine: "People think this, but it's actually that", tags: ["correcting a belief"],
    scenes: () => [
      { template: "kinetic-headline", seconds: 3, words: "People think it's expensive.", enter: "word", mark: "expensive.", markStyle: "box" },
      { template: "kinetic-headline", seconds: 3, words: "It costs less than coffee.", sub: "Every day, from 150 KES", enter: "slam", mark: "less", markStyle: "color" },
    ] },
  { id: "product-drop", name: "Product drop", category: "launch", look: "glass", forLine: "Meet the product", tags: ["a product", "a price"],
    scenes: (b) => [
      { template: "product-reveal", seconds: 4.5, name: `${short(b)} Signature`, price: "KES 2,500", tagline: "Made to be noticed" },
      { template: "end-card", seconds: 3, cta: "Shop the drop", logo: true },
    ] },
  { id: "feature-grid", name: "Feature grid", category: "launch", look: "glass", forLine: "Everything you get", tags: ["features side by side"],
    scenes: () => [
      { template: "tiles", seconds: 5, title: "Everything you get", tiles: [{ title: "4K", value: "4K", line: "Sharp on every screen" }, { title: "Same day", line: "Order by noon" }, { title: "No contract", value: "0", line: "Cancel any time" }, { title: "Support", line: "Real people, 7 days" }] },
    ] },
  { id: "motion-quote", name: "Motion quote", category: "explain", look: "silkscreen", forLine: "A line worth remembering", tags: ["a feeling", "a quote"],
    scenes: () => [
      { template: "story", seconds: 5, lines: [{ text: "good things", size: "m", accent: false, align: "center" }, { text: "grow", size: "xl", accent: true, align: "center" }, { text: "slowly", size: "m", accent: false, align: "center" }], place: "center", backdrop: "sunrise", frame: "none", enter: "rise" },
    ] },
  { id: "logo-sting", name: "Logo sting", category: "brand", look: "deco", forLine: "Our name, beautifully", tags: ["an intro", "an outro"],
    scenes: (b) => [{ template: "logo-sting", seconds: 3, tagline: `${short(b)}, since day one` }] },
  { id: "punchy-intro", name: "Punchy intro", category: "brand", look: "spy", forLine: "Open with a bang", tags: ["a hook"],
    scenes: (b) => [
      { template: "kinetic-headline", seconds: 2.5, words: "Ready? Let's go.", enter: "slam" },
      { template: "logo-sting", seconds: 2.5, tagline: short(b) },
    ] },
  { id: "event", name: "Save the date", category: "brand", look: "risograph", forLine: "Come to our event", tags: ["a date", "an invite"],
    scenes: (b) => [
      { template: "kinetic-headline", seconds: 3, words: "Saturday. 10 am.", sub: `${short(b)} open day`, enter: "word", mark: "Saturday.", markStyle: "box" },
      { template: "end-card", seconds: 3, cta: "Save your spot", website: "blinkspot.io", logo: true },
    ] },
  { id: "announcement", name: "Terminal announcement", category: "launch", look: "crt", forLine: "Big news, typed out", tags: ["news", "tech"],
    scenes: () => [{ template: "kinetic-headline", seconds: 4, words: "New version. Now live.", sub: "Update today", enter: "line" }] },
  { id: "how-its-made", name: "How it's made", category: "explain", look: "blueprint", forLine: "Behind the scenes", tags: ["a process", "craft"],
    scenes: () => [{ template: "points", seconds: 6, title: "How it's made", points: ["Sourced locally", "Made by hand", "Checked twice"] }] },
  { id: "lower-third", name: "Name bar", category: "overlay", look: "news", forLine: "Who's talking", tags: ["an interview", "a talking video"], overlay: true,
    scenes: (b) => [{ template: "lower-third", seconds: 5, title: "Kezie, Founder", subtitle: short(b) }] },
  { id: "loop-backdrop", name: "Looping backdrop", category: "brand", look: "glass", forLine: "Behind a website or a deck", tags: ["a loop", "a background"], loop: true,
    scenes: (b) => [{ template: "kinetic-headline", seconds: 5, words: `${short(b)}, in motion.`, enter: "focus", mark: "motion.", markStyle: "color" }] },
];

export const exampleById = (id: string | null | undefined) => EXAMPLES.find((e) => e.id === id) ?? null;

/** An example as a finished plan in the brand's name and colour, in the shape asked for and a look (its own unless another is picked). */
export function exampleSpec(ex: MotionExample, opts: { shape: MotionShape; brand: string; primary?: string | null; secondary?: string | null; look?: string | null }): MotionSpec {
  const base: MotionSpec = {
    kind: ex.overlay ? "overlay" : "full", shape: opts.shape,
    palette: { background: "#0C0D0F", text: "#F5F5F7", accent: opts.primary || "#C6F432", ...(opts.secondary ? { second: opts.secondary } : {}) },
    scenes: ex.scenes(opts.brand || "Your brand"),
    ...(ex.loop ? { loop: true } : {}),
  };
  return applyLook(base, opts.look ?? ex.look, { primary: opts.primary ?? null, secondary: opts.secondary ?? null });
}

/** A short sample in any look, with the brand's name (the hero's cards). */
export function lookSample(lookId: string | null, opts: { shape: MotionShape; brand: string; primary?: string | null; secondary?: string | null }): MotionSpec {
  const b = short(opts.brand || "Your brand");
  const base: MotionSpec = {
    kind: "full", shape: opts.shape, palette: { background: "#0C0D0F", text: "#F5F5F7", accent: opts.primary || "#C6F432", ...(opts.secondary ? { second: opts.secondary } : {}) },
    scenes: [{ template: "kinetic-headline", seconds: 4, words: `${b}, in motion.`, sub: "Your words. Your colours.", enter: "word", mark: "motion.", markStyle: "color" }],
  };
  // No look: the brand's own colours (what a plan without a look uses).
  return applyLook(base, lookId, { primary: opts.primary ?? null, secondary: opts.secondary ?? null });
}
