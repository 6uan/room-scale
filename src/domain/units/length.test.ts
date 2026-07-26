import { describe, expect, it } from "vitest";
import {
  centimetersFromMeters,
  feetAndInchesFromMeters,
  formatLength,
  inchesFromMeters,
  metersFromCentimeters,
  metersFromFeetAndInches,
  metersFromInches,
} from "./length";

describe("length conversions", () => {
  it("converts inches to meters exactly", () => {
    expect(metersFromInches(1)).toBe(0.0254);
    expect(metersFromInches(36)).toBeCloseTo(0.9144, 10);
  });

  it("round-trips inches through meters", () => {
    expect(inchesFromMeters(metersFromInches(65))).toBeCloseTo(65, 10);
  });

  it("round-trips centimeters through meters", () => {
    expect(centimetersFromMeters(metersFromCentimeters(212.5))).toBeCloseTo(
      212.5,
      10,
    );
  });

  it("converts feet and inches to meters", () => {
    // The demo walkway minimum: 36 inches.
    expect(metersFromFeetAndInches(3)).toBeCloseTo(0.9144, 10);
    expect(metersFromFeetAndInches(3, 6)).toBeCloseTo(1.0668, 10);
  });

  it("splits meters into whole feet plus remaining inches", () => {
    const { feet, inches } = feetAndInchesFromMeters(
      metersFromFeetAndInches(3, 6),
    );
    expect(feet).toBe(3);
    expect(inches).toBeCloseTo(6, 10);
  });

  it("keeps the sign when splitting negative lengths", () => {
    const { feet, inches } = feetAndInchesFromMeters(-metersFromInches(18));
    expect(feet).toBe(-1);
    expect(inches).toBeCloseTo(-6, 10);
  });

  it("formats in the requested display unit", () => {
    expect(formatLength(1.0668, "metric")).toBe("106.7 cm");
    expect(formatLength(1.0668, "imperial")).toBe(`3' 6.0"`);
  });
});
