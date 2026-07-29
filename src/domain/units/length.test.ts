import { describe, expect, it } from "vitest";
import {
  centimetersFromMeters,
  checkLength,
  displayUnitSuffix,
  displayValueFromMeters,
  feetAndInchesFromMeters,
  formatLength,
  inchesFromMeters,
  metersFromCentimeters,
  metersFromDisplayValue,
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

  it("carries a rounded-up inch into the feet", () => {
    // 96 inches comes back out of meters as 95.9999…, which rounds to 12.0
    // inches. Eight feet is not written 7' 12.0".
    expect(formatLength(metersFromInches(96), "imperial")).toBe(`8' 0.0"`);
    expect(formatLength(metersFromInches(24), "imperial")).toBe(`2' 0.0"`);
    // Just under the carry, so it stays where it is.
    expect(formatLength(metersFromInches(95.9), "imperial")).toBe(`7' 11.9"`);
  });

  it("signs a negative length once, not on both parts", () => {
    expect(formatLength(-metersFromInches(18), "imperial")).toBe(`-1' 6.0"`);
  });
});

describe("checkLength", () => {
  const limits = { minMeters: 0.5, maxMeters: 30 };

  it("accepts a length inside the limits, bounds included", () => {
    expect(checkLength(4.2, limits)).toBeNull();
    expect(checkLength(0.5, limits)).toBeNull();
    expect(checkLength(30, limits)).toBeNull();
  });

  it("names which side of the limits a length falls outside", () => {
    expect(checkLength(0.49, limits)).toBe("too-small");
    expect(checkLength(30.01, limits)).toBe("too-large");
  });

  it("rejects values that are not real numbers", () => {
    expect(checkLength(Number.NaN, limits)).toBe("not-a-number");
    expect(checkLength(Number.POSITIVE_INFINITY, limits)).toBe("not-a-number");
  });
});

describe("display values", () => {
  it("names the unit a single typed number is in", () => {
    expect(displayUnitSuffix("metric")).toBe("cm");
    expect(displayUnitSuffix("imperial")).toBe("in");
  });

  it("reads a typed number as centimeters or inches", () => {
    expect(metersFromDisplayValue(420, "metric")).toBeCloseTo(4.2, 10);
    expect(metersFromDisplayValue(36, "imperial")).toBeCloseTo(0.9144, 10);
  });

  it("seeds an input from stored meters", () => {
    expect(displayValueFromMeters(4.2, "metric")).toBeCloseTo(420, 10);
    expect(displayValueFromMeters(0.9144, "imperial")).toBeCloseTo(36, 10);
  });

  it("round-trips a typed number through meters in both units", () => {
    for (const unit of ["metric", "imperial"] as const) {
      const typed = 137.5;
      expect(
        displayValueFromMeters(metersFromDisplayValue(typed, unit), unit),
      ).toBeCloseTo(typed, 10);
    }
  });

  it("does not round before the caller asks it to", () => {
    // 165 inches is 4.191 m exactly; a premature round to centimeters would
    // return 419 or 419.1 and lose the difference.
    expect(displayValueFromMeters(metersFromInches(165), "metric")).toBeCloseTo(
      419.1,
      10,
    );
  });
});
