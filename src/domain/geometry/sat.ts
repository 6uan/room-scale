/**
 * Whether two oriented rectangles intersect, by the Separating Axis Theorem.
 *
 * ## The theorem
 *
 * Two convex shapes are apart if and only if there is some line onto which
 * their shadows do not touch. For rectangles it is enough to try four lines —
 * the two edge normals of each — because any gap between two rectangles is a
 * gap along one of their own edges. If all four shadows overlap, the shapes do.
 *
 * The alternative, comparing bounding boxes, is wrong in exactly the case this
 * application is for: a sofa turned 45° has a bounding box far larger than the
 * sofa, and would be reported as hitting a coffee table it clears easily.
 *
 * ## The amount
 *
 * The smallest of the four overlaps is the penetration depth: the least a piece
 * has to move for the two to come apart. That is the number worth telling
 * somebody, because it is the size of the problem they have to fix.
 */

import { convexPolygonAxes, type FloorAxis } from "./convex-polygon";
import { orientedRectCorners, type OrientedRect } from "./oriented-rect";
import type { FloorPoint } from "./plan-projection";

/**
 * How close counts as touching rather than overlapping.
 *
 * A millimeter. A console pushed flush against a sofa is a legitimate
 * arrangement, and the dimensions this application is given — a retailer's
 * rounded inches — are nowhere near precise enough to argue about less than
 * that. Reporting it would be a warning nobody could act on.
 */
export const CONTACT_TOLERANCE_METERS = 0.001;

/** The shadow a shape casts on an axis. */
type Shadow = { readonly min: number; readonly max: number };

export type RectOverlap = {
  /** The least distance one shape must move to clear the other. */
  readonly depthMeters: number;
};

/**
 * The overlap between two convex polygons, or null when they are apart.
 *
 * Touching is apart: a zero-width contact is two things next to each other.
 *
 * A shape offering no axes — fewer than two distinct points — cannot be shown
 * to overlap anything, so it reads as apart rather than as touching
 * everything. That is the safe way round for a shape being dragged through a
 * degenerate state.
 */
export function convexPolygonOverlap(
  a: readonly FloorPoint[],
  b: readonly FloorPoint[],
): RectOverlap | null {
  const axes = [...convexPolygonAxes(a), ...convexPolygonAxes(b)];
  if (axes.length === 0) {
    return null;
  }

  let depthMeters = Number.POSITIVE_INFINITY;

  for (const axis of axes) {
    const shadowA = shadowOn(a, axis);
    const shadowB = shadowOn(b, axis);
    const overlap =
      Math.min(shadowA.max, shadowB.max) - Math.max(shadowA.min, shadowB.min);

    // One clear axis is a proof of separation, so there is nothing left to ask.
    if (overlap <= CONTACT_TOLERANCE_METERS) {
      return null;
    }
    depthMeters = Math.min(depthMeters, overlap);
  }

  return { depthMeters };
}

/**
 * The overlap between two rectangles, or null when they are apart.
 *
 * A rectangle is a convex polygon, so this is the general test on its corners.
 * It tries four edge normals where two would do, and gets the same answer:
 * opposite edges are parallel, and negating an axis mirrors both shadows onto
 * it, which leaves the overlap between them exactly as it was.
 */
export function orientedRectOverlap(
  a: OrientedRect,
  b: OrientedRect,
): RectOverlap | null {
  return convexPolygonOverlap(orientedRectCorners(a), orientedRectCorners(b));
}

function shadowOn(corners: readonly FloorPoint[], axis: FloorAxis): Shadow {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const corner of corners) {
    const distance = corner.xMeters * axis.x + corner.zMeters * axis.z;
    min = Math.min(min, distance);
    max = Math.max(max, distance);
  }

  return { min, max };
}
