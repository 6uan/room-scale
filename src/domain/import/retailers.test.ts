import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractProductFromHtml } from "./product-html";
import { readerFor, retailerNameFromHostname } from "./retailers";

const wayfair = readFileSync(
  "src/domain/import/fixtures/wayfair-allenside.html",
  "utf8",
);

describe("readerFor", () => {
  it("finds a shop by its hostname, or a subdomain of it", () => {
    expect(readerFor("www.wayfair.com")?.name).toBe("Wayfair");
    expect(readerFor("wayfair.com")?.name).toBe("Wayfair");
    expect(readerFor("WAYFAIR.COM")?.name).toBe("Wayfair");
  });

  it("has nothing for a shop it does not know, or a lookalike", () => {
    expect(readerFor("www.article.com")).toBeNull();
    expect(readerFor("notwayfair.com")).toBeNull();
  });
});

describe("Wayfair", () => {
  it("reads the price from the page's own state, not the amounts around it", () => {
    expect(readerFor("www.wayfair.com")?.read(wayfair)).toEqual({
      priceCents: { value: 20999, sourceText: "leadPrice: $209.99" },
    });
  });

  it("reads nothing when the state is not there, and leaves the parser to it", () => {
    expect(readerFor("www.wayfair.com")?.read("<html></html>")).toEqual({});
  });

  it("overrides the parser only for what it read", () => {
    const product = extractProductFromHtml(wayfair, "www.wayfair.com");
    expect(product.priceCents?.sourceText).toBe("leadPrice: $209.99");
    expect(product.name?.value).toBe('Allenside 26.37 " W 5 - Drawer Dresser');
    expect(product.widthMeters?.value).toBeCloseTo(26.37 * 0.0254, 6);
  });
});

describe("retailerNameFromHostname", () => {
  it("uses the reader's name where there is one", () => {
    expect(retailerNameFromHostname("www.wayfair.com")).toBe("Wayfair");
    expect(retailerNameFromHostname("www.ikea.com")).toBe("IKEA");
  });

  it("raises the hostname's own label otherwise", () => {
    expect(retailerNameFromHostname("www.article.com")).toBe("Article");
    expect(retailerNameFromHostname("shop.westelm.co.uk")).toBe("Westelm");
    expect(retailerNameFromHostname("target.com")).toBe("Target");
  });

  it("has nothing for an address with no label to raise", () => {
    expect(retailerNameFromHostname("localhost")).toBeNull();
  });
});
