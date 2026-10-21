import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Connect your AI, stages 2-3 (Kezie, 2026-10-21: "the MCP should do everything"). LIVE on a
 * throwaway account: keys made in Settings with "Can make things" and "Can post", used by the
 * official MCP client to make a draft image (1 credit) and a draft video from it, check the jobs,
 * write the captions and try to post (no accounts connected, so it's refused cleanly). Spending is
 * refused without the permission, over max_credits and over the key's budget, and an idempotency
 * key never makes or charges twice. Deleted after.
 *   PLAYWRIGHT_BASE_URL=https://www.blinkspot.io npx playwright test mcp-make --workers=1
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(studio|welcome)/, { timeout: 120_000 });
}
async function mcp(token: string) {
  const client = new Client({ name: "blinkspot-e2e", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}
type Out = { content: Array<{ text: string }>; isError?: boolean };
const call = async (c: Client, name: string, args: Record<string, unknown>) => {
  const r = (await c.callTool({ name, arguments: args })) as Out;
  return { text: r.content[0]?.text ?? "", error: !!r.isError, json: (() => { try { return JSON.parse(r.content[0]?.text ?? ""); } catch { return null; } })() };
};

test("an AI connection makes an image and a video, captions it and is refused posting without accounts", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service key");
  test.setTimeout(600_000);
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stamp = Date.now();
  const email = `e2e-mcpmake-${stamp}@blinkspot-test.dev`;
  const password = `Mm-${Math.random().toString(36).slice(2)}-${stamp}`;
  const { data: u } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "MCP Maker", onboarding_completed: true } });
  let clientId: string | undefined;
  try {
    const { data: c } = await sb.from("clients").insert({ user_id: u.user!.id, company_name: "MCP Maker", contact_name: "MCP Maker", contact_email: email, plan_tier: "starter", onboarding_status: "active" }).select("id").single();
    clientId = c!.id as string;
    await sb.from("credit_balances").upsert({ client_id: clientId, balance: 300 }, { onConflict: "client_id" });
    const { data: b } = await sb.from("brand_profiles").insert({ client_id: clientId, brand_name: "Kasi Kicks", industry: "Fashion", description: "Streetwear sneakers made in Nairobi.", is_active: true, primary_color: "#E4572E", secondary_color: "#111111" }).select("id").single();
    const brandId = b!.id as string;
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email, password);

    // Settings: a key that can make and post; the key panel stays inside the card.
    await page.goto(`${BASE}/studio/account/settings`);
    const section = page.getByRole("region", { name: "AI connections" });
    await section.getByRole("button", { name: "New connection" }).click();
    await section.getByLabel("Connection name").fill("Maker");
    await section.getByLabel("Can post").check();
    await expect(section.getByLabel("Can make things")).toBeChecked();
    await section.getByRole("button", { name: /Create key/ }).click();
    const keyText = section.getByLabel("Key", { exact: true });
    await expect(keyText).toHaveText(/^bsk_/, { timeout: 20_000 });
    const token = (await keyText.textContent())!.trim();
    const card = (await section.boundingBox())!, panel = (await section.getByRole("region", { name: "New key" }).boundingBox())!;
    expect(panel.x + panel.width).toBeLessThanOrEqual(card.x + card.width + 1);
    await page.screenshot({ path: "test-results/mcp-make-settings.png" });

    const client = await mcp(token);
    const names = ((await client.listTools()).tools).map((t) => t.name);
    for (const n of ["create_image", "create_video", "get_job", "make_carousel", "write_caption", "schedule_post", "unschedule_post", "motion_link"]) expect(names).toContain(n);

    // Over max_credits: refused before anything is made.
    const tooMuch = await call(client, "create_image", { brand_id: brandId, brief: "A sneaker on a Nairobi rooftop at dusk", max_credits: 5 });
    expect(tooMuch.error).toBe(true);
    expect(tooMuch.text).toMatch(/more than max_credits/);

    // A draft image (1 credit), twice with the same idempotency key: made and charged once.
    const args = { brand_id: brandId, brief: "A red sneaker on a Nairobi rooftop at dusk, product hero shot", words: "Drop 01", quality: "draft", aspect: "4:5", max_credits: 5, idempotency_key: `img-${stamp}` };
    const first = await call(client, "create_image", args);
    expect(first.error, first.text).toBe(false);
    const ids = first.json.post_ids as string[];
    expect(ids).toHaveLength(1);
    const again = await call(client, "create_image", args);
    expect(again.json).toMatchObject({ post_ids: ids, replayed: true });
    let image: { state: string; url: string | null } | undefined;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(5000);
      image = (await call(client, "get_job", { post_ids: ids })).json?.[0];
      if (image && image.state !== "making") break;
    }
    expect(image?.state, JSON.stringify(image)).toBe("done");
    console.log(`image: ${image!.url}`);
    const { count } = await sb.from("content").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("content_type", "post_image");
    expect(count).toBe(1);

    // Captions, then posting: no accounts connected, so it's refused with the reason.
    const cap = await call(client, "write_caption", { brand_id: brandId, post_id: ids[0], caption: "Drop 01 lands Friday.\n\nMade in Nairobi, 200 pairs only.", caption_short: "Drop 01 lands Friday. 200 pairs only.", caption_choice: "short", approve: true });
    expect(cap.error, cap.text).toBe(false);
    const row = (await sb.from("content").select("caption_written, caption_choice, status").eq("id", ids[0]).single()).data!;
    expect(row).toMatchObject({ caption_written: true, caption_choice: "short", status: "approved" });
    const post = await call(client, "schedule_post", { brand_id: brandId, post_id: ids[0], when: "now" });
    expect(post.error).toBe(true);
    expect(post.text).toMatch(/no connected social accounts/);

    // A draft video from that picture: charged only when it arrives.
    const quote = await call(client, "get_quote", { kind: "video", quality: "draft", seconds: 5 });
    console.log(`video quote: ${quote.text}`);
    const vid = await call(client, "create_video", { brand_id: brandId, brief: "The sneaker turns slowly as dusk light sweeps across it", seconds: 5, quality: "draft", aspect: "9:16", start_image_post_id: ids[0], max_credits: 200, idempotency_key: `vid-${stamp}` });
    expect(vid.error, vid.text).toBe(false);
    const vids = vid.json.post_ids as string[];
    const before = (await sb.from("credit_balances").select("balance").eq("client_id", clientId).single()).data!.balance as number;
    let video: { state: string; url: string | null; message: string | null } | undefined;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(7000);
      video = (await call(client, "get_job", { post_ids: vids })).json?.[0];
      if (video && video.state !== "making") break;
    }
    expect(video?.state, JSON.stringify(video)).toBe("done");
    console.log(`video: ${video!.url}`);
    const after = (await sb.from("credit_balances").select("balance").eq("client_id", clientId).single()).data!.balance as number;
    console.log(`video charged ${before - after} credits on delivery`);
    expect(before - after).toBeGreaterThan(0);

    // A read-only key can't spend; a 1-credit budget can't fit an 18-credit image.
    await sb.from("api_keys").update({ permissions: ["read"] }).eq("client_id", clientId);
    const ro = await call(client, "create_image", { brand_id: brandId, brief: "Another sneaker shot on the rooftop" });
    expect(ro.text).toMatch(/can't make things/);
    await sb.from("api_keys").update({ permissions: ["read", "spend"], monthly_credit_budget: 1 }).eq("client_id", clientId);
    const over = await call(client, "create_image", { brand_id: brandId, brief: "Another sneaker shot on the rooftop", quality: "best" });
    expect(over.text).toMatch(/budget is 1 credits a month/);
    await client.close();
  } finally {
    if (clientId) {
      await sb.from("mcp_activity").delete().eq("client_id", clientId);
      await sb.from("api_keys").delete().eq("client_id", clientId);
      await sb.from("content").delete().eq("client_id", clientId);
      await sb.from("brand_profiles").delete().eq("client_id", clientId);
      await sb.from("credit_transactions").delete().eq("client_id", clientId);
      await sb.from("credit_balances").delete().eq("client_id", clientId);
      await sb.from("clients").delete().eq("id", clientId);
    }
    await sb.auth.admin.deleteUser(u.user!.id);
  }
});
