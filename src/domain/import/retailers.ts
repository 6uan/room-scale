/**
 * Readers for the shops whose pages the generic parser gets wrong.
 *
 * The parser reads what a page says in prose, and prose is enough for most
 * pages. Some shops print a dozen prices around the one that matters, or
 * keep the real one only in script state, and for those a reader that knows
 * the page is the honest option: it reads a named field rather than guessing
 * among lookalikes. Each reader is keyed by hostname, ships with a captured
 * fixture, and is a small function over the markup — so when the shop
 * changes its page the fixture test fails, instead of the number being wrong.
 *
 * What a reader returns overrides the parser; what it leaves out, the
 * parser fills in. A shop without a reader simply gets the parser.
 */

import { centsFromDecimalString } from "@/domain/units";
import type { Extracted } from "./product-text";

export type RetailerReading = {
  readonly priceCents?: Extracted<number>;
};

export type RetailerReader = {
  readonly name: string;
  /** Matches the hostname exactly, or any subdomain of it. */
  readonly host: string;
  readonly read: (html: string) => RetailerReading;
};

/**
 * Wayfair's page carries its pricing as escaped GraphQL state inside script
 * tags. The product's own price is the `leadPrice` of that state; the other
 * amounts on the page — a set the piece belongs to, assembly, a protection
 * plan — are listed under other keys and never as `leadPrice`.
 */
const ikea: RetailerReader = {
  name: "IKEA",
  host: "ikea.com",
  // Everything IKEA states is in its Product block; the name is all this adds.
  read: () => ({}),
};

const wayfair: RetailerReader = {
  name: "Wayfair",
  host: "wayfair.com",
  read(html) {
    const match =
      /leadPrice\\?":\{\\?"displayPrice\\?":\\?"\$*([\d,]+(?:\.\d{2})?)/.exec(
        html,
      );
    const amount = match?.[1];
    const cents = amount === undefined ? null : centsFromDecimalString(amount);
    return cents === null
      ? {}
      : { priceCents: { value: cents, sourceText: `leadPrice: $${amount}` } };
  },
};

const READERS: readonly RetailerReader[] = [wayfair, ikea];

export function readerFor(hostname: string): RetailerReader | null {
  const host = hostname.toLowerCase();
  return (
    READERS.find(
      (reader) => host === reader.host || host.endsWith(`.${reader.host}`),
    ) ?? null
  );
}

/**
 * What to call the shop, from its address: the reader's name where there is
 * one, and otherwise the hostname's own label with its first letter raised —
 * `www.article.com` is "Article". Typed over freely; it is a starting value.
 */
export function retailerNameFromHostname(hostname: string): string | null {
  const reader = readerFor(hostname);
  if (reader !== null) {
    return reader.name;
  }
  const labels = hostname.toLowerCase().split(".").filter(Boolean);
  // Drop a public suffix of one or two labels (`.com`, `.co.uk`).
  const label =
    labels.length >= 3 && (labels.at(-2)?.length ?? 0) <= 3
      ? labels.at(-3)
      : labels.at(-2);
  return label === undefined || label === "" || label === "www"
    ? null
    : label.charAt(0).toUpperCase() + label.slice(1);
}
