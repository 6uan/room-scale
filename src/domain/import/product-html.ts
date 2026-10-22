/**
 * Reading a product out of the markup of the page selling it.
 *
 * The link path of assisted import (ADR 0005): a page fetched by the server
 * arrives as HTML rather than as the text a person would copy, so it is
 * brought to text first and then handed to the same parser the paste path
 * uses. Nothing here is a second parser; it is the same one, fed differently.
 *
 * One thing markup has that copied text does not: some retailers publish a
 * schema.org `Product` block, which names the product and its price
 * deterministically. Where it is there it is preferred for those two fields,
 * because a heading is a better name than the first long line of navigation,
 * and a structured price is a better price than the first dollar sign on the
 * page. Dimensions are not in it, in practice, so they still come from prose.
 */

import {
  extractProduct,
  type Extracted,
  type ExtractedProduct,
} from "./product-text";
import { centsFromDecimalString } from "@/domain/units";
import { readerFor } from "./retailers";

/**
 * The sources, least trusted first, each overriding the one before: prose
 * through the text parser; the main heading; schema.org data; and, where a
 * shop has one, its own reader.
 */
export function extractProductFromHtml(
  html: string,
  hostname?: string,
): ExtractedProduct {
  const fromText = extractProduct(htmlToText(html));
  const structured = extractStructuredProduct(html);
  const heading = extractHeading(html);
  const retailer = hostname === undefined ? null : readerFor(hostname);
  return {
    ...fromText,
    ...(heading === null ? {} : { name: heading }),
    ...(structured.name === undefined ? {} : { name: structured.name }),
    ...(structured.priceCents === undefined
      ? {}
      : { priceCents: structured.priceCents }),
    ...retailer?.read(html),
  };
}

/**
 * What the page would read as, roughly: scripts and styles dropped, because
 * they are full of lengths that are not measurements; block tags turned into
 * line breaks, so a spec table's label and value stay on separate lines the
 * way the text parser expects; entities decoded, so `&quot;` is an inch mark.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, "")
      .replace(
        /<\/?(?:p|div|br|li|tr|td|th|h[1-6]|dt|dd|section|article|header|footer|nav|main|table|ul|ol)\b[^>]*>/gi,
        "\n",
      )
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * The page's main heading, which on a product page is the product. Copied
 * text has no way to tell a heading from the navigation above it, and the
 * browser title adds the shop's name and "& Reviews"; the markup knows.
 */
export function extractHeading(html: string): Extracted<string> | null {
  const match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (match?.[1] === undefined) {
    return null;
  }
  const text = htmlToText(match[1]).replace(/\n/g, " ").trim();
  return text === "" ? null : { value: text.slice(0, 120), sourceText: text };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (
      whole,
      decimal: string | undefined,
      hex: string | undefined,
      name: string | undefined,
    ) => {
      if (decimal !== undefined) {
        return String.fromCodePoint(Number(decimal));
      }
      if (hex !== undefined) {
        return String.fromCodePoint(Number.parseInt(hex, 16));
      }
      return NAMED_ENTITIES[(name ?? "").toLowerCase()] ?? whole;
    },
  );
}

type Structured = {
  readonly name?: Extracted<string>;
  readonly priceCents?: Extracted<number>;
};

/**
 * The first schema.org `Product` in a JSON-LD block, if any. Anything that
 * does not parse, or is not a product, is simply not there: this must never
 * be the reason a page fails.
 */
export function extractStructuredProduct(html: string): Structured {
  const blocks = html.matchAll(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, body] of blocks) {
    for (const node of flattenJsonLd(parseJson(body ?? ""))) {
      if (!isProduct(node)) {
        continue;
      }
      return {
        ...(typeof node.name === "string" && node.name.trim() !== ""
          ? {
              name: {
                value: node.name.trim().slice(0, 120),
                sourceText: node.name,
              },
            }
          : {}),
        ...structuredPrice(node),
      };
    }
  }
  return {};
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** JSON-LD may be one object, an array, or an `@graph` of objects. */
function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const node = value as Record<string, unknown>;
  return [node, ...flattenJsonLd(node["@graph"])];
}

function isProduct(node: Record<string, unknown>): boolean {
  const type = node["@type"];
  return Array.isArray(type) ? type.includes("Product") : type === "Product";
}

function structuredPrice(node: Record<string, unknown>): Structured {
  const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  if (typeof offers !== "object" || offers === null) {
    return {};
  }
  const price = (offers as Record<string, unknown>).price;
  const text =
    typeof price === "number"
      ? String(price)
      : typeof price === "string"
        ? price
        : null;
  if (text === null) {
    return {};
  }
  const cents = centsFromDecimalString(text);
  return cents === null
    ? {}
    : { priceCents: { value: cents, sourceText: `price: ${text}` } };
}
