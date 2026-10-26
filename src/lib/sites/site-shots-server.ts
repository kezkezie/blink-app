import { validatePublicUrl } from "@/lib/safe-fetch";
import { supabaseAdmin } from "@/lib/supabase-server";

/**
 * Screenshots of the websites the owner likes (Kezie, 2026-10-27: "see if it can make the exact
 * website but with the brand colors and content"). Tested on on.com: from its outline alone the page
 * was only inspired by it; from three screenshots it rebuilt the layout (hero, cards, stacked list) in
 * the brand. So each site is opened in a headless Chrome (@sparticuz/chromium on Vercel, the Mac's
 * Chrome locally) and its first three screens are kept in the owner's storage; the page writer sees
 * them like designs the owner uploaded. Every request the browser makes is checked like our server
 * fetches (public addresses only); cookie banners are hidden, never clicked.
 */
const VIEW = { width: 1440, height: 900 };
const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
export const SHOTS_PER_SITE = 3;
const SITE_MS = 45_000;
const HIDE = `#onetrust-banner-sdk,#onetrust-consent-sdk,#CybotCookiebotDialog,#usercentrics-root,.cc-window,.cookie-banner,[class*="cookie-banner" i],[id*="cookie-banner" i],[class*="CookieBanner"],[aria-label*="cookie" i][role="dialog"],[aria-label*="consent" i][role="dialog"]{display:none!important}`;

async function launch() {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    chromium.setGraphicsMode = false;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true, defaultViewport: VIEW });
  }
  return puppeteer.launch({ executablePath: process.env.CHROME_PATH || MAC_CHROME, headless: true, defaultViewport: VIEW });
}

type Browser = Awaited<ReturnType<typeof launch>>;

async function shootOne(browser: Browser, site: { url: string; host: string }, clientId: string): Promise<string[]> {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(UA);
    // Public addresses only, for the page and everything it loads.
    const allowed = new Map<string, Promise<boolean>>();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = req.url();
      if (u.startsWith("data:") || u.startsWith("blob:")) { void req.continue().catch(() => {}); return; }
      let host = "";
      try { host = new URL(u).host; } catch { void req.abort().catch(() => {}); return; }
      if (!allowed.has(host)) allowed.set(host, validatePublicUrl(u).then((r) => r.ok, () => false));
      void allowed.get(host)!.then((ok) => (ok ? req.continue() : req.abort())).catch(() => {});
    });
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 8_000 }).catch(() => {});
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
    const height = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => VIEW.height);
    const urls: string[] = [];
    for (let n = 0; n < SHOTS_PER_SITE && n * VIEW.height < height; n++) {
      await page.evaluate((y) => window.scrollTo(0, y), n * VIEW.height);
      await new Promise((r) => setTimeout(r, 1200));
      const shot = await page.screenshot({ type: "jpeg", quality: 78 });
      const path = `images/${clientId}/site_like_${site.host.replace(/[^a-z0-9.-]/g, "")}_${Date.now()}_${n}.jpg`;
      const { error } = await supabaseAdmin.storage.from("assets").upload(path, Buffer.from(shot), { contentType: "image/jpeg", upsert: true });
      if (error) break;
      urls.push(supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl);
    }
    return urls;
  } finally {
    await page.close().catch(() => {});
  }
}

/** The first screens of each site, as public URLs in the owner's storage; a site that fails gets none. */
export async function shootSites(sites: Array<{ url: string; host: string }>, clientId: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!sites.length) return out;
  let browser: Browser | null = null;
  try {
    browser = await launch();
    for (let i = 0; i < sites.length; i += 2) {
      await Promise.all(sites.slice(i, i + 2).map(async (site) => {
        const urls = await Promise.race([
          shootOne(browser!, site, clientId),
          new Promise<string[]>((r) => setTimeout(() => r([]), SITE_MS)),
        ]).catch((e) => { console.warn("site shot failed", site.host, e instanceof Error ? e.message : e); return [] as string[]; });
        out.set(site.host, urls);
      }));
    }
  } catch (e) {
    console.warn("site shots unavailable", e instanceof Error ? e.message : e);
  } finally {
    await browser?.close().catch(() => {});
  }
  return out;
}

/** Shots no longer on any kept site leave storage. */
export async function dropShots(urls: string[]) {
  const paths = urls.map((u) => u.split("/object/public/assets/")[1]).filter((p): p is string => !!p && /^images\/[^/]+\/site_like_/.test(p));
  if (paths.length) await supabaseAdmin.storage.from("assets").remove(paths).catch(() => {});
}
