import { describe, expect, it } from "vitest";
import { accountsForBrand, brandTag } from "@/lib/social-brand";

/** Social accounts belong to one brand (2026-10-20). */
describe("which connected accounts belong to a brand", () => {
  const all = [
    { id: "ig-a", external_id: brandTag("c1", "brandA"), platform: "instagram" },
    { id: "tt-b", external_id: brandTag("c1", "brandB"), platform: "tiktok" },
    { id: "fb-old", external_id: "c1", platform: "facebook" },
    { id: "x-gone", external_id: brandTag("c1", "brandA"), platform: "x", status: "disconnected" },
    { id: "other", external_id: brandTag("c2", "brandA"), platform: "instagram" },
  ];
  it("gives each brand only its own connections", () => {
    expect(accountsForBrand(all, { clientId: "c1", brandId: "brandA", knownIds: [], onlyBrand: false }).map((a) => a.id)).toEqual(["ig-a"]);
    expect(accountsForBrand(all, { clientId: "c1", brandId: "brandB", knownIds: [], onlyBrand: false }).map((a) => a.id)).toEqual(["tt-b"]);
  });
  it("keeps an older connection where it already is, or on a one-brand account", () => {
    expect(accountsForBrand(all, { clientId: "c1", brandId: "brandA", knownIds: ["fb-old"], onlyBrand: false }).map((a) => a.id)).toEqual(["ig-a", "fb-old"]);
    expect(accountsForBrand(all, { clientId: "c1", brandId: "brandB", knownIds: [], onlyBrand: false }).map((a) => a.id)).not.toContain("fb-old");
    expect(accountsForBrand(all, { clientId: "c1", brandId: "brandA", knownIds: [], onlyBrand: true }).map((a) => a.id)).toEqual(["ig-a", "fb-old"]);
  });
});
