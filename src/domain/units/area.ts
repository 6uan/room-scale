/**
 * Area conversions.
 *
 * Areas are derived from stored meter lengths, never stored themselves. They
 * convert by the square of the length factor, which is why this cannot reuse
 * the length helpers directly.
 */

import type { DisplayUnit } from "./length";

/** Exact: a foot is 0.3048 m by the same 1959 definition as the inch. */
const SQUARE_METERS_PER_SQUARE_FOOT = 0.3048 * 0.3048;

export function squareFeetFromSquareMeters(squareMeters: number): number {
  return squareMeters / SQUARE_METERS_PER_SQUARE_FOOT;
}

export function squareMetersFromSquareFeet(squareFeet: number): number {
  return squareFeet * SQUARE_METERS_PER_SQUARE_FOOT;
}

/** Formats a stored square-meter value. Rounds only here. */
export function formatArea(squareMeters: number, unit: DisplayUnit): string {
  if (unit === "metric") {
    return `${squareMeters.toFixed(2)} m²`;
  }
  return `${squareFeetFromSquareMeters(squareMeters).toFixed(1)} sq ft`;
}
