import { describe, expect, it } from "vitest";
import { centsFromDecimalString, metersFromInches } from "@/domain/units";
import {
  MAX_NAME_LENGTH,
  MAX_PRICE_CENTS,
  checkPrice,
  checkProduct,
  checkProductName,
  createProduct,
  hasProblems,
  isProductUrl,
  isValidProduct,
  withFootprint,
  type FurnitureProduct,
} from "./product";

/** The real sectional, as it would be copied off its product page. */
const SECTIONAL: FurnitureProduct = {
  id: "sectional",
  name: "L-shaped sectional",
  retailer: "Article",
  productUrl: "https://www.article.com/product/1234/sectional",
  priceCents: 199900,
  purchaseStatus: "considering",
  footprint: {
    widthMeters: metersFromInches(112),
    depthMeters: metersFromInches(65),
  },
  heightMeters: metersFromInches(34),
};

describe("product names", () => {
  it("requires a name", () => {
    expect(checkProductName("")).toBe("required");
    expect(checkProductName("   ")).toBe("required");
  });

  it("accepts an ordinary name", () => {
    expect(checkProductName("65-inch Hisense CanvasTV")).toBeNull();
  });

  it("measures length after trimming", () => {
    const atLimit = "a".repeat(MAX_NAME_LENGTH);

    expect(checkProductName(`  ${atLimit}  `)).toBeNull();
    expect(checkProductName(`${atLimit}a`)).toBe("too-long");
  });
});

describe("product prices", () => {
  it("accepts a price parsed from what a retailer prints", () => {
    const cents = centsFromDecimalString("$1,999.00");

    expect(cents).toBe(199900);
    expect(checkPrice(cents ?? -1)).toBeNull();
  });

  it("accepts free", () => {
    expect(checkPrice(0)).toBeNull();
  });

  it("rejects a fractional cent", () => {
    expect(checkPrice(1299.5)).toBe("not-whole-cents");
  });

  it("rejects a negative price", () => {
    expect(checkPrice(-100)).toBe("negative");
  });

  it("rejects a price past the typo guard", () => {
    expect(checkPrice(MAX_PRICE_CENTS)).toBeNull();
    expect(checkPrice(MAX_PRICE_CENTS + 1)).toBe("too-large");
  });
});

describe("product URLs", () => {
  it("allows no address at all", () => {
    expect(isProductUrl("")).toBe(true);
    expect(isProductUrl("   ")).toBe(true);
  });

  it("accepts http and https", () => {
    expect(isProductUrl("https://www.article.com/product/1234")).toBe(true);
    expect(isProductUrl("http://example.com")).toBe(true);
  });

  it("rejects an address a browser would not open", () => {
    expect(isProductUrl("www.article.com")).toBe(false);
    expect(isProductUrl("not a url")).toBe(false);
    expect(isProductUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("checkProduct", () => {
  it("reports nothing wrong with a complete product", () => {
    expect(checkProduct(SECTIONAL)).toEqual({});
    expect(hasProblems(checkProduct(SECTIONAL))).toBe(false);
    expect(isValidProduct(SECTIONAL)).toBe(true);
  });

  it("keys each problem to the field it belongs to", () => {
    const problems = checkProduct({
      ...SECTIONAL,
      name: "",
      productUrl: "article.com",
    });

    expect(problems).toEqual({
      name: "required",
      productUrl: "not-a-web-address",
    });
  });

  it("reports each dimension separately", () => {
    const flat = withFootprint(SECTIONAL, "depthMeters", 0);

    expect(checkProduct(flat)).toEqual({ depthMeters: "too-small" });
    expect(checkProduct({ ...SECTIONAL, heightMeters: 40 })).toEqual({
      heightMeters: "too-large",
    });
  });

  it("rejects a product measured in the wrong unit", () => {
    // 112 typed as centimeters is fine; 112 typed as meters is not a sofa.
    expect(isValidProduct(withFootprint(SECTIONAL, "widthMeters", 1.12))).toBe(
      true,
    );
    expect(isValidProduct(withFootprint(SECTIONAL, "widthMeters", 112))).toBe(
      false,
    );
  });
});

describe("createProduct", () => {
  it("opens on something valid apart from its missing name", () => {
    const blank = createProduct("p1");

    expect(checkProduct(blank)).toEqual({ name: "required" });
  });

  it("starts as something being considered rather than owned", () => {
    expect(createProduct("p1").purchaseStatus).toBe("considering");
  });
});

describe("withFootprint", () => {
  it("replaces one side without mutating the original", () => {
    const widened = withFootprint(SECTIONAL, "widthMeters", 3);

    expect(widened.footprint.widthMeters).toBe(3);
    expect(widened.footprint.depthMeters).toBe(SECTIONAL.footprint.depthMeters);
    expect(SECTIONAL.footprint.widthMeters).toBeCloseTo(2.8448, 10);
  });
});
