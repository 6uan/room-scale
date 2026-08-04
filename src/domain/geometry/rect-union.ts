import { clipPolygonToConvex, polygonSignedArea } from "./convex-polygon";
import { orientedRectCorners, type OrientedRect } from "./oriented-rect";
import type { FloorPoint } from "./plan-projection";

/** An axis-aligned rectangle described by its inside north-west corner. */
export type AxisAlignedRect = {
  readonly origin: FloorPoint;
  readonly widthMeters: number;
  readonly depthMeters: number;
};

export function axisAlignedRectContains(
  rect: AxisAlignedRect,
  point: FloorPoint,
): boolean {
  return (
    point.xMeters >= rect.origin.xMeters &&
    point.xMeters <= rect.origin.xMeters + rect.widthMeters &&
    point.zMeters >= rect.origin.zMeters &&
    point.zMeters <= rect.origin.zMeters + rect.depthMeters
  );
}

export function rectUnionContains(
  rects: readonly AxisAlignedRect[],
  point: FloorPoint,
): boolean {
  return rects.some((rect) => axisAlignedRectContains(rect, point));
}

/** Exact area of an axis-aligned rectangle union, including overlapping parts. */
export function rectUnionArea(rects: readonly AxisAlignedRect[]): number {
  return unionCells(rects).reduce(
    (area, cell) => area + cell.widthMeters * cell.depthMeters,
    0,
  );
}

/** The smallest axis-aligned rectangle containing every supplied rectangle. */
export function rectUnionBounds(
  rects: readonly AxisAlignedRect[],
): AxisAlignedRect | null {
  if (rects.length === 0) {
    return null;
  }
  const west = Math.min(...rects.map((rect) => rect.origin.xMeters));
  const north = Math.min(...rects.map((rect) => rect.origin.zMeters));
  const east = Math.max(
    ...rects.map((rect) => rect.origin.xMeters + rect.widthMeters),
  );
  const south = Math.max(
    ...rects.map((rect) => rect.origin.zMeters + rect.depthMeters),
  );
  return {
    origin: { xMeters: west, zMeters: north },
    widthMeters: east - west,
    depthMeters: south - north,
  };
}

/**
 * Area shared by an oriented furniture footprint and an axis-aligned union.
 *
 * Part overlap is counted once. Splitting the union at every part edge yields
 * disjoint cells, then ordinary polygon clipping measures the footprint in
 * each cell. The result is exact apart from floating-point arithmetic.
 */
export function orientedRectUnionOverlapArea(
  footprint: OrientedRect,
  rects: readonly AxisAlignedRect[],
): number {
  const polygon = [...orientedRectCorners(footprint)];
  return unionCells(rects).reduce(
    (area, cell) => area + polygonArea(clipPolygonToRect(polygon, cell)),
    0,
  );
}

/** Disjoint occupied cells made by all unique X and Z part boundaries. */
function unionCells(rects: readonly AxisAlignedRect[]): AxisAlignedRect[] {
  const xs = uniqueSorted(
    rects.flatMap((rect) => [
      rect.origin.xMeters,
      rect.origin.xMeters + rect.widthMeters,
    ]),
  );
  const zs = uniqueSorted(
    rects.flatMap((rect) => [
      rect.origin.zMeters,
      rect.origin.zMeters + rect.depthMeters,
    ]),
  );
  const cells: AxisAlignedRect[] = [];

  for (let x = 0; x < xs.length - 1; x += 1) {
    for (let z = 0; z < zs.length - 1; z += 1) {
      const west = xs[x];
      const east = xs[x + 1];
      const north = zs[z];
      const south = zs[z + 1];
      if (
        west === undefined ||
        east === undefined ||
        north === undefined ||
        south === undefined
      ) {
        continue;
      }
      const center = {
        xMeters: (west + east) / 2,
        zMeters: (north + south) / 2,
      };
      if (rectUnionContains(rects, center)) {
        cells.push({
          origin: { xMeters: west, zMeters: north },
          widthMeters: east - west,
          depthMeters: south - north,
        });
      }
    }
  }
  return cells;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/** The four corners of an axis-aligned rectangle, going round from its origin. */
export function axisAlignedRectCorners(
  rect: AxisAlignedRect,
): readonly [FloorPoint, FloorPoint, FloorPoint, FloorPoint] {
  const east = rect.origin.xMeters + rect.widthMeters;
  const south = rect.origin.zMeters + rect.depthMeters;
  return [
    rect.origin,
    { xMeters: east, zMeters: rect.origin.zMeters },
    { xMeters: east, zMeters: south },
    { xMeters: rect.origin.xMeters, zMeters: south },
  ];
}

/**
 * The polygon clipped to an axis-aligned rectangle, Sutherland–Hodgman.
 *
 * A rectangle is a convex clipper like any other; this is the general clip
 * against its corners.
 */
export function clipPolygonToRect(
  polygon: readonly FloorPoint[],
  rect: AxisAlignedRect,
): FloorPoint[] {
  return clipPolygonToConvex(polygon, axisAlignedRectCorners(rect));
}

/** Shoelace area of a simple polygon, in either winding. */
export function polygonArea(points: readonly FloorPoint[]): number {
  return Math.abs(polygonSignedArea(points));
}
