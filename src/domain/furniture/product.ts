/**
 * A furniture product: the thing you can buy.
 *
 * A product carries the facts that are true wherever it stands — dimensions off
 * the product page, price, retailer, whether it has been ordered. Facts about
 * one copy standing in one spot belong to an instance instead, which is a
 * separate entity by
 * docs/adr/0003-separate-products-from-instances.md.
 *
 * Lengths are meters and prices are integer cents. Neither is ever stored in
 * the unit it was typed in.
 */

import {
  checkLength,
  isCents,
  type Cents,
  type LengthLimits,
  type LengthProblem,
} from "@/domain/units";

export type PurchaseStatus = "considering" | "ordered" | "owned";

export const PURCHASE_STATUSES: readonly PurchaseStatus[] = [
  "considering",
  "ordered",
  "owned",
];

/** The floor rectangle a product occupies. Height is tracked separately. */
export type Footprint = {
  readonly widthMeters: number;
  readonly depthMeters: number;
};

export type FurnitureProduct = {
  readonly id: string;
  readonly name: string;
  readonly retailer: string;
  readonly productUrl: string;
  readonly priceCents: Cents;
  readonly purchaseStatus: PurchaseStatus;
  readonly footprint: Footprint;
  readonly heightMeters: number;
};

/** From a throw folded on a shelf to a wall-length sectional. */
export const PRODUCT_LENGTH_LIMITS: LengthLimits = {
  minMeters: 0.01,
  maxMeters: 10,
};

export const MAX_NAME_LENGTH = 120;

/** A million dollars. Past this it is a typo, not a sofa. */
export const MAX_PRICE_CENTS = 100_000_000;

export type NameProblem = "required" | "too-long";
export type PriceProblem = "not-whole-cents" | "negative" | "too-large";

/**
 * Everything wrong with a product, keyed by the field it belongs to. An empty
 * object means the product is ready to place and to buy.
 */
export type ProductProblems = {
  readonly name?: NameProblem;
  readonly productUrl?: "not-a-web-address";
  readonly priceCents?: PriceProblem;
  readonly widthMeters?: LengthProblem;
  readonly depthMeters?: LengthProblem;
  readonly heightMeters?: LengthProblem;
};

/**
 * An empty address is allowed: not everything in a room came from a page with a
 * link. Anything else has to be one a browser would actually open.
 */
export function isProductUrl(value: string): boolean {
  if (value.trim() === "") {
    return true;
  }
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function checkProductName(name: string): NameProblem | null {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "required";
  }
  return trimmed.length > MAX_NAME_LENGTH ? "too-long" : null;
}

export function checkPrice(cents: number): PriceProblem | null {
  if (!isCents(cents)) {
    return "not-whole-cents";
  }
  if (cents < 0) {
    return "negative";
  }
  return cents > MAX_PRICE_CENTS ? "too-large" : null;
}

export function checkProduct(product: FurnitureProduct): ProductProblems {
  const name = checkProductName(product.name);
  const priceCents = checkPrice(product.priceCents);
  const widthMeters = checkLength(
    product.footprint.widthMeters,
    PRODUCT_LENGTH_LIMITS,
  );
  const depthMeters = checkLength(
    product.footprint.depthMeters,
    PRODUCT_LENGTH_LIMITS,
  );
  const heightMeters = checkLength(product.heightMeters, PRODUCT_LENGTH_LIMITS);

  // Spread rather than assign undefined, which `exactOptionalPropertyTypes`
  // rejects and which would make an empty object look non-empty.
  return {
    ...(name === null ? {} : { name }),
    ...(isProductUrl(product.productUrl)
      ? {}
      : { productUrl: "not-a-web-address" as const }),
    ...(priceCents === null ? {} : { priceCents }),
    ...(widthMeters === null ? {} : { widthMeters }),
    ...(depthMeters === null ? {} : { depthMeters }),
    ...(heightMeters === null ? {} : { heightMeters }),
  };
}

export function hasProblems(problems: ProductProblems): boolean {
  return Object.keys(problems).length > 0;
}

export function isValidProduct(product: FurnitureProduct): boolean {
  return !hasProblems(checkProduct(product));
}

/**
 * A blank product to start filling in. The dimensions are a small side table,
 * chosen only so the form opens on something valid rather than on zeroes that
 * would report themselves as errors before anything has been typed.
 */
export function createProduct(id: string): FurnitureProduct {
  return {
    id,
    name: "",
    retailer: "",
    productUrl: "",
    priceCents: 0,
    purchaseStatus: "considering",
    footprint: { widthMeters: 0.5, depthMeters: 0.5 },
    heightMeters: 0.5,
  };
}

/** Replaces one side of the footprint, leaving the product untouched. */
export function withFootprint(
  product: FurnitureProduct,
  side: keyof Footprint,
  meters: number,
): FurnitureProduct {
  return {
    ...product,
    footprint: { ...product.footprint, [side]: meters },
  };
}
