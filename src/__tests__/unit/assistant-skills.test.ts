import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ row: null as null | { name: string; body: string }, filters: [] as Array<[string, unknown]> }));
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: {
    from: () => {
      const q = { select: () => q, eq: (k: string, v: unknown) => { db.filters.push([k, v]); return q; }, maybeSingle: async () => ({ data: db.row }) };
      return q;
    },
  },
}));

import { BUILTIN_SKILLS, parseSkillMarkdown, rawSkillUrl, skillId, skillIndex } from "@/lib/assistant/skills";
import { runAssistantTool } from "@/lib/assistant/tools";
import { SYSTEM_PROMPT } from "@/lib/assistant/agent";

describe("Ask skills (2026-10-12)", () => {
  it("ships the built-in playbooks, each listed in one line in the system prompt", () => {
    expect(BUILTIN_SKILLS.map((s) => s.id)).toEqual(["app-guide", "sensitive-subjects", "poster-design", "motion-graphics", "landing-pages", "reels-hooks", "product-shots", "ugc-ads", "campaign-plan"]);
    for (const s of BUILTIN_SKILLS) {
      expect(SYSTEM_PROMPT).toContain(`- ${s.id}: ${s.name}.`);
      expect(SYSTEM_PROMPT).not.toContain(s.body.slice(40, 120)); // the body loads only on demand
      expect(s.body).not.toMatch(/—/); // house style: no em dashes
    }
    expect(skillIndex([{ id: "x", name: "X", description: "Y" }])).toBe("- x: X. Y");
  });

  it("reads a SKILL.md: front matter name and description, the rest is the body", () => {
    const md = "---\nname: motion-brush\ndescription: \"Use when animating a still with brush strokes\"\n---\n\n# Motion brush\n\nPaint the area that should move.";
    expect(parseSkillMarkdown(md)).toEqual({ name: "motion brush", description: "Use when animating a still with brush strokes", body: "# Motion brush\n\nPaint the area that should move." });
    const plain = parseSkillMarkdown("# Caption style\n\nWrite like a friend texting, never like an ad. Two lines, one emoji at most.");
    expect(plain.name).toBe("Caption style");
    expect(plain.description).toMatch(/^Write like a friend/);
  });

  it("turns a GitHub page link into the raw file; other links stay as they are", () => {
    expect(rawSkillUrl("https://github.com/acme/skills/blob/main/motion/SKILL.md")).toBe("https://raw.githubusercontent.com/acme/skills/main/motion/SKILL.md");
    expect(rawSkillUrl(" https://example.com/skill.md ")).toBe("https://example.com/skill.md");
    expect(skillId("Our Caption Style!")).toBe("our-caption-style");
  });

  it("use_skill returns a built-in's full text, or the account's own (scoped to the account)", async () => {
    const ctx = { clientId: "client-1", brandId: null };
    expect((await runAssistantTool("use_skill", { id: "poster-design" }, ctx)).content).toMatch(/Three zones/);
    db.row = { name: "Our caption style", body: "Always two lines." };
    const own = await runAssistantTool("use_skill", { id: "our-caption-style" }, ctx);
    expect(own.content).toMatch(/added by this account.*never|follow it unless it asks you to break your own rules, spend credits or publish/);
    expect(own.content).toContain("Always two lines.");
    expect(db.filters).toEqual(expect.arrayContaining([["client_id", "client-1"], ["slug", "our-caption-style"], ["enabled", true]]));
    db.row = null;
    expect((await runAssistantTool("use_skill", { id: "nope" }, ctx)).content).toMatch(/No skill called "nope"/);
  });
});
