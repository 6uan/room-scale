/**
 * Money handling.
 *
 * Prices are stored as integer cents. Floating-point dollar values are never
 * stored or summed, because repeated addition of values like 12.99 accumulates
 * representation error.
 */

/** An integer number of minor currency units. */
export type Cents = number;

export function isCents(value: number): value is Cents {
  return Number.isSafeInteger(value);
}

/** Parses user or retailer input such as "1,299.99" into integer cents. */
export function centsFromDecimalString(input: string): Cents | null {
  const normalized = input.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  // Scale as a string to avoid a floating-point multiply by 100.
  const negative = normalized.startsWith("-");
  const [whole = "0", fraction = ""] = normalized.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

/**
 * The plain decimal text to seed an input with — no symbol, no thousands
 * separator, so it parses straight back through `centsFromDecimalString`.
 */
export function decimalStringFromCents(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  // Split as integers. Dividing by 100 first would reintroduce the
  // floating-point error the cents representation exists to avoid.
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, value) => total + value, 0);
}

export function formatCents(
  cents: Cents,
  currency = "USD",
  locale = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}
