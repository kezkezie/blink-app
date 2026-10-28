import { describe, expect, it } from "vitest";
import { cloudinaryFile, cloudinaryFiles, confirmsDeletion } from "@/lib/account-delete";

/** Delete my account (2026-10-28): the confirmation, and finding the Cloudinary copies to remove. */
describe("delete my account", () => {
  it("needs the sign-in email typed, nothing else", () => {
    expect(confirmsDeletion(" Kezie@Example.com ", "kezie@example.com")).toBe(true);
    expect(confirmsDeletion("DELETE", "kezie@example.com")).toBe(false);
    expect(confirmsDeletion("", "kezie@example.com")).toBe(false);
    expect(confirmsDeletion("kezie@example.com", null)).toBe(false);
  });

  it("reads the Cloudinary file behind a link, with or without steps and a version", () => {
    expect(cloudinaryFile("https://res.cloudinary.com/dap8jijxa/video/upload/v1729000000/blink/videos/abc123.mp4")).toEqual({ cloud: "dap8jijxa", type: "video", id: "blink/videos/abc123" });
    expect(cloudinaryFile("https://res.cloudinary.com/dap8jijxa/image/upload/c_limit,w_640,q_auto,f_auto/v17/blink/x.png?x=1")).toEqual({ cloud: "dap8jijxa", type: "image", id: "blink/x" });
    expect(cloudinaryFile("https://res.cloudinary.com/dap8jijxa/image/upload/c_limit,w_640/blink/poster.jpg")).toEqual({ cloud: "dap8jijxa", type: "image", id: "blink/poster" });
    expect(cloudinaryFile("https://res.cloudinary.com/dap8jijxa/image/upload/plain_name.webp")).toEqual({ cloud: "dap8jijxa", type: "image", id: "plain_name" });
    expect(cloudinaryFile("https://hzkufspjozkgmloznkvp.supabase.co/storage/v1/object/public/assets/images/a.png")).toBeNull();
    expect(cloudinaryFile(null)).toBeNull();
  });

  it("collects every Cloudinary file once, from arrays, JSON strings and single links", () => {
    const v = "https://res.cloudinary.com/c1/video/upload/v1/a/clip.mp4";
    const files = cloudinaryFiles([[v, "https://example.com/x.png"], JSON.stringify([v, "https://res.cloudinary.com/c1/image/upload/v2/a/pic.jpg"]), "https://res.cloudinary.com/c1/image/upload/v2/a/pic.jpg", null]);
    expect(files.map((f) => `${f.type}:${f.id}`)).toEqual(["video:a/clip", "image:a/pic"]);
  });
});
