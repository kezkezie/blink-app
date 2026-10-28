import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

/**
 * No keys in the code (2026-10-28 launch security check): this repo is public on GitHub, and it held
 * the live PostForMe key, a Supabase service-role key and an n8n MCP token in scripts. Keys live in
 * .env.local and Vercel only. This fails if one is committed again.
 */
const PATTERNS: Array<[string, RegExp]> = [
  ["PostForMe key", /pfm_(live|test)_[A-Za-z0-9]{12,}/],
  ["JWT (Supabase or n8n key)", /eyJhbGciOiJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{20,}/],
  ["Anthropic key", /sk-ant-[a-z0-9]{3,}-[A-Za-z0-9_-]{20,}/],
  ["OpenAI key", /sk-(proj-)?[A-Za-z0-9_-]{40,}/],
  ["Paystack secret", /sk_(live|test)_[a-f0-9]{30,}/],
  ["Replicate token", /r8_[A-Za-z0-9]{30,}/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{36,}/],
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
];

describe("no secrets in the repo", () => {
  it("no tracked file holds a key", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter((f) => f && !/package-lock\.json$|\.(png|jpe?g|webp|gif|mp4|mov|woff2?|ttf|otf|ico|pdf|zip)$/i.test(f));
    const found: string[] = [];
    for (const f of files) {
      let text = "";
      try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
      for (const [name, re] of PATTERNS) if (re.test(text)) found.push(`${f}: ${name}`);
    }
    expect(found).toEqual([]);
  });
});
