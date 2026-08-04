import { describe, expect, it } from "vitest";
import {
  clipPolygonToConvex,
  convexPolygonAxes,
  convexPolygonContains,
  convexUnionArea,
  polygonSignedArea,
} from "./convex-polygon";
import { orientedRectCorners } from "./oriented-rect";
import type { FloorPoint } from "./plan-projection";
import { polygonArea } from "./rect-union";
import { convexPolygonOverlap, orientedRectOverlap } from "./sat";
import { turnedRectContains, turnedRectCorners } from "./turned-rect";

function at(xMeters: number, zMeters: number): FloorPoint {
  return { xMeters, zMeters };
}

/** A square's corners, going round from its north-west one. */
function square(
  westMeters: number,
  northMeters: number,
  sideMeters: number,
): readonly FloorPoint[] {
  return [
    at(westMeters, northMeters),
    at(westMeters + sideMeters, northMeters),
    at(westMeters + sideMeters, northMeters + sideMeters),
    at(westMeters, northMeters + sideMeters),
  ];
}

/**
 * A four by four square with its south-east corner clipped off by one meter
 * each way — the shape a room part takes once a corner is cut, and the reason
 * any of this is general rather than rectangular.
 */
const CUT_CORNER: readonly FloorPoint[] = [
  at(0, 0),
  at(4, 0),
  at(4, 3),
  at(3, 4),
  at(0, 4),
];

describe("polygonSignedArea", () => {
  it("measures a square", () => {
    expect(polygonSignedArea(square(0, 0, 2))).toBeCloseTo(4, 10);
  });

  it("flips sign with the winding but keeps the magnitude", () => {
    const round = square(0, 0, 2);
    const back = [...round].reverse();
    expect(polygonSignedArea(back)).toBeCloseTo(-polygonSignedArea(round), 10);
  });

  it("measures the cut corner as the square less its triangle", () => {
    // Four by four is sixteen; the cut takes a one by one right triangle.
    expect(polygonSignedArea(CUT_CORNER)).toBeCloseTo(16 - 0.5, 10);
  });

  it("gives zero for a polygon enclosing nothing", () => {
    expect(polygonSignedArea([at(0, 0), at(1, 1), at(2, 2)])).toBeCloseTo(
      0,
      10,
    );
  });
});

describe("convexPolygonContains", () => {
  it("holds a point in the middle", () => {
    expect(convexPolygonContains(square(0, 0, 2), at(1, 1))).toBe(true);
  });

  it("excludes a point outside", () => {
    expect(convexPolygonContains(square(0, 0, 2), at(3, 1))).toBe(false);
  });

  it("counts the boundary as inside, as the rest of the domain does", () => {
    expect(convexPolygonContains(square(0, 0, 2), at(0, 1))).toBe(true);
    expect(convexPolygonContains(square(0, 0, 2), at(2, 2))).toBe(true);
  });

  it("does not care which way round the polygon runs", () => {
    const back = [...square(0, 0, 2)].reverse();
    expect(convexPolygonContains(back, at(1, 1))).toBe(true);
    expect(convexPolygonContains(back, at(3, 1))).toBe(false);
  });

  it("puts a point in the cut outside, where the square would hold it", () => {
    // (3.8, 3.8) is inside the four by four square and inside the triangle
    // taken off its south-east corner, which is the whole point of the cut.
    expect(convexPolygonContains(square(0, 0, 4), at(3.8, 3.8))).toBe(true);
    expect(convexPolygonContains(CUT_CORNER, at(3.8, 3.8))).toBe(false);
  });

  it("contains nothing when it encloses nothing", () => {
    expect(convexPolygonContains([at(0, 0), at(1, 1)], at(0.5, 0.5))).toBe(
      false,
    );
  });

  it("agrees with the rectangle test for a turned rectangle", () => {
    const rect = {
      origin: at(1, 2),
      widthMeters: 3,
      depthMeters: 2,
      rotationRadians: Math.PI / 5,
    };
    const corners = turnedRectCorners(rect);
    for (let x = -1; x <= 6; x += 0.5) {
      for (let z = -1; z <= 6; z += 0.5) {
        const point = at(x, z);
        expect(convexPolygonContains(corners, point)).toBe(
          turnedRectContains(rect, point),
        );
      }
    }
  });
});

describe("convexPolygonAxes", () => {
  it("gives one unit axis per edge", () => {
    const axes = convexPolygonAxes(square(0, 0, 2));
    expect(axes).toHaveLength(4);
    for (const axis of axes) {
      expect(Math.hypot(axis.x, axis.z)).toBeCloseTo(1, 10);
    }
  });

  it("skips a repeated point, which is not an edge", () => {
    expect(
      convexPolygonAxes([at(0, 0), at(2, 0), at(2, 0), at(2, 2), at(0, 2)]),
    ).toHaveLength(4);
  });

  it("gives nothing for a single point", () => {
    expect(convexPolygonAxes([at(1, 1)])).toHaveLength(0);
  });
});

describe("clipPolygonToConvex", () => {
  it("leaves a polygon already inside the clipper alone", () => {
    const clipped = clipPolygonToConvex(square(1, 1, 1), square(0, 0, 4));
    expect(polygonArea(clipped)).toBeCloseTo(1, 10);
  });

  it("measures a partial overlap", () => {
    // Two by two squares offset by one each way share a one by one corner.
    const clipped = clipPolygonToConvex(square(0, 0, 2), square(1, 1, 2));
    expect(polygonArea(clipped)).toBeCloseTo(1, 10);
  });

  it("comes back empty when the two are apart", () => {
    expect(clipPolygonToConvex(square(0, 0, 1), square(5, 5, 1))).toEqual([]);
  });

  it("clips against a cut corner, not against its bounding square", () => {
    // A one by one square in the clipped corner: the square would keep all of
    // it, and the cut keeps only the half left by the diagonal.
    const inCut = square(3, 3, 1);
    expect(
      polygonArea(clipPolygonToConvex(inCut, square(0, 0, 4))),
    ).toBeCloseTo(1, 10);
    expect(polygonArea(clipPolygonToConvex(inCut, CUT_CORNER))).toBeCloseTo(
      0.5,
      10,
    );
  });

  it("does not care which way round the clipper runs", () => {
    const back = [...square(1, 1, 2)].reverse();
    expect(polygonArea(clipPolygonToConvex(square(0, 0, 2), back))).toBeCloseTo(
      1,
      10,
    );
  });

  it("comes back empty for a clipper enclosing nothing", () => {
    expect(clipPolygonToConvex(square(0, 0, 2), [at(0, 0), at(1, 1)])).toEqual(
      [],
    );
  });
});

describe("convexPolygonOverlap", () => {
  it("gives the same answers as the rectangle test it generalizes", () => {
    const a = {
      center: at(0, 0),
      widthMeters: 2,
      depthMeters: 1,
      rotationRadians: 0,
    };
    for (const rotationRadians of [0, Math.PI / 4, Math.PI / 3]) {
      for (let x = -3; x <= 3; x += 0.25) {
        const b = {
          center: at(x, 0.25),
          widthMeters: 2,
          depthMeters: 1,
          rotationRadians,
        };
        expect(
          convexPolygonOverlap(orientedRectCorners(a), orientedRectCorners(b)),
        ).toEqual(orientedRectOverlap(a, b));
      }
    }
  });

  it("clears a shape that sits in a cut corner", () => {
    // A small square tucked into the clipped corner. It overlaps the uncut
    // square and clears the cut one — the case the whole cut exists for.
    const tucked = [at(3.6, 3.6), at(4.4, 3.6), at(4.4, 4.4), at(3.6, 4.4)];
    expect(convexPolygonOverlap(square(0, 0, 4), tucked)).not.toBeNull();
    expect(convexPolygonOverlap(CUT_CORNER, tucked)).toBeNull();
  });

  it("reports how far in, as the least distance out", () => {
    // Two by two squares overlapping by half a meter along X only.
    const overlap = convexPolygonOverlap(square(0, 0, 2), square(1.5, 0, 2));
    expect(overlap?.depthMeters).toBeCloseTo(0.5, 10);
  });

  it("treats edge to edge contact as apart", () => {
    expect(convexPolygonOverlap(square(0, 0, 2), square(2, 0, 2))).toBeNull();
  });

  it("reads a degenerate shape as apart rather than as touching everything", () => {
    expect(convexPolygonOverlap(square(0, 0, 2), [at(1, 1)])).toBeNull();
  });
});

describe("convexUnionArea", () => {
  it("measures one polygon as itself", () => {
    expect(convexUnionArea([square(0, 0, 2)])).toBeCloseTo(4, 10);
    expect(convexUnionArea([CUT_CORNER])).toBeCloseTo(16 - 0.5, 10);
  });

  it("counts the part two polygons share exactly once", () => {
    // Two 2 m squares overlapping over a 1 m square: 4 + 4 − 1.
    expect(convexUnionArea([square(0, 0, 2), square(1, 1, 2)])).toBeCloseTo(
      7,
      10,
    );
  });

  it("adds nothing for polygons that do not meet", () => {
    expect(convexUnionArea([square(0, 0, 2), square(9, 9, 2)])).toBeCloseTo(
      8,
      10,
    );
  });

  it("measures what a base shares with the union, not the whole union", () => {
    // A 1 m square in the clipped corner keeps only the half the cut leaves.
    expect(convexUnionArea([CUT_CORNER], square(3, 3, 1))).toBeCloseTo(0.5, 10);
    // And a base that misses everything shares nothing.
    expect(convexUnionArea([CUT_CORNER], square(9, 9, 1))).toBeCloseTo(0, 10);
  });

  it("does not care which way round each polygon runs", () => {
    const back = [...square(1, 1, 2)].reverse();
    expect(convexUnionArea([square(0, 0, 2), back])).toBeCloseTo(7, 10);
  });

  it("has no area at all with nothing in it", () => {
    expect(convexUnionArea([])).toBe(0);
  });
});
