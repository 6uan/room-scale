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
    (area, cell) => area + polygonArea(clipToRect(polygon, cell)),
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

type ClipEdge = "west" | "east" | "north" | "south";

/** The polygon clipped to an axis-aligned rectangle, Sutherland–Hodgman. */
export function clipPolygonToRect(
  polygon: readonly FloorPoint[],
  rect: AxisAlignedRect,
): FloorPoint[] {
  return clipToRect(polygon, rect);
}

function clipToRect(
  polygon: readonly FloorPoint[],
  rect: AxisAlignedRect,
): FloorPoint[] {
  return (["west", "east", "north", "south"] as const).reduce(
    (points, edge) => clipEdge(points, rect, edge),
    [...polygon],
  );
}

function clipEdge(
  polygon: readonly FloorPoint[],
  rect: AxisAlignedRect,
  edge: ClipEdge,
): FloorPoint[] {
  const result: FloorPoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    if (current === undefined || previous === undefined) {
      continue;
    }
    const currentInside = insideEdge(current, rect, edge);
    const previousInside = insideEdge(previous, rect, edge);
    if (currentInside !== previousInside) {
      result.push(edgeIntersection(previous, current, rect, edge));
    }
    if (currentInside) {
      result.push(current);
    }
  }
  return result;
}

function insideEdge(
  point: FloorPoint,
  rect: AxisAlignedRect,
  edge: ClipEdge,
): boolean {
  switch (edge) {
    case "west":
      return point.xMeters >= rect.origin.xMeters;
    case "east":
      return point.xMeters <= rect.origin.xMeters + rect.widthMeters;
    case "north":
      return point.zMeters >= rect.origin.zMeters;
    case "south":
      return point.zMeters <= rect.origin.zMeters + rect.depthMeters;
  }
}

function edgeIntersection(
  from: FloorPoint,
  to: FloorPoint,
  rect: AxisAlignedRect,
  edge: ClipEdge,
): FloorPoint {
  if (edge === "west" || edge === "east") {
    const xMeters =
      edge === "west"
        ? rect.origin.xMeters
        : rect.origin.xMeters + rect.widthMeters;
    const ratio = (xMeters - from.xMeters) / (to.xMeters - from.xMeters);
    return {
      xMeters,
      zMeters: from.zMeters + (to.zMeters - from.zMeters) * ratio,
    };
  }
  const zMeters =
    edge === "north"
      ? rect.origin.zMeters
      : rect.origin.zMeters + rect.depthMeters;
  const ratio = (zMeters - from.zMeters) / (to.zMeters - from.zMeters);
  return {
    xMeters: from.xMeters + (to.xMeters - from.xMeters) * ratio,
    zMeters,
  };
}

/** Shoelace area of a simple polygon, in either winding. */
export function polygonArea(points: readonly FloorPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    if (point !== undefined && next !== undefined) {
      twiceArea += point.xMeters * next.zMeters - next.xMeters * point.zMeters;
    }
  }
  return Math.abs(twiceArea) / 2;
}
