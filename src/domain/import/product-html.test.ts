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
  it("reads the name and price off a schema.org Product", () => {
    expect(extractStructuredProduct(article)).toEqual({
      name: {
        value: 'Abisko 94.5" Velvet Right Sectional - Plush Yarrow Gold',
        sourceText: 'Abisko 94.5" Velvet Right Sectional - Plush Yarrow Gold',
      },
      priceCents: { value: 169900, sourceText: "price: 1699" },
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
