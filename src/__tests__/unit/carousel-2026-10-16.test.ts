import { describe, expect, it } from "vitest";
import { seamlessPlan, seamlessPrompt, sliceRects, slidesOf, validateTopicCarousel } from "@/lib/carousel";

/** Carousels (2026-10-16): seamless maths, the topic outline, slides on a post. */
describe("seamless carousels", () => {
  it("asks for the wide shape that loses least, and stops at 3 slides", () => {
    expect(seamlessPlan(3, "4:5")).toMatchObject({ slides: 3, aspect: "21:9", width: 3240, height: 1350, kept: 0.97 });
    expect(seamlessPlan(2, "4:5")).toMatchObject({ slides: 2, aspect: "16:9", width: 2160, height: 1350, kept: 0.9 });
    expect(seamlessPlan(2, "1:1")).toMatchObject({ slides: 2, aspect: "16:9", kept: 0.89 });
    expect(seamlessPlan(8, "4:5").slides).toBe(3);
    expect(seamlessPlan(1, "1:1").slides).toBe(2);
  });

  it("crops to the exact total shape, centred, then cuts equal slides", () => {
    // A 21:9 picture (2016 x 864) for 3 portrait slides (2.4:1): full height, 2074 wide doesn't fit, so trim the height.
    const r = sliceRects(2016, 864, 3, "4:5");
    expect(r).toHaveLength(3);
    expect(r[0].sw).toBe(672);
    expect(r[0].sh).toBe(840);
    expect(r[0].sy).toBe(12);
    expect(r.map((x) => x.sx)).toEqual([0, 672, 1344]);
    expect(r[0].out).toEqual({ w: 1080, h: 1350 });
    // Too wide: trim the sides, keep the middle.
    const s = sliceRects(3000, 1000, 2, "1:1");
    expect(s.map((x) => [x.sx, x.sw, x.sh])).toEqual([[500, 1000, 1000], [1500, 1000, 1000]]);
  });

  it("asks for one continuous panorama, never panels or words", () => {
    const p = seamlessPrompt("Our farm at dawn", 3);
    expect(p).toMatch(/^Our farm at dawn\nONE single continuous panoramic photograph/);
    expect(p).toMatch(/Not a triptych, not a collage, no panels/);
    expect(p).toMatch(/subjects are spread out/);
    expect(p).toMatch(/No words or text anywhere/);
    expect(p).not.toMatch(/slide|cut/i);
  });
});

describe("topic carousels", () => {
  it("keeps a good outline, numbers the points and trims long words", () => {
    const c = validateTopicCarousel({
      slides: [
        { kind: "cover", title: "Five ways to keep oyster mushrooms fresh for longer at home today please", sub: "From the grow room" },
        { kind: "point", title: "Paper, not plastic" , body: "A paper bag lets them breathe." },
        { kind: "point", title: "Fridge, 2 to 4 °C" },
        { kind: "stat", value: "7 days", label: "how long they keep" },
        { kind: "bogus", title: "x" },
        { kind: "end", title: "Order by 10 am", cta: "WhatsApp us" },
      ],
      caption: "Fresh tips",
    })!;
    expect(c.slides.map((s) => s.kind)).toEqual(["cover", "point", "point", "stat", "end"]);
    expect(c.slides[0].kind === "cover" && c.slides[0].title.split(" ")).toHaveLength(9);
    expect(c.slides.filter((s) => s.kind === "point").map((s) => s.kind === "point" && s.number)).toEqual([1, 2]);
    expect(c.caption).toBe("Fresh tips");
  });

  it("needs a cover first and adds an end card if it's missing", () => {
    expect(validateTopicCarousel({ slides: [{ kind: "point", title: "a" }, { kind: "point", title: "b" }, { kind: "end", title: "c" }] })).toBeNull();
    const c = validateTopicCarousel({ slides: [{ kind: "cover", title: "Hook" }, { kind: "point", title: "One" }, { kind: "point", title: "Two" }] })!;
    expect(c.slides[c.slides.length - 1]).toEqual({ kind: "end", title: "Follow for more" });
    expect(validateTopicCarousel({ slides: [{ kind: "cover", title: "Only" }] })).toBeNull();
  });

  it("reads a post's slides however they were stored", () => {
    expect(slidesOf(["a", "b"])).toEqual(["a", "b"]);
    expect(slidesOf('["a","b"]')).toEqual(["a", "b"]);
    expect(slidesOf("a")).toEqual(["a"]);
    expect(slidesOf(null)).toEqual([]);
  });
});
