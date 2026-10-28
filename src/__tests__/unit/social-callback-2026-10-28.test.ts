import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * PostForMe's return link (2026-10-28 security check): it used to save a connection from whatever
 * client_id was in the link, with the admin key. Now it only sends people back to Settings, which
 * syncs for the signed-in person.
 */
describe("social accounts callback", () => {
  it("never writes: no database client in the route at all", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/api/social-accounts/callback/route.ts"), "utf8");
    expect(src).not.toMatch(/supabase|createClient|SERVICE_ROLE|upsert|insert\(/i);
  });

  it("sends people back to Settings with the outcome, whatever's in the link", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.blinkspot.io");
    const { GET } = await import("@/app/api/social-accounts/callback/route");
    const ok = await GET(new Request("https://www.blinkspot.io/api/social-accounts/callback?client_id=someone-else&platform=instagram&account_id=spc_attacker"));
    expect(ok.status).toBe(307);
    expect(ok.headers.get("location")).toBe("https://www.blinkspot.io/studio/account/settings?success=account_connected#socials");
    const bad = await GET(new Request("https://www.blinkspot.io/api/social-accounts/callback?success=false&error=access_denied"));
    expect(bad.headers.get("location")).toBe("https://www.blinkspot.io/studio/account/settings?error=access_denied#socials");
    vi.unstubAllEnvs();
  });
});
