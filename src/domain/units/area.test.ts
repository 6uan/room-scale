import { describe, expect, it } from "vitest";
import {
  formatArea,
  squareFeetFromSquareMeters,
  squareMetersFromSquareFeet,
} from "./area";
import { metersFromFeetAndInches } from "./length";

describe("area conversions", () => {
  it("converts square meters to square feet", () => {
    expect(squareFeetFromSquareMeters(1)).toBeCloseTo(10.7639104, 6);
  });

  it("round-trips square feet through square meters", () => {
    expect(
      squareMetersFromSquareFeet(squareFeetFromSquareMeters(12)),
    ).toBeCloseTo(12, 10);
  });

  it("squares the length factor rather than applying it once", () => {
    // A 10 by 10 foot room is 100 square feet, not 10 times something.
    const side = metersFromFeetAndInches(10);
    expect(squareFeetFromSquareMeters(side * side)).toBeCloseTo(100, 8);
  });

  it("formats in the requested display unit", () => {
    expect(formatArea(15.12, "metric")).toBe("15.12 m²");
    expect(formatArea(15.12, "imperial")).toBe("162.8 sq ft");
  });
});
