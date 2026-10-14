import { describe, expect, it } from "vitest";
import {
  aspectFor, boxesToThousandths, buildEditPrompt, changeCount, keptScan, normalizeChanges, scanAfterEdit, scanSystem, validateScan, whereIs, type Scan,
} from "@/lib/ai-edit";

/** Edit with AI rebuilt in the app (2026-10-15): kept scans, only-the-changes prompts, swaps sent as images. */
const SCAN: Scan = validateScan({
  scene: "A weekly availability flyer for oyster mushrooms.",
  light: "Soft, even studio light",
  objects: [
    { id: "o1", name: "Headline", kind: "words", color: "#231f20", material: "flat ink", text: "Weekly Availability", font: "bold geometric sans-serif", box: [48, 60, 900, 110] },
    { id: "o2", name: "Mushroom photo", kind: "thing", color: "#8A7F7A", material: "photo in a circle", box: [48, 665, 265, 262] },
    { id: "o3", name: "Brand logo", kind: "thing", color: "#231F20", material: "flat dark shapes", text: "AUJ.", box: [800, 900, 150, 80] },
    { id: "o4", name: "Background", kind: "background", color: "#DEDAD7", material: "light grey paper", box: [0, 0, 1000, 1000] },
  ],
})!;

describe("scan", () => {
  it("asks for pixel boxes of the picture as sent", () => {
    expect(scanSystem(1024, 1280)).toMatch(/pixels of this 1024x1280 picture/);
    expect(scanSystem(1024, 1280)).toMatch(/exact characters/);
  });

  it("turns pixel boxes into thousandths and clamps them to the picture", () => {
    const raw = boxesToThousandths({ objects: [{ id: "a", name: "Cup", box: [512, 640, 256, 320] }, { id: "b", name: "Edge", box: [900, 1200, 300, 200] }] }, 1024, 1280);
    const scan = validateScan(raw)!;
    expect(scan.objects[0].box).toEqual([500, 500, 250, 250]);
    expect(scan.objects[1].box).toEqual([879, 938, 121, 62]);
    expect(boxesToThousandths(null, 10, 10)).toBeNull();
  });

  it("reads old and new field names, fixes kinds and ids, drops junk", () => {
    const scan = validateScan({
      scene_description: "Old style",
      lighting_and_weather: "Warm",
      objects: [
        { id: "obj 1", name: "Sign", type: "text", color: "#ff0000", material: "", text_content: "OPEN", font_style: "Neon script" },
        { id: "obj 1", name: "Cup", type: "object", color: "red", material: "ceramic", box: [10, 10, 2, 2] },
        { name: "" },
        "nope",
      ],
    })!;
    expect(scan.scene).toBe("Old style");
    expect(scan.objects).toHaveLength(2);
    expect(scan.objects[0]).toMatchObject({ id: "obj1", kind: "words", color: "#FF0000", text: "OPEN", font: "Neon script" });
    expect(scan.objects[1]).toMatchObject({ id: "obj1x", kind: "thing", color: "" });
    expect(scan.objects[1].box).toBeUndefined();
    expect(validateScan({ objects: [{ id: "a", name: "Only one" }] })).toBeNull();
    expect(validateScan("x")).toBeNull();
  });

  it("keeps a scan only for the picture it describes", () => {
    const stored = { source: "https://x/a.jpg", scan: SCAN, at: "2026-10-15T00:00:00Z", from: "edit", size: [1024, 1280] };
    expect(keptScan(stored, "https://x/a.jpg")).toMatchObject({ from: "edit", size: [1024, 1280] });
    expect(keptScan(stored, "https://x/b.jpg")).toBeNull();
    expect(keptScan({ ...stored, scan: { objects: [] } }, "https://x/a.jpg")).toBeNull();
    expect(keptScan(null, "https://x/a.jpg")).toBeNull();
  });
});

describe("changes", () => {
  it("counts only what really differs from the kept scan", () => {
    const c = normalizeChanges(SCAN, {
      objects: [
        { id: "o1", text: "This Week", color: "#231F20" },
        { id: "o2", color: "#8a7f7a", material: "photo in a circle" },
        { id: "o3", remove: true, color: "#FF0000" },
        { id: "ghost", color: "#000000" },
        { id: "o1", text: "Twice" },
      ],
      light: "Soft, even studio light",
      instruction: "  make it feel like evening ",
    });
    expect(c.objects).toEqual([{ id: "o1", text: "This Week" }, { id: "o3", remove: true }]);
    expect(c.light).toBeUndefined();
    expect(c.instruction).toBe("make it feel like evening");
    expect(changeCount(c)).toBe(3);
  });

  it("adds swaps, and ignores words on things that have none", () => {
    const c = normalizeChanges(SCAN, { objects: [{ id: "o2", text: "Hello" }] }, ["o2", "o4"]);
    expect(c.objects).toEqual([{ id: "o2", swap: true }, { id: "o4", swap: true }]);
    expect(changeCount(normalizeChanges(SCAN, {}))).toBe(0);
    expect(changeCount(normalizeChanges(SCAN, null))).toBe(0);
  });
});

describe("edit prompt", () => {
  it("lists only the changes, where each thing is, and keeps the rest", () => {
    const changes = normalizeChanges(SCAN, { objects: [{ id: "o1", text: "This Week's Mushrooms" }, { id: "o3", remove: true }, { id: "o4", material: "Soft gradient" }], light: "golden hour" }, ["o2"]);
    const p = buildEditPrompt(SCAN, changes, ["o2"]);
    expect(p).toMatch(/^Edit image 1\. Make only these changes:/);
    expect(p).toContain(`Change the words of the Headline (upper middle) from "Weekly Availability" to exactly "This Week's Mushrooms"`);
    expect(p).toContain("Replace the Mushroom photo (lower left) with the main product or object from image 2 only (not its background, props or surface)");
    expect(p).toContain("Remove the Brand logo (lower right) completely");
    expect(p).toContain("Change the Background (centre) to Soft gradient (it is light grey paper now), keeping everything in front of it exactly as it is.");
    expect(p).toContain("Change the lighting to: golden hour.");
    expect(p).not.toMatch(/DO NOT TOUCH/);
    expect(p).toMatch(/Same size and shape as image 1\. Add nothing that isn't asked for above\.$/);
    expect(p).not.toMatch(/Do not add any new/);
  });

  it("names what to keep, including the exact words", () => {
    const p = buildEditPrompt(SCAN, normalizeChanges(SCAN, { objects: [{ id: "o2", color: "#FF5733" }] }), []);
    expect(p).toContain("Make the Mushroom photo (lower left) #FF5733 (it is #8A7F7A now), keeping its shading and texture.");
    expect(p).toContain(`the words "Weekly Availability", the Brand logo, the Background`);
  });

  it("doesn't ask to keep the parts of a thing that is swapped or removed", () => {
    const shoe = validateScan({ objects: [
      { id: "s", name: "High-top sneaker", kind: "thing", box: [200, 300, 600, 500] },
      { id: "l", name: "Shoelaces", kind: "thing", box: [350, 350, 200, 150] },
      { id: "t", name: "Tagline", kind: "words", text: "Limited pairs", box: [100, 880, 300, 60] },
      { id: "b", name: "Background", kind: "background", box: [0, 0, 1000, 1000] },
    ] })!;
    const p = buildEditPrompt(shoe, normalizeChanges(shoe, {}, ["s"]), ["s"]);
    expect(p).toContain("Replace the High-top sneaker (centre) with the main product or object from image 2 only");
    expect(p).not.toContain("the Shoelaces");
    expect(p).toContain(`the words "Limited pairs", the Background`);
    const recolour = buildEditPrompt(shoe, normalizeChanges(shoe, { objects: [{ id: "s", color: "#FF0000" }] }), []);
    expect(recolour).toContain("the Shoelaces");
  });

  it("takes words out when they are emptied, and changes lettering alone", () => {
    expect(buildEditPrompt(SCAN, normalizeChanges(SCAN, { objects: [{ id: "o1", text: "" }] }), [])).toContain("Remove the words of the Headline");
    expect(buildEditPrompt(SCAN, normalizeChanges(SCAN, { objects: [{ id: "o1", font: "chunky serif" }] }), [])).toContain(`Change the lettering of the Headline (upper middle) to chunky serif; keep the same words, spelled exactly: "Weekly Availability".`);
  });

  it("the result starts with the scan it was asked for", () => {
    const changes = normalizeChanges(SCAN, { objects: [{ id: "o1", text: "New" }, { id: "o3", remove: true }], light: "dusk" });
    const after = scanAfterEdit(SCAN, changes);
    expect(after.light).toBe("dusk");
    expect(after.objects.map((o) => o.id)).toEqual(["o1", "o2", "o4"]);
    expect(after.objects[0].text).toBe("New");
  });
});

describe("shape and place", () => {
  it("keeps the picture's own shape", () => {
    expect(aspectFor(1024, 1280)).toBe("4:5");
    expect(aspectFor(1920, 1080)).toBe("16:9");
    expect(aspectFor(1000, 1000)).toBe("1:1");
    expect(aspectFor(1080, 1920)).toBe("9:16");
    expect(aspectFor(1500, 1000)).toBe("3:2");
    expect(aspectFor(0, 0)).toBe("1:1");
  });

  it("says where a box is", () => {
    expect(whereIs([0, 0, 200, 200])).toBe("upper left");
    expect(whereIs([400, 400, 200, 200])).toBe("centre");
    expect(whereIs([800, 400, 100, 100])).toBe("right side");
    expect(whereIs([400, 800, 100, 100])).toBe("lower middle");
    expect(whereIs(undefined)).toBe("");
  });
});
