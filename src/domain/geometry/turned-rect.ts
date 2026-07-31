/**
 * A rectangle anchored at its north-west corner and turned about that corner.
 *
 * This is the shape of a room part. The angle turns the rect's local frame
 * about its stored corner; where an *edit* pivots is the caller's business —
 * the room editor spins a section about its center and recomputes this corner
 * — but the corner is always a physical corner of the shape, which is what
 * keeps the X and Y somebody reads a real tape measurement.
 *
 * A positive angle turns the part's +X axis toward +Z, the same convention as
 * `OrientedRect`: clockwise as a plan is read.
 *
 * ## Exactness
 *
 * Every union measurement here dispatches: parts that are not turned go
 * through the axis-aligned cell decomposition in `rect-union.ts`, bit for bit
 * the arithmetic they have always used. Only a union with a turned part in it
 * pays for the general path — inclusion–exclusion over convex clips, exact
 * apart from floating point. A bounding box is never substituted for a shape.
 */

import {
  orientedRectCorners,
  orientedRectLocalPoint,
  type OrientedRect,
} from "./oriented-rect";
import type { FloorPoint } from "./plan-projection";
import {
  polygonArea,
  rectUnionArea,
  rectUnionBounds,
  orientedRectUnionOverlapArea,
  type AxisAlignedRect,
} from "./rect-union";

export type TurnedRect = AxisAlignedRect & {
  readonly rotationRadians: number;
};

/** A point in the rect's own frame — X along its width, from its corner. */
export function turnedRectLocalPoint(
  rect: TurnedRect,
  point: FloorPoint,
): FloorPoint {
  const cos = Math.cos(rect.rotationRadians);
  const sin = Math.sin(rect.rotationRadians);
  const dx = point.xMeters - rect.origin.xMeters;
  const dz = point.zMeters - rect.origin.zMeters;
  return {
    xMeters: dx * cos + dz * sin,
    zMeters: -dx * sin + dz * cos,
  };
}

/** The same point put back on the floor. */
export function turnedRectFloorPoint(
  rect: TurnedRect,
  local: FloorPoint,
): FloorPoint {
  const cos = Math.cos(rect.rotationRadians);
  const sin = Math.sin(rect.rotationRadians);
  return {
    xMeters: rect.origin.xMeters + local.xMeters * cos - local.zMeters * sin,
    zMeters: rect.origin.zMeters + local.xMeters * sin + local.zMeters * cos,
  };
}

/** The four corners on the floor, going round from the anchor corner. */
export function turnedRectCorners(
  rect: TurnedRect,
): readonly [FloorPoint, FloorPoint, FloorPoint, FloorPoint] {
  return [
    rect.origin,
    turnedRectFloorPoint(rect, { xMeters: rect.widthMeters, zMeters: 0 }),
    turnedRectFloorPoint(rect, {
      xMeters: rect.widthMeters,
      zMeters: rect.depthMeters,
    }),
    turnedRectFloorPoint(rect, { xMeters: 0, zMeters: rect.depthMeters }),
  ];
}

/** Whether a point lies on the rect. The boundary counts, as it does everywhere. */
export function turnedRectContains(
  rect: TurnedRect,
  point: FloorPoint,
): boolean {
  const local = turnedRectLocalPoint(rect, point);
  return (
    local.xMeters >= 0 &&
    local.xMeters <= rect.widthMeters &&
    local.zMeters >= 0 &&
    local.zMeters <= rect.depthMeters
  );
}

/** The same rect described by its center, for the theorems that want one. */
export function turnedRectAsOriented(rect: TurnedRect): OrientedRect {
  return {
    center: turnedRectFloorPoint(rect, {
      xMeters: rect.widthMeters / 2,
      zMeters: rect.depthMeters / 2,
    }),
    widthMeters: rect.widthMeters,
    depthMeters: rect.depthMeters,
    rotationRadians: rect.rotationRadians,
  };
}

export function turnedUnionContains(
  rects: readonly TurnedRect[],
  point: FloorPoint,
): boolean {
  return rects.some((rect) => turnedRectContains(rect, point));
}

/** The smallest axis-aligned rectangle containing every rect. */
export function turnedUnionBounds(
  rects: readonly TurnedRect[],
): AxisAlignedRect | null {
  return rectUnionBounds(rects.map(turnedRectBounds));
}

function turnedRectBounds(rect: TurnedRect): AxisAlignedRect {
  if (rect.rotationRadians === 0) {
    return rect;
  }
  const corners = turnedRectCorners(rect);
  const xs = corners.map((corner) => corner.xMeters);
  const zs = corners.map((corner) => corner.zMeters);
  const west = Math.min(...xs);
  const north = Math.min(...zs);
  return {
    origin: { xMeters: west, zMeters: north },
    widthMeters: Math.max(...xs) - west,
    depthMeters: Math.max(...zs) - north,
  };
}

/** Exact area of the union, counting overlapping parts once. */
export function turnedUnionArea(rects: readonly TurnedRect[]): number {
  if (rects.every((rect) => rect.rotationRadians === 0)) {
    return rectUnionArea(rects);
  }
  return inclusionExclusionArea(rects, null);
}

/**
 * Area shared by an oriented furniture footprint and a union of turned rects.
 * Part overlap is counted once, exactly as `orientedRectUnionOverlapArea` does
 * for the unturned case it still handles.
 */
export function orientedRectTurnedUnionOverlapArea(
  footprint: OrientedRect,
  rects: readonly TurnedRect[],
): number {
  if (rects.every((rect) => rect.rotationRadians === 0)) {
    return orientedRectUnionOverlapArea(footprint, rects);
  }
  return inclusionExclusionArea(rects, footprint);
}

/**
 * |A ∪ B ∪ …| by inclusion–exclusion: every non-empty subset contributes its
 * intersection's area, added or subtracted by the subset's size. Intersections
 * of convex shapes are convex, so each one is a chain of half-plane clips.
 *
 * The subset count is 2ⁿ − 1, which is fine for the handful of parts a room
 * has and would not be for a hundred; a room with that many parts has bigger
 * problems than this loop.
 *
 * With `base` supplied, every intersection is additionally clipped to it,
 * which turns the union's area into the area of `base ∩ (A ∪ B ∪ …)`.
 */
function inclusionExclusionArea(
  rects: readonly TurnedRect[],
  base: OrientedRect | null,
): number {
  const basePolygon = base === null ? null : [...orientedRectCorners(base)];
  let area = 0;

  for (let subset = 1; subset < 1 << rects.length; subset += 1) {
    let polygon: readonly FloorPoint[] | null = basePolygon;
    let size = 0;

    for (let index = 0; index < rects.length; index += 1) {
      if ((subset & (1 << index)) === 0) {
        continue;
      }
      const rect = rects[index];
      if (rect === undefined) {
        continue;
      }
      size += 1;
      polygon =
        polygon === null
          ? [...turnedRectCorners(rect)]
          : clipToTurnedRect(polygon, rect);
      if (polygon.length === 0) {
        break;
      }
    }

    if (polygon !== null && polygon.length > 0) {
      area += (size % 2 === 1 ? 1 : -1) * polygonArea(polygon);
    }
  }

  return area;
}

/**
 * Sutherland–Hodgman against the rect's four edges, which is simplest with the
 * rect turned back to face the axes: carry the polygon into the rect's own
 * frame, clip against the plain box, and carry the survivors back. Rotation
 * preserves area, so clipping in either frame measures the same thing.
 */
function clipToTurnedRect(
  polygon: readonly FloorPoint[],
  rect: TurnedRect,
): FloorPoint[] {
  const oriented = turnedRectAsOriented(rect);
  const local = polygon.map((point) => orientedRectLocalPoint(oriented, point));
  const half = {
    xMeters: rect.widthMeters / 2,
    zMeters: rect.depthMeters / 2,
  };

  let clipped = local;
  for (const edge of [
    (point: FloorPoint) => point.xMeters + half.xMeters,
    (point: FloorPoint) => half.xMeters - point.xMeters,
    (point: FloorPoint) => point.zMeters + half.zMeters,
    (point: FloorPoint) => half.zMeters - point.zMeters,
  ]) {
    clipped = clipToHalfPlane(clipped, edge);
    if (clipped.length === 0) {
      return [];
    }
  }

  const cos = Math.cos(rect.rotationRadians);
  const sin = Math.sin(rect.rotationRadians);
  return clipped.map((point) => ({
    xMeters:
      oriented.center.xMeters + point.xMeters * cos - point.zMeters * sin,
    zMeters:
      oriented.center.zMeters + point.xMeters * sin + point.zMeters * cos,
  }));
}

/** Keeps the side of the polygon where `inside` is not negative. */
function clipToHalfPlane(
  polygon: readonly FloorPoint[],
  inside: (point: FloorPoint) => number,
): FloorPoint[] {
  const result: FloorPoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    if (current === undefined || previous === undefined) {
      continue;
    }
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside >= 0 !== previousInside >= 0) {
      const ratio = previousInside / (previousInside - currentInside);
      result.push({
        xMeters:
          previous.xMeters + (current.xMeters - previous.xMeters) * ratio,
        zMeters:
          previous.zMeters + (current.zMeters - previous.zMeters) * ratio,
      });
    }
    if (currentInside >= 0) {
      result.push(current);
    }
  }
  return result;
}
