import { describe, expect, it } from "vitest";
import { playbookFor } from "@/lib/sites/playbooks";
import { extractInspiration, inspirationBrief } from "@/lib/sites/inspiration";

describe("industry playbooks", () => {
  it("picks the playbook from the industry, then the description", () => {
    expect(playbookFor("Food & Beverage", null).id).toBe("food");
    expect(playbookFor(null, "A barbershop in Westlands").id).toBe("beauty");
    expect(playbookFor("Fashion", "we also sell coffee").id).toBe("fashion");
    expect(playbookFor("Real Estate", null).id).toBe("services");
    expect(playbookFor(null, "Safari tours from Nairobi").id).toBe("stay");
  });
  it("falls back to a general page and doesn't match words inside other words", () => {
    expect(playbookFor(null, null).id).toBe("general");
    expect(playbookFor(null, "a quiet suit tailor").id).not.toBe("services");
  });
});

describe("a site the owner likes", () => {
  const html = `<!doctype html><html><head><title>Sunset Grill | Nairobi</title>
    <meta name="theme-color" content="#111111">
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter&display=swap" rel="stylesheet">
    <style>body{background:#0E0E0E;color:#fff;font-family:"Inter",sans-serif} .cta{background:#E4572E}.x{color:#E4572E}</style></head>
    <body><nav><a href="/">Home</a><a href="/menu">Menu</a><a href="/book">Book a table</a></nav>
    <h1>Fire-grilled, every night</h1><img src="a.jpg"><h2>Our <em>menu</em></h2><p>Lots of words here about the food.</p>
    <h2>Find us</h2><script>var secret = "<h2>not a heading</h2>";</script></body></html>`;
  it("keeps the shape: headings in order, menu, colours, fonts, dark background", () => {
    const i = extractInspiration(html, "https://sunset.example");
    expect(i.outline).toEqual(["h1 Fire-grilled, every night", "h2 Our menu", "h2 Find us"]);
    expect(i.nav).toEqual(["Home", "Menu", "Book a table"]);
    expect(i.colors[0]).toBe("#111111");
    expect(i.colors).toContain("#E4572E");
    expect(i.fonts).toEqual(expect.arrayContaining(["Playfair Display", "Inter"]));
    expect(i.dark).toBe(true);
    expect(i.images).toBe(1);
  });
  it("tells the model to borrow structure only, never the words", () => {
    const brief = inspirationBrief(extractInspiration(html, "https://sunset.example"));
    expect(brief).toMatch(/STRUCTURE and FEEL only/);
    expect(brief).toMatch(/Never copy its words/);
    expect(brief).not.toMatch(/Lots of words here/);
  });
});
