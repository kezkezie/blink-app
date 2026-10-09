import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { dashboardPathFor, studioPathFor, studioSectionFor, studioTitleFor } from "@/lib/studio-routes";

describe("studio route map (v2 UI)", () => {
  it("gives every classic dashboard page a home in the studio", () => {
    expect(studioPathFor("/dashboard")).toBe("/studio");
    expect(studioPathFor("/dashboard/content")).toBe("/studio/library");
    expect(studioPathFor("/dashboard/content/abc-123")).toBe("/studio/library/abc-123");
    expect(studioPathFor("/dashboard/content/abc-123/edit")).toBe("/studio/library/abc-123/edit");
    expect(studioPathFor("/dashboard/upload")).toBe("/studio/library/upload");
    expect(studioPathFor("/dashboard/generate")).toBe("/studio/image");
    expect(studioPathFor("/dashboard/video")).toBe("/studio/video");
    expect(studioPathFor("/dashboard/calendar")).toBe("/studio/plan");
    expect(studioPathFor("/dashboard/approvals")).toBe("/studio/plan/approvals");
    expect(studioPathFor("/dashboard/analytics")).toBe("/studio/plan/analytics");
    expect(studioPathFor("/dashboard/brand")).toBe("/studio/brand");
    expect(studioPathFor("/dashboard/billing")).toBe("/studio/account/billing");
    expect(studioPathFor("/dashboard/settings")).toBe("/studio/account/settings");
  });

  it("does not match lookalike paths", () => {
    expect(studioPathFor("/dashboards")).toBeNull();
    // Not /dashboard/content: it is an unknown dashboard sub-path, kept under /studio rather than mis-mapped to the Library.
    expect(studioPathFor("/dashboard/contentx")).toBe("/studio/contentx");
    expect(studioPathFor("/login")).toBeNull();
  });

  it("maps back to the same classic page for the Classic look switch", () => {
    for (const p of ["/dashboard", "/dashboard/content/abc", "/dashboard/upload", "/dashboard/calendar", "/dashboard/approvals", "/dashboard/settings", "/dashboard/content/abc/edit"]) {
      expect(dashboardPathFor(studioPathFor(p)!)).toBe(p);
    }
  });

  it("every classic page file has a matching studio page file", () => {
    const app = path.resolve(__dirname, "../../app");
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(path.join(dir, d.name)) : d.name === "page.tsx" ? [path.join(dir, d.name)] : []);
    const classic = walk(path.join(app, "dashboard")).map((f) => "/" + path.relative(app, path.dirname(f)).split(path.sep).join("/"));
    for (const route of classic) {
      const studio = studioPathFor(route)!;
      expect(studio, route).toBeTruthy();
      expect(fs.existsSync(path.join(app, studio.slice(1), "page.tsx")), `${route} -> ${studio}`).toBe(true);
    }
  });

  it("groups pages into the four places plus the account menu", () => {
    expect(studioSectionFor("/studio")).toBe("create");
    expect(studioSectionFor("/studio/video")).toBe("create");
    expect(studioSectionFor("/studio/image")).toBe("create");
    expect(studioSectionFor("/studio/library/x")).toBe("library");
    expect(studioSectionFor("/studio/plan/analytics")).toBe("plan");
    expect(studioSectionFor("/studio/brand")).toBe("brand");
    expect(studioSectionFor("/studio/account/billing")).toBe("account");
    expect(studioTitleFor("/studio/library/upload")).toBe("Upload");
    expect(studioTitleFor("/studio/video")).toBe("Video Studio");
    expect(studioTitleFor("/studio")).toBe("Create");
  });

  it("the re-skin stylesheet only ever targets the studio, never the classic UI", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../../app/studio/legacy-theme.css"), "utf8");
    const rules = css.split("\n").filter((l) => l && !l.startsWith("/*"));
    expect(rules.length).toBeGreaterThan(100);
    for (const r of rules) expect(r.startsWith(".studio "), r).toBe(true);
  });
});
