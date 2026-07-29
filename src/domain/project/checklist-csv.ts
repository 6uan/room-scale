/**
 * The checklist as a spreadsheet.
 *
 * The point of CSV here is that the list stops being RoomScale's. Opened in a
 * spreadsheet it can be sorted, shared with whoever is paying half of it, or
 * pasted into whatever the household already uses to track what it is buying.
 *
 * Money is written as a plain decimal — `1999.00`, never `$1,999.00` — because
 * a spreadsheet reads the first as a number and the second as text, and a
 * column of text does not add up. Lengths are written in meters for the same
 * reason: one unit, unambiguous, and the reader can convert.
 */

import { decimalStringFromCents } from "@/domain/units";
import type { Checklist } from "./checklist";

const COLUMNS = [
  "Item",
  "Retailer",
  "Quantity",
  "Price each",
  "Line total",
  "Status",
  "Width (m)",
  "Depth (m)",
  "Link",
] as const;

/** The purchase statuses, worded as the interface words them. */
const STATUS_LABELS = {
  considering: "Considering",
  ordered: "Ordered",
  owned: "Already own it",
} as const;

export function checklistCsv(checklist: Checklist): string {
  const rows = checklist.lines.map(({ product, quantity, lineCents }) => [
    product.name,
    product.retailer,
    String(quantity),
    decimalStringFromCents(product.priceCents),
    decimalStringFromCents(lineCents),
    STATUS_LABELS[product.purchaseStatus],
    String(product.footprint.widthMeters),
    String(product.footprint.depthMeters),
    product.productUrl,
  ]);

  // A totals row, because the number people actually want is the one at the
  // bottom, and a spreadsheet they have to sum themselves is half a list.
  const totals = [
    "Total",
    "",
    "",
    "",
    decimalStringFromCents(checklist.totalCents),
    "",
    "",
    "",
    "",
  ];

  return [COLUMNS, ...rows, totals]
    .map((row) => row.map(escapeField).join(","))
    .join("\r\n");
}

/**
 * One field, quoted only when it has to be.
 *
 * A comma, a quote, or a line break inside a value would otherwise end the
 * field early — and furniture is called things like `Sofa, 3-seat` often
 * enough to matter. Quotes inside a quoted field are doubled, which is what
 * RFC 4180 says and what every spreadsheet expects.
 */
function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
