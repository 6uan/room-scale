import { describe, expect, it } from "vitest";
import {
  NO_OVERHANG,
  overhangs,
  rectOutsideFloor,
  rectOverhang,
} from "./bounds";
import type { OrientedRect } from "./oriented-rect";

/** Four by three, the shape of a small room. */
const FLOOR = { widthMeters: 4, depthMeters: 3 };

function rect(
  xMeters: number,
  zMeters: number,
  rotationRadians = 0,
  widthMeters = 2,
  depthMeters = 1,
): OrientedRect {
  return {
    center: { xMeters, zMeters },
    widthMeters,
    depthMeters,
    rotationRadians,
  };
}

describe("rectOverhang", () => {
  it("finds nothing to report for a piece well inside the floor", () => {
    expect(rectOverhang(rect(2, 1.5), FLOOR)).toEqual(NO_OVERHANG);
  });

  it("counts a piece flush against a wall as inside it", () => {
    // A two meter piece centered a meter from the west wall touches it exactly.
    expect(rectOverhang(rect(1, 1.5), FLOOR)).toEqual(NO_OVERHANG);
  });

  it("measures how far a piece crosses the west wall", () => {
    const overhang = rectOverhang(rect(0.7, 1.5), FLOOR);

    expect(overhang.west).toBeCloseTo(0.3, 12);
    expect(overhang.east).toBe(0);
  });

  it("measures each wall a piece crosses in a corner", () => {
    const overhang = rectOverhang(rect(0.5, 0.2), FLOOR);

    expect(overhang.west).toBeCloseTo(0.5, 12);
    expect(overhang.north).toBeCloseTo(0.3, 12);
    expect(overhang.east).toBe(0);
    expect(overhang.south).toBe(0);
  });

  it("measures the corner of a turned piece, not the corner of its box", () => {
    // Turned an eighth, the two by one reaches 1.06 m from its own center,
    // where unturned it reached only 1 m — so it now crosses the west wall.
    expect(rectOverhang(rect(1, 1.5), FLOOR).west).toBe(0);
    expect(rectOverhang(rect(1, 1.5, Math.PI / 4), FLOOR).west).toBeCloseTo(
      0.0607,
      3,
    );
  });

  it("ignores a reach smaller than a millimeter", () => {
    expect(rectOverhang(rect(0.9995, 1.5), FLOOR)).toEqual(NO_OVERHANG);
  });
});

describe("overhangs", () => {
  it("is false only when every side is clear", () => {
    expect(overhangs(NO_OVERHANG)).toBe(false);
    expect(overhangs({ ...NO_OVERHANG, south: 0.2 })).toBe(true);
  });
});

describe("rectOutsideFloor", () => {
  it("is false for a piece in the room", () => {
    expect(rectOutsideFloor(rect(2, 1.5), FLOOR)).toBe(false);
  });

  it("is false for a piece that only crosses a wall", () => {
    // Half in the room is still in the room, and reads as a wall crossing.
    expect(rectOutsideFloor(rect(0, 1.5), FLOOR)).toBe(false);
  });

  it("is true for a piece that misses the floor altogether", () => {
    expect(rectOutsideFloor(rect(-2, 1.5), FLOOR)).toBe(true);
    expect(rectOutsideFloor(rect(2, 5), FLOOR)).toBe(true);
  });
});
