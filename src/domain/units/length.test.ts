import { describe, expect, it } from "vitest";
import {
  parseLength,
  centimetersFromMeters,
  checkLength,
  displayUnitSuffix,
  displayValueFromMeters,
  feetAndInchesFromMeters,
  formatLength,
  inchesFromMeters,
  lengthFieldText,
  lengthStepValue,
  productReadingUnit,
  readingUnit,
  storedUnit,
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

  it("formats in the requested display unit, with no stray tenth", () => {
    expect(formatLength(1.0668, "metric")).toBe("106.7 cm");
    expect(formatLength(1.0668, "imperial")).toBe(`3' 6"`);
    expect(formatLength(1.0668, "inches")).toBe(`42"`);
    expect(formatLength(metersFromInches(42.5), "imperial")).toBe(`3' 6.5"`);
    expect(formatLength(metersFromCentimeters(295), "metric")).toBe("295 cm");
  });

  it("reads under a foot in inches alone, not 0' 4.5\"", () => {
    expect(formatLength(metersFromInches(4.5), "imperial")).toBe(`4.5"`);
    expect(formatLength(-metersFromInches(4.5), "imperial")).toBe(`-4.5"`);
    expect(formatLength(0, "imperial")).toBe(`0"`);
  });

  it("carries a rounded-up inch into the feet", () => {
    // 96 inches comes back out of meters as 95.9999…, which rounds to 12.0
    // inches. Eight feet is not written 7' 12.0".
    expect(formatLength(metersFromInches(96), "imperial")).toBe(`8' 0"`);
    expect(formatLength(metersFromInches(24), "imperial")).toBe(`2' 0"`);
    // Just under the carry, so it stays where it is.
    expect(formatLength(metersFromInches(95.9), "imperial")).toBe(`7' 11.9"`);
  });

  it("signs a negative length once, not on both parts", () => {
    expect(formatLength(-metersFromInches(18), "imperial")).toBe(`-1' 6"`);
  });
});

describe("what a field shows and steps by", () => {
  it("shows feet and inches as the tape writes them, and reads it back", () => {
    const meters = metersFromInches(116.25);
    expect(lengthFieldText(meters, "imperial")).toBe(`9' 8.25"`);
    expect(lengthFieldText(meters, "inches")).toBe("116.25");
    expect(
      parseLength(lengthFieldText(meters, "imperial"), "imperial"),
    ).toBeCloseTo(meters, 12);
    expect(
      parseLength(lengthFieldText(meters, "inches"), "inches"),
    ).toBeCloseTo(meters, 12);
  });

  it("keeps a centimeter's tenth and drops a whole number's", () => {
    expect(lengthFieldText(metersFromCentimeters(295), "metric")).toBe("295");
    expect(lengthFieldText(metersFromCentimeters(295.46), "metric")).toBe(
      "295.5",
    );
  });

  it("steps in inches whichever way imperial is read", () => {
    const meters = metersFromInches(116);
    expect(lengthStepValue(meters, "imperial")).toBe(116);
    expect(lengthStepValue(meters, "inches")).toBe(116);
    expect(lengthStepValue(metersFromCentimeters(295), "metric")).toBe(295);
  });

  it("reads back a negative length it wrote, the sign on the whole of it", () => {
    for (const unit of ["imperial", "inches", "metric"] as const) {
      const meters = -metersFromInches(102.97);
      // A field keeps a hundredth of an inch, or a tenth of a centimeter.
      expect(parseLength(lengthFieldText(meters, unit), unit)).toBeCloseTo(
        meters,
        unit === "metric" ? 3 : 12,
      );
    }
    expect(parseLength(`-8' 6.97"`, "imperial")).toBeCloseTo(
      -metersFromInches(102.97),
      12,
    );
    expect(parseLength(`-6.5"`, "imperial")).toBeCloseTo(
      -metersFromInches(6.5),
      12,
    );
    expect(parseLength("-", "imperial")).toBeNull();
    expect(parseLength("--3", "imperial")).toBeNull();
  });

  it("takes tape notation in inches mode too, and a bare number as inches", () => {
    expect(parseLength(`9' 8"`, "inches")).toBeCloseTo(
      metersFromInches(116),
      12,
    );
    expect(parseLength("116", "inches")).toBeCloseTo(metersFromInches(116), 12);
  });
});

describe("the reading unit", () => {
  it("reads a product in its own imperial unit, and centimeters in metric", () => {
    expect(productReadingUnit("imperial", "inches")).toBe("inches");
    expect(productReadingUnit("inches", "feet-and-inches")).toBe("imperial");
    expect(productReadingUnit("imperial", "feet-and-inches")).toBe("imperial");
    expect(productReadingUnit("metric", "inches")).toBe("metric");
  });

  it("reads imperial in inches only when this reader asked to", () => {
    expect(readingUnit("imperial", "feet-and-inches")).toBe("imperial");
    expect(readingUnit("imperial", "inches")).toBe("inches");
    expect(readingUnit("metric", "inches")).toBe("metric");
  });

  it("keeps a project in metric or imperial, never inches", () => {
    expect(storedUnit("inches")).toBe("imperial");
    expect(storedUnit("imperial")).toBe("imperial");
    expect(storedUnit("metric")).toBe("metric");
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

describe("parseLength", () => {
  it("reads a bare number in the display unit", () => {
    expect(parseLength("36", "imperial")).toBeCloseTo(0.9144, 10);
    expect(parseLength("420", "metric")).toBeCloseTo(4.2, 10);
    expect(parseLength(" 1.5 ", "imperial")).toBeCloseTo(0.0381, 10);
  });

  it("reads what a tape says, in feet and inches", () => {
    const eleven = metersFromFeetAndInches(11);
    const elevenSix = metersFromFeetAndInches(11, 6);
    expect(parseLength("11'", "imperial")).toBeCloseTo(eleven, 10);
    expect(parseLength("11' 6\"", "imperial")).toBeCloseTo(elevenSix, 10);
    expect(parseLength("11'6", "imperial")).toBeCloseTo(elevenSix, 10);
    expect(parseLength("11 ft 6 in", "imperial")).toBeCloseTo(elevenSix, 10);
    expect(parseLength("11.5'", "imperial")).toBeCloseTo(
      metersFromFeetAndInches(11.5),
      10,
    );
    expect(parseLength('6"', "imperial")).toBeCloseTo(metersFromInches(6), 10);
  });

  it("reads meters and centimeters when spelled out", () => {
    expect(parseLength("1.2 m", "metric")).toBeCloseTo(1.2, 10);
    expect(parseLength("120cm", "metric")).toBeCloseTo(1.2, 10);
    expect(parseLength("1200 mm", "metric")).toBeCloseTo(1.2, 10);
  });

  it("is null for anything else", () => {
    expect(parseLength("", "imperial")).toBeNull();
    expect(parseLength("eleven", "imperial")).toBeNull();
    expect(parseLength("'", "imperial")).toBeNull();
    expect(parseLength("12 ft", "metric")).toBeNull();
  });
});

describe("display values", () => {
  it("names the unit a single typed number is in", () => {
    expect(displayUnitSuffix("metric")).toBe("cm");
    expect(displayUnitSuffix("imperial")).toBe("in");
    expect(displayUnitSuffix("inches")).toBe("in");
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
