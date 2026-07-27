/**
 * Reading a product out of the text of the page selling it.
 *
 * This is the deterministic half of assisted import (ADR 0005). It matches
 * patterns and reports what it matched; it never infers, and it never fills a
 * field it did not actually read. Everything it returns carries the text it
 * came from, so a person can check the number against the page rather than
 * take this module's word for it.
 *
 * Two facts from the pages this was built against shaped it:
 *
 * - Neither Target nor Amazon publishes schema.org metadata for furniture, so
 *   there is no structured source to prefer. Prose is the source.
 * - Amazon prints `52.8 x 125.8 x 36.4 inches` with no axis labels at all.
 *   Which number is the width is a convention, not a fact, so a positional
 *   match is reported as assumed rather than quietly trusted.
 *
 * It reads visible page text — what a person gets by selecting the page and
 * copying — rather than HTML. That is deliberate: the markup of a retail page
 * is full of stylesheet lengths and script numbers that look exactly like
 * measurements, and none of that survives into what is rendered.
 */

import {
  centsFromDecimalString,
  metersFromCentimeters,
  metersFromFeetAndInches,
  metersFromInches,
  metersFromMillimeters,
} from "@/domain/units";

/** A value read out of the page, with the text it was read from. */
export type Extracted<T> = {
  readonly value: T;
  /** Shown next to the field so the match can be checked against the page. */
  readonly sourceText: string;
};

export type ExtractedProduct = {
  readonly name?: Extracted<string>;
  readonly priceCents?: Extracted<number>;
  readonly widthMeters?: Extracted<number>;
  readonly depthMeters?: Extracted<number>;
  readonly heightMeters?: Extracted<number>;
  /**
   * True when the three sizes were matched by position rather than by label,
   * so which one is the width is this module's convention and not the page's
   * statement. The interface has to say so.
   */
  readonly dimensionOrderIsAssumed: boolean;
};

type LengthUnit = "inch" | "foot" | "centimeter" | "millimeter";

/** US retail prints bare numbers in inches far more often than anything else. */
const DEFAULT_UNIT: LengthUnit = "inch";

const NUMBER = String.raw`\d{1,4}(?:\.\d{1,3})?`;
const UNIT = String.raw`(?:''|"|in\.|inches|inch|in\b|cm\b|centimet(?:er|re)s?|mm\b|millimet(?:er|re)s?|ft\b|feet|foot|')`;
const AXIS = String.raw`(?:W|D|H|L|Width|Depth|Height|Length)`;

/**
 * `70"W`, `70 in (W)`, `36.4 inches H` — the size first, then which axis.
 *
 * Horizontal whitespace only. Allowing newlines here let a size at the end of
 * one line bind to a label at the start of the next, so
 * `...36.4 inches` / `Width: 125.8"` read as a width of 36.4.
 */
const SIZE_THEN_AXIS = new RegExp(
  String.raw`(${NUMBER})[ \t]*(${UNIT})?[ \t]*[\(\[]?[ \t]*(${AXIS})\b\)?`,
  "gi",
);

/**
 * `Width: 70"`, `Overall Width - Side to Side: 112 inches`.
 *
 * The gap is lazy and bounded so a label cannot reach across a paragraph and
 * claim a number that belongs to something else.
 */
const AXIS_THEN_SIZE = new RegExp(
  String.raw`\b(${AXIS})\b[^0-9\n]{0,40}?(${NUMBER})\s*(${UNIT})?`,
  "gi",
);

/** `52.8 x 125.8 x 36.4 inches` — three sizes, no axes named, all one line. */
const SIZE_TRIPLE = new RegExp(
  String.raw`(${NUMBER})[ \t]*(${UNIT})?[ \t]*[x×][ \t]*(${NUMBER})[ \t]*(${UNIT})?[ \t]*[x×][ \t]*(${NUMBER})[ \t]*(${UNIT})?`,
  "i",
);

const PRICE = /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/;

type Axis = "width" | "depth" | "height";

export function extractProduct(text: string): ExtractedProduct {
  const dimensions = extractDimensions(text);
  const name = extractName(text);
  const price = extractPrice(text);

  return {
    ...(name === null ? {} : { name }),
    ...(price === null ? {} : { priceCents: price }),
    ...dimensions,
  };
}

/**
 * The product name.
 *
 * Pasted page text starts with whatever the page starts with, which on a
 * retail site is often navigation. The first substantial line is a reasonable
 * guess and a bad certainty — which is fine, because it lands in a form field
 * that gets read before it is saved.
 */
export function extractName(text: string): Extracted<string> | null {
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length < 8 || line.length > 200) {
      continue;
    }
    if (looksLikeNavigation(line)) {
      continue;
    }
    return { value: line.slice(0, 120), sourceText: line };
  }
  return null;
}

const NAVIGATION_WORDS =
  /^(skip to|search|sign in|account|cart|menu|home|deliver to|free shipping|add to cart|back to results|all\b)/i;

function looksLikeNavigation(line: string): boolean {
  return NAVIGATION_WORDS.test(line) || !/[a-z]/.test(line);
}

export function extractPrice(text: string): Extracted<number> | null {
  const match = PRICE.exec(text);
  if (match?.[1] === undefined) {
    return null;
  }
  const cents = centsFromDecimalString(match[1]);
  return cents === null ? null : { value: cents, sourceText: match[0].trim() };
}

type ExtractedDimensions = Pick<
  ExtractedProduct,
  "widthMeters" | "depthMeters" | "heightMeters" | "dimensionOrderIsAssumed"
>;

/**
 * Labelled sizes are preferred over positional ones, always. A page that says
 * which number is the width is stating a fact; three numbers in a row are not.
 */
export function extractDimensions(text: string): ExtractedDimensions {
  const labelled = extractLabelledDimensions(text);
  if (
    labelled.widthMeters !== undefined ||
    labelled.depthMeters !== undefined ||
    labelled.heightMeters !== undefined
  ) {
    return { ...labelled, dimensionOrderIsAssumed: false };
  }

  const triple = extractTriple(text);
  return triple === null
    ? { dimensionOrderIsAssumed: false }
    : { ...triple, dimensionOrderIsAssumed: true };
}

function extractLabelledDimensions(
  text: string,
): Omit<ExtractedDimensions, "dimensionOrderIsAssumed"> {
  const found = new Map<Axis, Extracted<number>>();

  const record = (
    axisToken: string,
    sizeToken: string,
    unitToken: string | undefined,
    sourceText: string,
  ): void => {
    const axis = axisOf(axisToken);
    const meters = metersOf(sizeToken, unitToken);
    // First match wins: retail pages repeat dimensions in shipping tables
    // further down, and the first statement is the product's own.
    if (axis !== null && meters !== null && !found.has(axis)) {
      found.set(axis, { value: meters, sourceText: sourceText.trim() });
    }
  };

  for (const match of text.matchAll(SIZE_THEN_AXIS)) {
    record(match[3] ?? "", match[1] ?? "", match[2], match[0]);
  }
  for (const match of text.matchAll(AXIS_THEN_SIZE)) {
    record(match[1] ?? "", match[2] ?? "", match[3], match[0]);
  }

  const width = found.get("width");
  const depth = found.get("depth");
  const height = found.get("height");

  return {
    ...(width === undefined ? {} : { widthMeters: width }),
    ...(depth === undefined ? {} : { depthMeters: depth }),
    ...(height === undefined ? {} : { heightMeters: height }),
  };
}

/**
 * Three sizes in a row, assigned width, depth, then height.
 *
 * That order is the most common one for furniture, and it is still a guess.
 * The caller marks it as assumed.
 */
function extractTriple(
  text: string,
): Omit<ExtractedDimensions, "dimensionOrderIsAssumed"> | null {
  const match = SIZE_TRIPLE.exec(text);
  if (match === null) {
    return null;
  }

  // A unit written once after the last number applies to all three.
  const unit = match[2] ?? match[4] ?? match[6];
  const sizes = [match[1], match[3], match[5]].map((size) =>
    metersOf(size ?? "", unit),
  );
  const [width, depth, height] = sizes;
  if (
    width === null ||
    depth === null ||
    height === null ||
    width === undefined ||
    depth === undefined ||
    height === undefined
  ) {
    return null;
  }

  const sourceText = match[0].trim();
  return {
    widthMeters: { value: width, sourceText },
    depthMeters: { value: depth, sourceText },
    heightMeters: { value: height, sourceText },
  };
}

function axisOf(token: string): Axis | null {
  switch (token.toLowerCase()) {
    case "w":
    case "width":
      return "width";
    case "d":
    case "depth":
    // A sofa's "length" is the side a plan view calls its depth only when it
    // is also called depth. On its own, length is how far it runs along the
    // wall, which is the width.
    case "l":
    case "length":
      return token.toLowerCase().startsWith("l") ? "width" : "depth";
    case "h":
    case "height":
      return "height";
    default:
      return null;
  }
}

function metersOf(size: string, unitToken: string | undefined): number | null {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  switch (unitOf(unitToken)) {
    case "inch":
      return metersFromInches(value);
    case "foot":
      return metersFromFeetAndInches(value);
    case "centimeter":
      return metersFromCentimeters(value);
    case "millimeter":
      return metersFromMillimeters(value);
  }
}

function unitOf(token: string | undefined): LengthUnit {
  if (token === undefined) {
    return DEFAULT_UNIT;
  }
  const normalized = token.toLowerCase().replace(/\./g, "");
  if (normalized === "'" || normalized.startsWith("f")) {
    return "foot";
  }
  if (normalized.startsWith("cm") || normalized.startsWith("centim")) {
    return "centimeter";
  }
  if (normalized.startsWith("mm") || normalized.startsWith("millim")) {
    return "millimeter";
  }
  return "inch";
}
