import { describe, expect, it } from "vitest";
import { extractSite, instagramHandle, normaliseWebsite, verifiedContact } from "@/lib/brand-autofill";

const HTML = `<!doctype html><html><head><title>Mavuno Juice | Cold-pressed in Nairobi</title>
<meta name="description" content="Fresh juice pressed every morning &amp; delivered.">
<meta name="theme-color" content="#1f4d3a"><link rel="apple-touch-icon" href="/icon-180.png">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Mavuno","telephone":"+254 712 345 678","address":{"addressLocality":"Nairobi","addressCountry":"KE"},"logo":"https://cdn.mavuno.test/logo.png","sameAs":["https://instagram.com/mavuno"]}</script>
<style>.x{color:red}</style></head><body><img src="/img/logo-dark.png" alt="Mavuno logo">
<a href="https://wa.me/254712345678">WhatsApp</a><a href="mailto:hello@mavuno.test">Email</a><a href="/about">About</a>
<h1>Pressed this morning</h1><p>Mango Passion KES 350. Call 0712 345 678.</p><script>alert(1)</script></body></html>`;

describe("brand auto-fill: reading a website", () => {
  it("pulls title, description, structured data, contacts, logo candidates and the next page", () => {
    const f = extractSite(HTML, "https://mavuno.test/");
    expect(f.title).toBe("Mavuno Juice | Cold-pressed in Nairobi");
    expect(f.description).toBe("Fresh juice pressed every morning & delivered.");
    expect(f.themeColor).toBe("#1F4D3A");
    expect(f.jsonld).toMatchObject({ name: "Mavuno", telephone: "+254 712 345 678", address: "Nairobi, KE" });
    expect(f.whatsapp).toEqual(["254712345678"]);
    expect(f.emails).toContain("hello@mavuno.test");
    expect(f.socials).toContain("https://instagram.com/mavuno");
    expect(f.logoCandidates[0]).toBe("https://cdn.mavuno.test/logo.png");
    expect(f.logoCandidates).toContain("https://mavuno.test/img/logo-dark.png");
    expect(f.moreLinks).toEqual(["https://mavuno.test/about"]);
    expect(f.text).toContain("Mango Passion KES 350");
    expect(f.text).not.toContain("alert(1)");
    expect(f.text).not.toContain("color:red");
  });

  it("keeps a contact only if it really appears on the site", () => {
    const seen = ["+254 712 345 678", "0712 345 678"];
    expect(verifiedContact("+254712345678", seen, "phone")).toBe("+254712345678");
    expect(verifiedContact("+254 799 999 999", seen, "phone")).toBeUndefined();
    expect(verifiedContact("hello@mavuno.test", ["hello@mavuno.test"], "email")).toBe("hello@mavuno.test");
    expect(verifiedContact("sales@mavuno.test", ["hello@mavuno.test"], "email")).toBeUndefined();
  });

  it("cleans the addresses people type", () => {
    expect(normaliseWebsite("mavuno.co.ke")).toBe("https://mavuno.co.ke/");
    expect(normaliseWebsite("localhost")).toBeNull();
    expect(instagramHandle("@mavuno.ke")).toBe("mavuno.ke");
    expect(instagramHandle("https://www.instagram.com/mavuno_ke/?hl=en")).toBe("mavuno_ke");
    expect(instagramHandle("not a handle!")).toBeNull();
  });
});
