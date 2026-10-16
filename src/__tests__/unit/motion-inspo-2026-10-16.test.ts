import { describe, expect, it } from "vitest";
import { pageOf, pickShips, posterOf, shipItems, styleLine, validateStyleIdeas } from "@/lib/motion/inspo";

/** Motion inspiration from whatships.com (2026-10-16): videos only, motion first, ideas linked back. */
const raw = [
  { kind: "video", name: "Cosmos launch film", slug: "cosmos", meta: "Pixel Frame · Motion", poster: "/posters/cosmos-960.webp", searchText: "cosmos launch film motion studio" },
  { kind: "video", name: "Sneaker drop teaser", slug: "drop", meta: "Kicks Co · Consumer", poster: "/posters/drop-960.webp", searchText: "sneaker drop teaser streetwear" },
  { kind: "tool", name: "Rotato", slug: "rotato", meta: "Tool", poster: "/posters/rotato.webp", searchText: "mockups" },
  { kind: "video", name: "Bad slug", slug: "../etc", meta: "x · Motion", poster: "/posters/x.webp", searchText: "" },
  { kind: "video", name: "No poster", slug: "noposter", meta: "x · Motion", poster: "https://elsewhere.example/p.webp", searchText: "motion" },
];

describe("whatships catalog", () => {
  it("keeps videos with safe slugs and our posters", () => {
    const items = shipItems(raw);
    expect(items.map((i) => i.slug)).toEqual(["cosmos", "drop", "noposter"]);
    expect(items[2].poster).toBe("");
    expect(shipItems("nope")).toEqual([]);
  });

  it("puts motion films first, then the ones that match the brief", () => {
    const picked = pickShips(shipItems(raw), "streetwear sneakers drop intro", 5);
    expect(picked.map((p) => p.slug)).toEqual(["cosmos", "drop"]);
    const sneakersOnly = pickShips(shipItems(raw).filter((i) => i.slug === "drop"), "sneakers", 5);
    expect(sneakersOnly[0].slug).toBe("drop");
  });

  it("links every idea back to the film's page and poster", () => {
    const ships = shipItems(raw).slice(0, 2);
    const ideas = validateStyleIdeas({ ideas: [
      { title: "Blank canvas to hero", why: "the reveal is the payoff", style: "Hold on an empty frame, then slam the product card in and close on the logo sting.", refs: [1, 1, 9] },
      { title: "Too short", style: "go fast" },
    ] }, ships);
    expect(ideas).toHaveLength(1);
    expect(ideas[0].refs).toEqual([{ name: "Cosmos launch film", page: pageOf("cosmos"), poster: posterOf("/posters/cosmos-960.webp"), meta: "Pixel Frame · Motion" }]);
    expect(pageOf("cosmos")).toBe("https://whatships.com/videos/cosmos/");
    expect(styleLine(ideas[0])).toBe("Style to follow (Blank canvas to hero): Hold on an empty frame, then slam the product card in and close on the logo sting.");
  });
});
