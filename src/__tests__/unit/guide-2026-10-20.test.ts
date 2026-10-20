import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GUIDE, START_STEPS, TOUR_STEPS, WHERE_DO_I, searchGuide } from "@/lib/guide";
import { AI_ERASE_CREDITS, MAP_CREDITS } from "@/lib/editor/regions";
import { SITE_PAGE_CREDITS } from "@/lib/sites/code";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";

/** Orientation (2026-10-20): the tour points at real places, links go to real pages, prices match the charges. */
const root = join(__dirname, "../../..");
const pageFor = (href: string) => {
  const path = href.split(/[?#]/)[0].replace(/^\//, "");
  return ["page.tsx", "page.ts"].some((f) => existsSync(join(root, "src/app", path, f)));
};

describe("orientation", () => {
  it("every tour stop points at something the shell marks", () => {
    const shell = readFileSync(join(root, "src/components/studio/StudioShell.tsx"), "utf8");
    for (const s of TOUR_STEPS.filter((x) => x.target)) {
      const marked = shell.includes(`data-tour="${s.target}"`) || (shell.includes("data-tour={p.id}") && new RegExp(`id: "${s.target}"`).test(shell));
      expect(marked, s.target).toBe(true);
    }
  });

  it("every link opens a page that exists", () => {
    const hrefs = [...GUIDE.flatMap((s) => s.items.map((i) => i.href)), ...WHERE_DO_I.map((f) => f.href), ...START_STEPS.map((s) => s.href)];
    for (const h of hrefs) expect(pageFor(h), h).toBe(true);
  });

  it("prices come from the constants that charge them", () => {
    const all = GUIDE.flatMap((s) => s.items);
    expect(all.find((i) => i.title.startsWith("AI eraser"))!.cost).toContain(`${AI_ERASE_CREDITS} cr an erase, ${MAP_CREDITS} cr to map`);
    expect(all.find((i) => i.title === "Make a page")!.cost).toBe(`${SITE_PAGE_CREDITS} cr a page`);
    expect(all.find((i) => i.title === "Inspo Remix")!.cost).toBe(`${IMAGE_ENGINE_REGISTRY.nb2.creditCost} cr an image`);
  });

  it("search finds by plain words", () => {
    expect(searchGuide("remove object").flatMap((s) => s.items.map((i) => i.title))).toContain("AI eraser (A)");
    expect(searchGuide("instagram").flatMap((s) => s.items.map((i) => i.title))).toContain("Connect accounts");
    expect(searchGuide("")).toBe(GUIDE);
    expect(searchGuide("zzzz")).toEqual([]);
  });
});
