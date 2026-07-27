import { describe, expect, it } from "vitest";
import { inchesFromMeters, metersFromInches } from "@/domain/units";
import {
  extractDimensions,
  extractName,
  extractPrice,
  extractProduct,
} from "./product-text";

/** Inches, rounded, so failures read like the page rather than like meters. */
function inches(meters: number | undefined): number | undefined {
  return meters === undefined
    ? undefined
    : Math.round(inchesFromMeters(meters) * 100) / 100;
}

describe("dimensions with labelled axes", () => {
  it("reads the compact form retailers print on the page", () => {
    const found = extractDimensions(`70"W x 15.7"D x 20.5"H`);

    expect(inches(found.widthMeters?.value)).toBe(70);
    expect(inches(found.depthMeters?.value)).toBe(15.7);
    expect(inches(found.heightMeters?.value)).toBe(20.5);
    expect(found.dimensionOrderIsAssumed).toBe(false);
  });

  it("reads the spelled-out form with the axis in brackets", () => {
    const found = extractDimensions(
      "Dimensions (Overall): 20.5 Inches (H) x 70 Inches (W) x 15.75 Inches (D)",
    );

    expect(inches(found.widthMeters?.value)).toBe(70);
    expect(inches(found.depthMeters?.value)).toBe(15.75);
    expect(inches(found.heightMeters?.value)).toBe(20.5);
    expect(found.dimensionOrderIsAssumed).toBe(false);
  });

  it("reads a labelled list across separate lines", () => {
    const found = extractDimensions(
      [
        "Overall Width - Side to Side: 112 inches",
        "Overall Depth: 65 in.",
      ].join("\n"),
    );

    expect(inches(found.widthMeters?.value)).toBe(112);
    expect(inches(found.depthMeters?.value)).toBe(65);
    expect(found.heightMeters).toBeUndefined();
  });

  it("keeps the first statement when a shipping table repeats it later", () => {
    const found = extractDimensions(
      ["Width: 70 inches", "Shipping box width: 74 inches"].join("\n"),
    );

    expect(inches(found.widthMeters?.value)).toBe(70);
  });

  it("reads metric pages", () => {
    const found = extractDimensions(
      "Width 178 cm x Depth 165 cm x Height 87cm",
    );

    expect(found.widthMeters?.value).toBeCloseTo(1.78, 10);
    expect(found.depthMeters?.value).toBeCloseTo(1.65, 10);
    expect(found.heightMeters?.value).toBeCloseTo(0.87, 10);
  });

  it("reads millimeters without mistaking them for inches", () => {
    const found = extractDimensions("Width: 1780 mm");

    expect(found.widthMeters?.value).toBeCloseTo(1.78, 10);
  });

  it("reads feet", () => {
    const found = extractDimensions("Length: 8 ft");

    expect(found.widthMeters?.value).toBeCloseTo(2.4384, 10);
  });

  it("treats a bare number as inches, which is what US retail prints", () => {
    const found = extractDimensions("Width: 70");

    expect(inches(found.widthMeters?.value)).toBe(70);
  });

  it("carries the text each number came from", () => {
    const found = extractDimensions(`70"W x 15.7"D`);

    expect(found.widthMeters?.sourceText).toBe(`70"W`);
    expect(found.depthMeters?.sourceText).toBe(`15.7"D`);
  });
});

describe("dimensions without labelled axes", () => {
  /** The real string from the Amazon sectional page. */
  const AMAZON = "Item Dimensions 52.8 x 125.8 x 36.4 inches";

  it("reads three sizes in a row and applies the trailing unit to all of them", () => {
    const found = extractDimensions(AMAZON);

    expect(inches(found.widthMeters?.value)).toBe(52.8);
    expect(inches(found.depthMeters?.value)).toBe(125.8);
    expect(inches(found.heightMeters?.value)).toBe(36.4);
  });

  it("says the order was assumed, because the page never said which is which", () => {
    expect(extractDimensions(AMAZON).dimensionOrderIsAssumed).toBe(true);
  });

  it("prefers labelled axes over position when the page offers both", () => {
    const found = extractDimensions(
      ["52.8 x 125.8 x 36.4 inches", `Width: 125.8"`].join("\n"),
    );

    expect(inches(found.widthMeters?.value)).toBe(125.8);
    expect(found.dimensionOrderIsAssumed).toBe(false);
  });

  it("reports nothing rather than guessing when there is nothing to read", () => {
    const found = extractDimensions("Free shipping on orders over $35");

    expect(found.widthMeters).toBeUndefined();
    expect(found.depthMeters).toBeUndefined();
    expect(found.heightMeters).toBeUndefined();
    expect(found.dimensionOrderIsAssumed).toBe(false);
  });
});

describe("price", () => {
  it("reads a price with a thousands separator", () => {
    expect(extractPrice("Now $1,299.99")?.value).toBe(129999);
  });

  it("reads a whole-dollar price", () => {
    expect(extractPrice("$949")?.value).toBe(94900);
  });

  it("carries the text it came from", () => {
    expect(extractPrice("Sale price $189.99 today")?.sourceText).toBe(
      "$189.99",
    );
  });

  it("reports nothing when there is no price", () => {
    expect(extractPrice("Add to cart")).toBeNull();
  });
});

describe("name", () => {
  it("takes the first substantial line", () => {
    const name = extractName(
      ["", 'AMERLIFE 70" Modern TV Stand', "$189.99"].join("\n"),
    );

    expect(name?.value).toBe('AMERLIFE 70" Modern TV Stand');
  });

  it("steps over the navigation a pasted page starts with", () => {
    const name = extractName(
      [
        "Skip to main content",
        "Deliver to Miami 33101",
        "Search",
        "Belffin Modular Sectional Sleeper Sofa",
      ].join("\n"),
    );

    expect(name?.value).toBe("Belffin Modular Sectional Sleeper Sofa");
  });

  it("reports nothing for text with no line long enough to be a name", () => {
    expect(extractName("$12\nx\n")).toBeNull();
  });
});

describe("extractProduct", () => {
  /** Shaped like the Amazon sectional page as a person would paste it. */
  const AMAZON_PAGE = [
    "Skip to main content",
    "Belffin Modular Sectional Sleeper Sofa Bed with Storage Chaise",
    "$949.99",
    "Item Dimensions 52.8 x 125.8 x 36.4 inches",
    "Add to Cart",
  ].join("\n");

  it("reads a whole product off a pasted page", () => {
    const product = extractProduct(AMAZON_PAGE);

    expect(product.name?.value).toBe(
      "Belffin Modular Sectional Sleeper Sofa Bed with Storage Chaise",
    );
    expect(product.priceCents?.value).toBe(94999);
    expect(inches(product.heightMeters?.value)).toBe(36.4);
    expect(product.dimensionOrderIsAssumed).toBe(true);
  });

  it("fills in only what it actually read", () => {
    const product = extractProduct("A lamp with no numbers anywhere on it");

    expect(product.priceCents).toBeUndefined();
    expect(product.widthMeters).toBeUndefined();
    expect(product.name?.value).toBe("A lamp with no numbers anywhere on it");
  });

  it("does not invent a product from an empty paste", () => {
    expect(extractProduct("")).toEqual({ dimensionOrderIsAssumed: false });
  });

  it("keeps full precision rather than rounding on the way in", () => {
    const product = extractProduct(`Width: 15.7"`);

    expect(product.widthMeters?.value).toBe(metersFromInches(15.7));
  });
});
