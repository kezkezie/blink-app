import { describe, expect, it } from "vitest";
import { pickCaption } from "@/lib/social-schedule";

/** The caption a post goes out with (2026-10-21): the chosen length, never blank, never the working title. */
const row = { caption: "Long story about the harvest.\n\nCome by Saturday.", caption_short: "Picked this morning.", hashtags: "#nairobi #mushrooms", caption_written: true };

describe("pickCaption", () => {
  it("posts the short one when short is picked", () => {
    const r = pickCaption({ ...row, caption_choice: "short" });
    expect(r).toEqual({ ok: true, choice: "short", text: "Picked this morning.\n\n#nairobi #mushrooms" });
  });
  it("posts the long one when long is picked", () => {
    const r = pickCaption({ ...row, caption_choice: "long" });
    expect(r.ok && r.text.startsWith("Long story")).toBe(true);
  });
  it("a choice in the request wins over the saved one", () => {
    expect(pickCaption({ ...row, caption_choice: "long" }, "short").choice).toBe("short");
    expect(pickCaption({ ...row, caption_choice: "short" }, "nonsense").choice).toBe("short");
  });
  it("never posts blank: an empty chosen caption falls back to the other one", () => {
    const a = pickCaption({ ...row, caption_short: "  ", caption_choice: "short" });
    expect(a.ok && a.text.startsWith("Long story")).toBe(true);
    const b = pickCaption({ ...row, caption: "", caption_choice: "long" });
    expect(b.ok && b.text.startsWith("Picked this morning.")).toBe(true);
  });
  it("a working title alone doesn't post", () => {
    const r = pickCaption({ caption: "Container", caption_short: null, hashtags: null, caption_written: false });
    expect(r).toMatchObject({ ok: false, code: "needs_caption" });
    expect(!r.ok && r.error).toContain("Container");
  });
  it("hashtags alone aren't a caption", () => {
    expect(pickCaption({ caption: "", caption_short: "", hashtags: "#a", caption_written: true }).ok).toBe(false);
  });
  it("keeps Instagram's 2200 limit", () => {
    const r = pickCaption({ ...row, caption: "x".repeat(3000) });
    expect(r.ok && r.text.length).toBe(2200);
  });
});
