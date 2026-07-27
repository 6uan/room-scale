import { describe, expect, it } from "vitest";
import {
  FULL_TURN_RADIANS,
  degreesFromRadians,
  formatAngle,
  normalizeRadians,
  radiansFromDegrees,
} from "./angle";

describe("radiansFromDegrees", () => {
  it("converts the quarter turns exactly", () => {
    expect(radiansFromDegrees(0)).toBe(0);
    expect(radiansFromDegrees(90)).toBeCloseTo(Math.PI / 2, 12);
    expect(radiansFromDegrees(360)).toBeCloseTo(FULL_TURN_RADIANS, 12);
  });

  it("round-trips through degrees", () => {
    expect(degreesFromRadians(radiansFromDegrees(37.5))).toBeCloseTo(37.5, 12);
  });
});

describe("normalizeRadians", () => {
  it("leaves an angle already inside one turn alone", () => {
    expect(normalizeRadians(Math.PI)).toBe(Math.PI);
  });

  it("wraps a whole turn back to none", () => {
    expect(normalizeRadians(FULL_TURN_RADIANS)).toBe(0);
  });

  it("wraps past a turn rather than accumulating", () => {
    expect(normalizeRadians(radiansFromDegrees(370))).toBeCloseTo(
      radiansFromDegrees(10),
      12,
    );
  });

  it("brings an anticlockwise turn back into the positive range", () => {
    expect(normalizeRadians(radiansFromDegrees(-10))).toBeCloseTo(
      radiansFromDegrees(350),
      12,
    );
  });
});

describe("formatAngle", () => {
  it("prints degrees", () => {
    expect(formatAngle(Math.PI / 2)).toBe("90°");
    expect(formatAngle(0)).toBe("0°");
  });

  it("keeps a tenth of a degree", () => {
    expect(formatAngle(radiansFromDegrees(22.5))).toBe("22.5°");
  });

  it("prints a hair under a whole turn as none, not as 360°", () => {
    expect(formatAngle(radiansFromDegrees(359.99))).toBe("0°");
  });
});
