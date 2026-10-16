import { describe, expect, it } from "vitest";
import { parseAssistantRequest, withPictures } from "@/lib/assistant/request";

/** Pictures in Ask BlinkSpot (2026-10-16): our storage only, the workspace's own folder, recent ones as images. */
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://hzkufspjozkgmloznkvp.supabase.co";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pic = (client: string, n: number) => `${SB}/storage/v1/object/public/assets/images/${client}/ask_${n}.jpg`;

describe("Ask pictures", () => {
  it("keeps only our storage's images, up to 4, on user messages", () => {
    const p = parseAssistantRequest({ messages: [
      { role: "user", text: "Hi", images: [pic("c1", 1), "https://evil.example/x.jpg", `${SB}/storage/v1/object/public/assets/videos/c1/a.mp4`, pic("c1", 2), pic("c1", 3), pic("c1", 4), pic("c1", 5)] },
      { role: "assistant", text: "Hello", images: [pic("c1", 9)] },
      { role: "user", text: "", images: [pic("c1", 6)] },
    ] })!;
    expect(p.pictures[0]).toEqual([pic("c1", 1), pic("c1", 2), pic("c1", 3), pic("c1", 4)]);
    expect(p.pictures[1]).toEqual([]);
    expect(p.messages[2].content).toBe("What do you think of this?");
    expect(parseAssistantRequest({ messages: [{ role: "user", text: "" }] })).toBeNull();
  });

  it("sends the newest pictures as images and only the workspace's own", () => {
    const messages = [
      { role: "user" as const, content: "old one" },
      { role: "assistant" as const, content: "ok" },
      { role: "user" as const, content: "this one" },
    ];
    const out = withPictures(messages, [[pic("c1", 1)], [], [pic("c1", 2), pic("other", 3)]], "c1", 1);
    expect(out[0].content).toBe("old one\n(They attached 1 picture here earlier.)");
    const last = out[2].content as Array<{ type: string; source?: { url: string }; text?: string }>;
    expect(last.filter((b) => b.type === "image").map((b) => b.source!.url)).toEqual([pic("c1", 2)]);
    expect(last[last.length - 1].text).toContain(pic("c1", 2));
    expect(withPictures(messages, [[], [], []], "c1")).toEqual(messages);
  });
});
