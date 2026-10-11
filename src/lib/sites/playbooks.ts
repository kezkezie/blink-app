import type { SiteStyle } from "./spec";

/**
 * What a landing page for this kind of business usually needs (Kezie's idea, 2026-10-11: "think
 * of what industry it's in, and know what websites are usually made in those contexts").
 * Used when the owner gives no site they like. The model gets the guidance; our templates still
 * do the rendering, so a playbook can only choose and order sections and steer the copy.
 */
export type Playbook = {
  id: string;
  label: string;
  /** One line for the owner: what the page will focus on. */
  line: string;
  /** For the model: section order and what each must do. */
  guide: string;
  style: SiteStyle;
};

const PLAYBOOKS: Array<Playbook & { words: RegExp }> = [
  {
    id: "food", label: "Restaurants & food", words: /restaurant|caf[eé]|coffee|kitchen|food|juice|bakery|cake|catering|grill|pizza|burger|chef|meal|eatery|bar\b|drinks?/i, style: "soft",
    line: "A mouth-watering hero, the menu with prices, and one-tap ordering on WhatsApp.",
    guide: "Hero with the most appetising food photo and an Order button. Then the menu (products) with prices. Then why people come back (highlights: freshness, portions, delivery areas, only facts given). A gallery of food and the place. A short story about who cooks it. FAQ only about ordering and delivery if the facts cover it. Contact last with WhatsApp ordering.",
  },
  {
    id: "beauty", label: "Salons, beauty & barbers", words: /salon|spa|beauty|barber|hair|nail|makeup|make-up|lash|brow|skin ?care|cosmetic|massage/i, style: "editorial",
    line: "Your best work up front, services and prices, and booking on WhatsApp.",
    guide: "Hero with the best photo of finished work and a Book button. Then services (products) with prices. A gallery of work, it is what sells. The person behind it (about). FAQ about booking, walk-ins, how long it takes, only from the facts. Contact last with booking on WhatsApp.",
  },
  {
    id: "fashion", label: "Fashion & retail", words: /fashion|cloth|apparel|wear|boutique|shoe|sneaker|jewel|accessor|bag|\bstore\b|\bshop\b|retail|thrift/i, style: "editorial",
    line: "A lookbook feel: the pieces, the prices and how to order.",
    guide: "Hero with the strongest product or model photo (full photo if it is wide). Then the products as a shop with prices. A lookbook gallery. Highlights only for real facts (delivery, sizes, how to order). A short brand story. Contact last with order on WhatsApp.",
  },
  {
    id: "wellness", label: "Fitness & health", words: /gym|fitness|yoga|pilates|trainer|coach|wellness|clinic|health|pharma|nutrition|physio|dental/i, style: "bold",
    line: "Energy and trust: what you offer, plans and prices, and how to start.",
    guide: "Hero with people training or being cared for and a Start or Book button. Highlights: what makes it different (only facts). Plans, classes or services (products) with prices. About the coach or team. FAQ about first visits and prices if the facts cover them. Contact last.",
  },
  {
    id: "stay", label: "Hotels, venues & travel", words: /hotel|lodge|airbnb|bnb|stay|resort|venue|event|wedding|tour|travel|safari|camp/i, style: "editorial",
    line: "A big scenic hero, what's included, and enquiries in one tap.",
    guide: "Hero with a full, wide scenic photo and an Enquire button. Highlights: what is included and what is nearby (only facts). A gallery of the place. Packages or rooms (products) with prices. FAQ about booking and getting there if covered. Contact last.",
  },
  {
    id: "services", label: "Services & professionals", words: /agency|consult|law|legal|account|finance|insur|real estate|property|clean|repair|plumb|electric|logistic|transport|courier|tech|software|\bit\b|marketing|design|photograph|studio|school|tutor|training/i, style: "minimal",
    line: "Clear and credible: what you do, how it works and how to get a quote.",
    guide: "Hero that says plainly what you do and for whom, with a Get a quote button (text-led, photo optional). Highlights: the 3 steps of working with you, or the 3 main services. Services (products) with prices if given. About the team. FAQ that removes doubts (only facts). Contact last.",
  },
];

const GENERAL: Playbook = {
  id: "general", label: "Small business", style: "minimal",
  line: "What you sell, why people choose you, and an easy way to reach you.",
  guide: "Hero with the best photo and one clear button. Why people choose you (highlights, only facts). Products with prices. A gallery if there are 4+ images. A short story. Contact last.",
};

export function playbookFor(industry?: string | null, description?: string | null): Playbook {
  const hay = `${industry ?? ""} ${description ?? ""}`;
  // Industry wins over the description when both match something.
  const byIndustry = industry ? PLAYBOOKS.find((p) => p.words.test(industry)) : undefined;
  const hit = byIndustry ?? PLAYBOOKS.find((p) => p.words.test(hay));
  if (!hit) return GENERAL;
  const { words: _words, ...pb } = hit;
  void _words;
  return pb;
}
