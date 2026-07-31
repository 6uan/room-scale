import { describe, expect, it } from "vitest";
import {
  orientedRectTurnedUnionOverlapArea,
  turnedRectAsOriented,
  turnedRectContains,
  turnedRectCorners,
  turnedRectFloorPoint,
  turnedRectLocalPoint,
  turnedUnionArea,
  turnedUnionBounds,
  turnedUnionContains,
  type TurnedRect,
} from "./turned-rect";

const FLAT: TurnedRect = {
  origin: { xMeters: 1, zMeters: 2 },
  widthMeters: 4,
  depthMeters: 2,
  rotationRadians: 0,
};

/** A 2 × 2 square turned 45° about its corner at the origin. */
const DIAMOND: TurnedRect = {
  origin: { xMeters: 0, zMeters: 0 },
  widthMeters: 2,
  depthMeters: 2,
  rotationRadians: Math.PI / 4,
};

describe("turnedRect frames", () => {
  it("pivots on its origin corner, which never moves", () => {
    expect(turnedRectCorners(DIAMOND)[0]).toEqual({ xMeters: 0, zMeters: 0 });

    const far = turnedRectCorners(DIAMOND)[2];
    expect(far.xMeters).toBeCloseTo(0, 10);
    expect(far.zMeters).toBeCloseTo(2 * Math.SQRT2, 10);
  });

  it("round-trips a point through the local frame", () => {
    const local = { xMeters: 1.5, zMeters: 0.5 };
    const floor = turnedRectFloorPoint(DIAMOND, local);
    const back = turnedRectLocalPoint(DIAMOND, floor);

    expect(back.xMeters).toBeCloseTo(local.xMeters, 12);
    expect(back.zMeters).toBeCloseTo(local.zMeters, 12);
  });

  it("keeps the unturned frame exact", () => {
    expect(turnedRectCorners(FLAT)).toEqual([
      { xMeters: 1, zMeters: 2 },
      { xMeters: 5, zMeters: 2 },
      { xMeters: 5, zMeters: 4 },
      { xMeters: 1, zMeters: 4 },
    ]);
  });

  it("contains points by the turned shape, not its bounding box", () => {
    // Inside the diamond's bounding box but outside the diamond itself.
    expect(turnedRectContains(DIAMOND, { xMeters: 1.5, zMeters: 0.2 })).toBe(
      false,
    );
    expect(turnedRectContains(DIAMOND, { xMeters: 0, zMeters: 1 })).toBe(true);
    // The boundary counts.
    expect(turnedRectContains(DIAMOND, { xMeters: 0, zMeters: 0 })).toBe(true);
  });

  it("describes the same rectangle by its center", () => {
    const oriented = turnedRectAsOriented(DIAMOND);

    expect(oriented.widthMeters).toBe(2);
    expect(oriented.rotationRadians).toBe(Math.PI / 4);
    expect(oriented.center.xMeters).toBeCloseTo(0, 10);
    expect(oriented.center.zMeters).toBeCloseTo(Math.SQRT2, 10);
  });
});

describe("turnedUnion measurements", () => {
  it("matches the axis-aligned union exactly when nothing is turned", () => {
    const rects: TurnedRect[] = [
      {
        origin: { xMeters: 0, zMeters: 0 },
        widthMeters: 3,
        depthMeters: 3,
        rotationRadians: 0,
      },
      {
        origin: { xMeters: 2, zMeters: 2 },
        widthMeters: 3,
        depthMeters: 2,
        rotationRadians: 0,
      },
    ];

    // The same value `rectUnionArea` has always produced, bit for bit.
    expect(turnedUnionArea(rects)).toBe(14);
    expect(turnedUnionContains(rects, { xMeters: 4, zMeters: 1 })).toBe(false);
    expect(turnedUnionBounds(rects)).toEqual({
      origin: { xMeters: 0, zMeters: 0 },
      widthMeters: 5,
      depthMeters: 4,
    });
  });

  it("keeps the area of disjoint turned parts a plain sum", () => {
    const apart: TurnedRect[] = [
      DIAMOND,
      { ...FLAT, origin: { xMeters: 10, zMeters: 10 } },
    ];

    expect(turnedUnionArea(apart)).toBeCloseTo(4 + 8, 10);
  });

  it("counts the overlap of a turned part once", () => {
    // A diamond pivoted at the square's north edge: its southern half — a
    // triangle of area 2 — lies inside the square, its northern half outside.
    // Union area is the square plus that northern half: 24 + 2.
    const square: TurnedRect = {
      origin: { xMeters: -2, zMeters: 0 },
      widthMeters: 6,
      depthMeters: 4,
      rotationRadians: 0,
    };
    const diamond: TurnedRect = {
      origin: { xMeters: 0, zMeters: 0 },
      widthMeters: 2,
      depthMeters: 2,
      rotationRadians: -Math.PI / 4,
    };

    expect(turnedUnionArea([square, diamond])).toBeCloseTo(26, 10);
  });

  it("bounds a turned part by its corners", () => {
    const bounds = turnedUnionBounds([DIAMOND]);
    if (bounds === null) {
      throw new Error("one rect always has bounds");
    }

    expect(bounds.origin.xMeters).toBeCloseTo(-Math.SQRT2, 10);
    expect(bounds.origin.zMeters).toBeCloseTo(0, 10);
    expect(bounds.widthMeters).toBeCloseTo(2 * Math.SQRT2, 10);
    expect(bounds.depthMeters).toBeCloseTo(2 * Math.SQRT2, 10);
  });

  it("measures a footprint against the turned union, not a box around it", () => {
    // A unit square whose center sits on the diamond's west shoulder: half of
    // it lies inside the diamond, half outside.
    const footprint = {
      center: { xMeters: -Math.SQRT2 / 2, zMeters: Math.SQRT2 / 2 },
      widthMeters: 1,
      depthMeters: 1,
      rotationRadians: Math.PI / 4,
    };

    expect(
      orientedRectTurnedUnionOverlapArea(footprint, [DIAMOND]),
    ).toBeCloseTo(0.5, 10);
  });

  it("still counts a footprint's overlap once across overlapping parts", () => {
    // Two overlapping turned copies of the diamond under a footprint that
    // covers them both: the overlap is the diamond's area, not double it.
    const footprint = {
      center: { xMeters: 0, zMeters: Math.SQRT2 },
      widthMeters: 10,
      depthMeters: 10,
      rotationRadians: 0,
    };

    expect(
      orientedRectTurnedUnionOverlapArea(footprint, [DIAMOND, DIAMOND]),
    ).toBeCloseTo(4, 10);
  });
});
