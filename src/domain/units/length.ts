/**
 * Length conversions.
 *
 * Every length inside the application is stored in meters (see
 * docs/adr/0001-use-meters-internally.md). Retail measurements are converted
 * here, at the application boundary, and never re-converted downstream.
 */

/** Exact, by international definition since 1959. */
const METERS_PER_INCH = 0.0254;
const INCHES_PER_FOOT = 12;
const METERS_PER_CENTIMETER = 0.01;
const METERS_PER_MILLIMETER = 0.001;

/** The unit a project is kept in: metric, or imperial. */
export type StoredUnit = "metric" | "imperial";

/**
 * How imperial lengths are read: the way a tape and a listing write them,
 * 9' 8", or in inches alone, 116", the way a retailer lists a sofa. A
 * preference of the reader's, kept in the browser rather than the project.
 */
export type ImperialLengths = "feet-and-inches" | "inches";

/**
 * The unit lengths are typed and read in on screen: centimeters, feet and
 * inches, or inches. Every length is meters underneath, whichever it is.
 */
export type DisplayUnit = "metric" | "imperial" | "inches";

/** The unit to read in, from the project's unit and the reader's preference. */
export function readingUnit(
  stored: StoredUnit,
  imperialLengths: ImperialLengths,
): DisplayUnit {
  return stored === "imperial" && imperialLengths === "inches"
    ? "inches"
    : stored;
}

/**
 * The unit a product's own size is read in: what you buy, rather than where
 * it goes. Retailers list a sofa as 84" while a listing gives a room as
 * 12' 6", so in imperial a product reads by its own preference — inches unless
 * told otherwise — and the apartment by the project's. Metric is centimeters
 * for both.
 */
export function productReadingUnit(
  unit: DisplayUnit,
  productLengths: ImperialLengths,
): DisplayUnit {
  if (unit === "metric") {
    return "metric";
  }
  return productLengths === "inches" ? "inches" : "imperial";
}

/** Which unit a project keeps, for a unit picked on screen. */
export function storedUnit(unit: DisplayUnit): StoredUnit {
  return unit === "metric" ? "metric" : "imperial";
}

/** An inclusive range a length must fall inside. */
export type LengthLimits = {
  readonly minMeters: number;
  readonly maxMeters: number;
};

export type LengthProblem = "not-a-number" | "too-small" | "too-large";

/** Returns the reason a length is unusable, or null when it is fine. */
export function checkLength(
  meters: number,
  limits: LengthLimits,
): LengthProblem | null {
  if (!Number.isFinite(meters)) {
    return "not-a-number";
  }
  if (meters < limits.minMeters) {
    return "too-small";
  }
  if (meters > limits.maxMeters) {
    return "too-large";
  }
  return null;
}

export function metersFromInches(inches: number): number {
  return inches * METERS_PER_INCH;
}

export function inchesFromMeters(meters: number): number {
  return meters / METERS_PER_INCH;
}

export function metersFromCentimeters(centimeters: number): number {
  return centimeters * METERS_PER_CENTIMETER;
}

export function metersFromMillimeters(millimeters: number): number {
  return millimeters * METERS_PER_MILLIMETER;
}

export function centimetersFromMeters(meters: number): number {
  return meters / METERS_PER_CENTIMETER;
}

export function metersFromFeetAndInches(feet: number, inches = 0): number {
  return metersFromInches(feet * INCHES_PER_FOOT + inches);
}

/** Splits a length into whole feet plus the remaining inches. */
export function feetAndInchesFromMeters(meters: number): {
  feet: number;
  inches: number;
} {
  const totalInches = inchesFromMeters(meters);
  const sign = Math.sign(totalInches);
  const magnitude = Math.abs(totalInches);
  const wholeFeet = Math.floor(magnitude / INCHES_PER_FOOT);
  return {
    feet: sign * wholeFeet,
    inches: sign * (magnitude - wholeFeet * INCHES_PER_FOOT),
  };
}

/** The unit a bare number is typed in: centimeters, or inches. */
export function displayUnitSuffix(unit: DisplayUnit): string {
  return unit === "metric" ? "cm" : "in";
}

/** Converts a number typed in the reader's unit into stored meters. */
export function metersFromDisplayValue(
  value: number,
  unit: DisplayUnit,
): number {
  return unit === "metric"
    ? metersFromCentimeters(value)
    : metersFromInches(value);
}

/**
 * The unrounded number to seed an input with. Rounding is left to the caller,
 * so a field can decide its own precision without this losing any first.
 */
export function displayValueFromMeters(
  meters: number,
  unit: DisplayUnit,
): number {
  return unit === "metric"
    ? centimetersFromMeters(meters)
    : inchesFromMeters(meters);
}

/**
 * The nearest whole unit the reader is working in: an inch, or a centimeter.
 *
 * Dragging produces a number with as many decimals as there are pixels, and
 * nobody builds an apartment to seven-thousandths of an inch. Rounding to the
 * unit on screen means a dragged wall lands on the same kind of number a typed
 * one does, and the field beside it does not fill with noise.
 */
/**
 * Reads a typed length into meters, or null when it is not one yet.
 *
 * A bare number is in the display unit, the way the fields have always read.
 * In imperial a tape measure's own notation is taken too: `11'`, `11' 6"`,
 * `11'6`, `11 ft 6 in`, `6"`, `11.5'`. The apostrophe and the quote are the
 * marks on the tape, so a person typing what the tape says gets the room the
 * tape measured. In metric, `m` and `cm` are read the same way.
 */
export function parseLength(text: string, unit: DisplayUnit): number | null {
  const typed = text.trim().toLowerCase();
  // A position or a gap can be negative, and a field writes one back as
  // -8' 7": the sign belongs to the whole length, not to the feet alone.
  if (/^-\s*\S/.test(typed) && !/^-?\d*\.?\d+$/.test(typed)) {
    const rest = typed.replace(/^-\s*/, "");
    const magnitude = rest.startsWith("-") ? null : parseLength(rest, unit);
    return magnitude === null ? null : -magnitude;
  }
  const trimmed = typed;
  if (trimmed === "") {
    return null;
  }
  if (/^-?\d*\.?\d+$/.test(trimmed)) {
    return metersFromDisplayValue(Number(trimmed), unit);
  }

  const number = String.raw`(\d*\.?\d+)`;
  if (unit !== "metric") {
    // Feet, then inches, either optional but not both absent.
    const match = new RegExp(
      String.raw`^(?:${number}\s*(?:'|ft|feet|foot))?\s*(?:${number}\s*(?:"|''|in|inches|inch)?)?$`,
    ).exec(trimmed);
    if (match === null || (match[1] === undefined && match[2] === undefined)) {
      return null;
    }
    // A bare second number with no mark after a foot mark is inches: 11'6.
    const feet = match[1] === undefined ? 0 : Number(match[1]);
    const inches = match[2] === undefined ? 0 : Number(match[2]);
    return metersFromFeetAndInches(feet, inches);
  }

  const match = new RegExp(String.raw`^${number}\s*(m|cm|mm)$`).exec(trimmed);
  if (match === null) {
    return null;
  }
  const value = Number(match[1]);
  switch (match[2]) {
    case "m":
      return value;
    case "cm":
      return metersFromCentimeters(value);
    default:
      return metersFromMillimeters(value);
  }
}

export function roundToDisplayUnit(meters: number, unit: DisplayUnit): number {
  return metersFromDisplayValue(
    Math.round(displayValueFromMeters(meters, unit)),
    unit,
  );
}

/** A number to at most `decimals` places, with no trailing zeros: 8, 8.5. */
function trimmedNumber(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

/**
 * Feet and inches the way a tape reads them — 9' 8", 9' 8.5" — and inches
 * alone under a foot, 6", rather than 0' 6".
 */
function feetAndInchesText(meters: number, decimals: number): string {
  const { feet, inches } = feetAndInchesFromMeters(meters);
  const negative = feet < 0 || inches < 0;
  let wholeFeet = Math.abs(feet);
  let roundedInches = Number(Math.abs(inches).toFixed(decimals));

  // Rounding can reach a whole foot. Eight feet typed as 96 inches comes back
  // out of meters as 95.9999…, which would otherwise print as 7' 12" — a
  // length nobody writes and no tape measure shows.
  if (roundedInches >= INCHES_PER_FOOT) {
    roundedInches -= INCHES_PER_FOOT;
    wholeFeet += 1;
  }

  const sign = negative && (wholeFeet > 0 || roundedInches > 0) ? "-" : "";
  const inchText = `${trimmedNumber(roundedInches, decimals)}"`;
  return wholeFeet === 0
    ? `${sign}${inchText}`
    : `${sign}${wholeFeet}' ${inchText}`;
}

/**
 * Formats a stored meter value for display. Rounding happens here only —
 * calculations upstream keep full precision.
 *
 * A tenth is kept where there is one and dropped where there is not: 9' 8",
 * not 9' 8.0".
 */
export function formatLength(meters: number, unit: DisplayUnit): string {
  switch (unit) {
    case "metric":
      return `${trimmedNumber(centimetersFromMeters(meters), 1)} cm`;
    case "inches":
      return `${trimmedNumber(inchesFromMeters(meters), 1)}"`;
    case "imperial":
      return feetAndInchesText(meters, 1);
  }
}

/**
 * The text a length field shows, which is also text it reads back.
 *
 * Feet and inches show as the tape writes them, so what is typed and what is
 * read are one format; inches and centimeters show the bare number, with the
 * unit beside the field. A hundredth of an inch and a tenth of a centimeter
 * are kept, which is finer than any label and coarse enough not to show
 * floating-point noise.
 */
export function lengthFieldText(meters: number, unit: DisplayUnit): string {
  switch (unit) {
    case "metric":
      return trimmedNumber(centimetersFromMeters(meters), 1);
    case "inches":
      return trimmedNumber(inchesFromMeters(meters), 2);
    case "imperial":
      return feetAndInchesText(meters, 2);
  }
}

/**
 * The number a field steps from with the arrow keys or a drag, in its bare
 * unit — inches, even when it reads in feet and inches.
 */
export function lengthStepValue(meters: number, unit: DisplayUnit): number {
  return Number(
    displayValueFromMeters(meters, unit).toFixed(unit === "metric" ? 1 : 2),
  );
}
