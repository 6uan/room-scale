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

/** The unit a person reads, kept separately from the stored value. */
export type DisplayUnit = "metric" | "imperial";

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

/** The unit a person types a single number in: centimeters, or inches. */
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
 * Formats a stored meter value for display. Rounding happens here only —
 * calculations upstream keep full precision.
 */
export function formatLength(meters: number, unit: DisplayUnit): string {
  if (unit === "metric") {
    return `${centimetersFromMeters(meters).toFixed(1)} cm`;
  }
  const { feet, inches } = feetAndInchesFromMeters(meters);
  return `${feet}' ${inches.toFixed(1)}"`;
}
