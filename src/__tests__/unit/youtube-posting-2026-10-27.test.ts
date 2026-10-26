import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAiVideo, platformsFor, postMedia, postResults, resultLine, skippedLine, statusFromResults, youtubeTitle } from "@/lib/social-media-rules";

/**
 * YouTube posting (Kezie, 2026-10-27: "we're having an issue with YouTube. We can't be able to post
 * it... and also the calendar planner for scheduling"). PostForMe said "Only videos are supported for
 * YouTube posts": pictures were sent to YouTube, a video post sent its cover picture, and the failure
 * never reached the post (the webhook read the wrong field and checked no secret).
 */

// A small stand-in for the Supabase client: filters by eq, applies updates when awaited.
type Row = Record<string, unknown>;
const db: { content: Row[]; social_accounts: Row[] } = { content: [], social_accounts: [] };
function query(table: keyof typeof db) {
  const filters: Array<[string, unknown]> = [];
  let patch: Row | null = null;
  const rows = () => db[table].filter((r) => filters.every(([k, v]) => r[k] === v));
  const q: Record<string, unknown> = {
    select: () => q, eq: (k: string, v: unknown) => { filters.push([k, v]); return q; }, limit: () => q,
    update: (p: Row) => { patch = p; return q; },
    single: async () => ({ data: rows()[0] ?? null, error: rows()[0] ? null : { message: "none" } }),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      if (patch) { for (const r of rows()) Object.assign(r, patch); return Promise.resolve({ data: null, error: null }).then(res, rej); }
      return Promise.resolve({ data: rows(), error: null }).then(res, rej);
    },
  };
  return q;
}
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: (t: keyof typeof db) => query(t) }) }));
vi.mock("@/lib/image-refs", () => ({ jpegForPosting: async (_c: string, u: string) => u }));

const VIDEO = "https://x.supabase.co/storage/v1/object/public/assets/videos/c/clip.mp4";
const COVER = "https://x.supabase.co/storage/v1/object/public/assets/images/c/cover.jpg";
const PIC = "https://x.supabase.co/storage/v1/object/public/assets/images/c/poster.jpg";
const post = (over: Row = {}): Row => ({
  id: "post-1", client_id: "c1", brand_id: "b1", caption: "Meet Runner 01\nBuilt for the streets. #kasikicks", caption_short: "", caption_written: true, caption_choice: "long", hashtags: "",
  image_urls: [PIC], video_urls: [], ai_model: "nano-banana-2", target_platforms: { youtube: { enabled: true, format: "standard" }, instagram: { enabled: true, format: "feed" } },
  postforme_tracking_id: null, status: "approved", creation_metadata: {}, ...over,
});

describe("what each network accepts", () => {
  it("sends a post's video, never its cover picture, and pictures only when there's no video", () => {
    expect(postMedia({ image_urls: [COVER], video_urls: [VIDEO] })).toEqual({ kind: "video", urls: [VIDEO] });
    expect(postMedia({ image_urls: [PIC], video_urls: [] })).toEqual({ kind: "image", urls: [PIC] });
    expect(postMedia({ image_urls: JSON.stringify([PIC]), video_urls: null })).toEqual({ kind: "image", urls: [PIC] });
  });
  it("keeps YouTube for videos only, and says why", () => {
    expect(platformsFor(["instagram", "youtube"], "image")).toEqual({ send: ["instagram"], skipped: ["youtube"] });
    expect(platformsFor(["instagram", "youtube"], "video")).toEqual({ send: ["instagram", "youtube"], skipped: [] });
    expect(skippedLine(["youtube"], () => "YouTube")).toBe("YouTube was skipped: it only takes videos, and this post is a picture.");
  });
  it("makes a YouTube title from the caption: first line, no hashtags or brackets, at most 100 characters", () => {
    expect(youtubeTitle("Meet Runner 01 #kasi\nmore")).toBe("Meet Runner 01");
    expect(youtubeTitle("#only #tags\n<b>Drop</b> Friday")).toBe("bDrop/b Friday");
    const long = youtubeTitle("word ".repeat(40));
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith("word")).toBe(true);
    expect(youtubeTitle("")).toBe("New video");
  });
  it("labels realistic AI video for YouTube, not motion graphics, editor exports or uploads", () => {
    for (const m of ["kling-3.0/video", "bytedance/seedance-2", "prunaai/p-video", "gemini-omni-video", "auto"]) expect(isAiVideo(m), m).toBe(true);
    for (const m of ["remotion", "blink-wasm-editor", null, "screenshot"]) expect(isAiVideo(m), String(m)).toBe(false);
  });
  it("reads results: posted if any network took it, failed only when every one refused", () => {
    const fail = { platform: "youtube", ok: false, error: "Failed to post to Youtube: Only videos are supported for YouTube posts", at: "2026-10-27T10:00:00Z" };
    expect(resultLine(fail, () => "YouTube")).toBe("YouTube didn't post: Only videos are supported for YouTube posts");
    expect(statusFromResults([fail], 2)).toBeNull();
    expect(statusFromResults([fail, { ...fail, platform: "instagram" }], 2)).toBe("failed");
    expect(statusFromResults([fail, { platform: "instagram", ok: true, at: "x" }], 2)).toBe("posted");
    expect(postResults({ creation_metadata: { post_sent: { id: "sp_old" }, post_results: { a: fail } }, postforme_tracking_id: "sp_new" })).toEqual([]);
  });
});

describe("sending a post to PostForMe", () => {
  const sent: Array<Record<string, unknown>> = [];
  beforeEach(() => {
    vi.stubEnv("POSTFORME_API_KEY", "pfm_test");
    sent.length = 0;
    db.social_accounts = [
      { client_id: "c1", brand_id: "b1", platform: "youtube", postforme_account_id: "spc_yt", is_active: true },
      { client_id: "c1", brand_id: "b1", platform: "instagram", postforme_account_id: "spc_ig", is_active: true },
    ];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ id: "sp_new" }), { status: 201 }); }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("a picture goes to Instagram and skips YouTube, saying so", async () => {
    db.content = [post()];
    const { sendPost } = await import("@/lib/social-post-server");
    const r = await sendPost("c1", { contentId: "post-1" });
    expect(r.status).toBe(200);
    expect(r.body.note).toMatch(/YouTube was skipped: it only takes videos/);
    expect(sent[0].social_accounts).toEqual(["spc_ig"]);
    expect(sent[0]).not.toHaveProperty("platform_configurations");
    expect((db.content[0].creation_metadata as Row).post_sent).toMatchObject({ id: "sp_new", platforms: ["instagram"], accounts: 1, skipped: ["youtube"] });
  });

  it("a picture for YouTube alone isn't sent at all, with a clear reason", async () => {
    db.content = [post({ target_platforms: { youtube: { enabled: true, format: "standard" } } })];
    const { sendPost } = await import("@/lib/social-post-server");
    const r = await sendPost("c1", { contentId: "post-1" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "needs_video" });
    expect(String(r.body.error)).toMatch(/YouTube only takes videos/);
    expect(sent).toHaveLength(0);
  });

  it("a video goes to YouTube as the video, with a title and the AI label", async () => {
    db.content = [post({ image_urls: [COVER], video_urls: [VIDEO], ai_model: "kling-3.0/video" })];
    const { sendPost } = await import("@/lib/social-post-server");
    const r = await sendPost("c1", { contentId: "post-1" });
    expect(r.status).toBe(200);
    expect(sent[0].media).toEqual([{ url: VIDEO }]);
    expect(sent[0].social_accounts).toEqual(["spc_yt", "spc_ig"]);
    expect(sent[0].external_id).toBe("post-1");
    expect(sent[0].platform_configurations).toEqual({ youtube: { title: "Meet Runner 01", privacy_status: "public", made_for_kids: false, contains_synthetic_media: true } });
  });
});

describe("PostForMe's webhook", () => {
  const call = (body: unknown, secret?: string) => new Request("https://www.blinkspot.io/api/webhooks/postforme", { method: "POST", headers: { "Content-Type": "application/json", ...(secret ? { "Post-For-Me-Webhook-Secret": secret } : {}) }, body: JSON.stringify(body) });
  beforeEach(() => {
    vi.stubEnv("POSTFORME_WEBHOOK_SECRET", "whsec_test");
    db.social_accounts = [{ platform: "youtube", postforme_account_id: "spc_yt" }, { platform: "instagram", postforme_account_id: "spc_ig" }];
    db.content = [post({ status: "posted", postforme_tracking_id: "sp_new", creation_metadata: { post_sent: { id: "sp_new", platforms: ["youtube", "instagram"], accounts: 2 }, post_results: {} } })];
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses anyone without the secret", async () => {
    const { POST } = await import("@/app/api/webhooks/postforme/route");
    expect((await POST(call({ event_type: "social.post.result.created", data: {} }))).status).toBe(401);
    expect((await POST(call({ event_type: "social.post.result.created", data: {} }, "wrong")))).toHaveProperty("status", 401);
  });

  it("records each network's answer, and marks the post failed only when all refused", async () => {
    const { POST } = await import("@/app/api/webhooks/postforme/route");
    const yt = { event_type: "social.post.result.created", data: { post_id: "sp_new", social_account_id: "spc_yt", success: false, error: "Failed to post to Youtube: Only videos are supported for YouTube posts" } };
    expect((await POST(call(yt, "whsec_test"))).status).toBe(200);
    const meta = () => db.content[0].creation_metadata as { post_results: Record<string, { platform: string; ok: boolean; error?: string }> };
    expect(meta().post_results.spc_yt).toMatchObject({ platform: "youtube", ok: false, error: "Failed to post to Youtube: Only videos are supported for YouTube posts" });
    expect(db.content[0].status).toBe("posted"); // Instagram hasn't answered yet
    await POST(call({ event_type: "social.post.result.created", data: { post_id: "sp_new", social_account_id: "spc_ig", success: false, error: "User access is restricted" } }, "whsec_test"));
    expect(db.content[0].status).toBe("failed");
    expect(Object.keys(meta().post_results).sort()).toEqual(["spc_ig", "spc_yt"]);
  });

  it("ignores account events (the studio's sync links accounts to brands)", async () => {
    const { POST } = await import("@/app/api/webhooks/postforme/route");
    const before = JSON.stringify(db);
    expect((await POST(call({ event_type: "social.account.created", data: { id: "spc_x", platform: "youtube", external_id: "c1:b1" } }, "whsec_test"))).status).toBe(200);
    expect(JSON.stringify(db)).toBe(before);
  });
});
