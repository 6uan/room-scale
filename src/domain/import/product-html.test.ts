import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractProductFromHtml,
  extractStructuredProduct,
  htmlToText,
} from "./product-html";

const article = readFileSync(
  "src/domain/import/fixtures/article-abisko.html",
  "utf8",
);

describe("htmlToText", () => {
  it("drops scripts and styles, whose lengths are not measurements", () => {
    const text = htmlToText(article);
    expect(text).not.toContain("1378px");
    expect(text).not.toContain('"width":800');
  });

  it("keeps a spec table's label and value on their own lines", () => {
    expect(htmlToText(article)).toContain(
      'General Dimensions\n28"H x 94.5"W x 63.5"D',
    );
  });

  it("decodes entities, including numeric ones", () => {
    expect(htmlToText("<p>36&quot; &#215; 24&#x22;</p>")).toBe('36" × 24"');
  });
});

describe("extractStructuredProduct", () => {
  it("reads the name, price, and sizes off a schema.org Product", () => {
    expect(extractStructuredProduct(article)).toEqual({
      name: {
        value: 'Abisko 94.5" Velvet Right Sectional - Plush Yarrow Gold',
        sourceText: 'Abisko 94.5" Velvet Right Sectional - Plush Yarrow Gold',
      },
      priceCents: { value: 169900, sourceText: "price: 1699" },
      widthMeters: { value: 2.4003, sourceText: "width: 94.5 in" },
      depthMeters: { value: 1.6129, sourceText: "depth: 63.5 in" },
      heightMeters: {
        value: expect.closeTo(0.7112, 9) as number,
        sourceText: "height: 28 in",
      },
    });
  });

  it("finds a product inside an @graph, and skips what is not one", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"Shop"},{"@type":["Product","Thing"],"name":"Stool","offers":[{"price":"49.99"}]}]}</script>`;
    expect(extractStructuredProduct(html)).toEqual({
      name: { value: "Stool", sourceText: "Stool" },
      priceCents: { value: 4999, sourceText: "price: 49.99" },
    });
  });

  it("is simply absent when the block does not parse", () => {
    expect(
      extractStructuredProduct(`<script type="application/ld+json">{</script>`),
    ).toEqual({});
  });
});

describe("extractProductFromHtml", () => {
  it("reads an Article sectional's name, price, and dimensions", () => {
    const product = extractProductFromHtml(article);
    expect(product.name?.value).toBe(
      'Abisko 94.5" Velvet Right Sectional - Plush Yarrow Gold',
    );
    expect(product.priceCents?.value).toBe(169900);
    expect(product.widthMeters?.value).toBeCloseTo(94.5 * 0.0254, 6);
    expect(product.depthMeters?.value).toBeCloseTo(63.5 * 0.0254, 6);
    expect(product.heightMeters?.value).toBeCloseTo(28 * 0.0254, 6);
    expect(product.dimensionOrderIsAssumed).toBe(false);
  });

  it("reads nothing from a JavaScript shell, rather than guessing", () => {
    const shell = `<html><head><title></title><script>var w=120,h=80;</script></head><body><div id="root"></div></body></html>`;
    expect(extractProductFromHtml(shell)).toEqual({
      dimensionOrderIsAssumed: false,
    });
  });
});

describe("a Wayfair dresser, which has no structured data", () => {
  const wayfair = readFileSync(
    "src/domain/import/fixtures/wayfair-allenside.html",
    "utf8",
  );
  const product = extractProductFromHtml(wayfair);

  it("names it from the heading, not the browser title", () => {
    expect(product.name?.value).toBe('Allenside 26.37 " W 5 - Drawer Dresser');
  });

  it("without its reader, takes the first price on a line of its own and says what it was under", () => {
    // Wrong — it is the set's price — and visibly so, which is the point of
    // the context. The reader in `retailers.ts` is what gets it right.
    expect(product.priceCents).toEqual({
      value: 52000,
      sourceText: "$520.00",
      context: "Allenside 4 Pieces Bedroom Set",
    });
  });

  it("reads the overall size, not the drawer's interior", () => {
    expect(product.widthMeters?.value).toBeCloseTo(26.37 * 0.0254, 6);
    expect(product.depthMeters?.value).toBeCloseTo(15.43 * 0.0254, 6);
    expect(product.heightMeters?.value).toBeCloseTo(38.46 * 0.0254, 6);
    expect(product.dimensionOrderIsAssumed).toBe(false);
  });
});

describe("an IKEA bench, whose Product block states its sizes", () => {
  const ikea = readFileSync(
    "src/domain/import/fixtures/ikea-besta.html",
    "utf8",
  );
  const product = extractProductFromHtml(ikea, "www.ikea.com");

  it("takes the product's sizes from the block, not the package's from the prose", () => {
    expect(product.widthMeters).toEqual({
      value: expect.closeTo(94.5 * 0.0254, 6) as number,
      sourceText: 'width: 94 1/2 "',
    });
    expect(product.depthMeters?.value).toBeCloseTo(16.5 * 0.0254, 6);
    expect(product.heightMeters?.value).toBeCloseTo(29.875 * 0.0254, 6);
    expect(product.dimensionOrderIsAssumed).toBe(false);
  });

  it("names it and takes the regular price, not the member price", () => {
    expect(product.name?.value).toMatch(/^BESTÅ TV bench with doors/);
    expect(product.priceCents).toEqual({
      value: 74500,
      sourceText: "price: 745",
    });
  });
});

describe("a Product block with QuantitativeValue sizes", () => {
  it("reads the value and its unit code", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Stool","width":{"@type":"QuantitativeValue","value":40,"unitCode":"CMT"},"height":{"@type":"QuantitativeValue","value":"18","unitCode":"INH"}}</script>`;
    const product = extractProductFromHtml(html);
    expect(product.widthMeters?.value).toBeCloseTo(0.4, 9);
    expect(product.heightMeters?.value).toBeCloseTo(18 * 0.0254, 6);
    expect(product.widthMeters?.sourceText).toBe("width: 40 cm");
  });
});
