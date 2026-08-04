/**
 * Convex polygons: the shape a room part takes once a corner is cut off.
 *
 * A rectangle is already one of these, which is the whole point — hand any
 * function here a rectangle's corners and it gives the rectangle's answer. So
 * the rect-shaped helpers around it become thin wrappers rather than a second
 * implementation drifting out of step with this one.
 *
 * Convexity is the property being preserved, not rectangularity. It is what
 * the Separating Axis Theorem needs, what makes an intersection a chain of
 * half-plane clips, and what lets containment be a single pass over the edges.
 * A rectangle with corners clipped is still convex by construction, so none of
 * that is given up to get one.
 *
 * ## Winding
 *
 * Nothing here assumes which way round a polygon runs. Callers wind theirs
 * however their own geometry falls out — a room part goes round from its
 * anchor corner, a clipped polygon comes back in whatever order the clip
 * produced — and a function that guessed would silently turn "inside" into
 * "outside". So the signed area is asked which way this particular polygon
 * goes, and the side tests are flipped to match.
 */

import type { FloorPoint } from "./plan-projection";

/** A direction on the floor plane. Unit length, so projections are distances. */
export type FloorAxis = { readonly x: number; readonly z: number };

/**
 * Shoelace area, keeping its sign: positive one way round, negative the other.
 *
 * The magnitude is the area and the sign is the winding, and both callers here
 * want one of the two. `polygonArea` is this without the sign.
 */
export function polygonSignedArea(points: readonly FloorPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    if (point !== undefined && next !== undefined) {
      twiceArea += point.xMeters * next.zMeters - next.xMeters * point.zMeters;
    }
  }
  return twiceArea / 2;
}

/**
 * Which side of the line through `from`→`to` a point falls on, as a signed
 * area: zero exactly on the line, and opposite signs on opposite sides. The
 * magnitude is twice the triangle's area, which is what makes it usable as the
 * interpolation weight in `clipPolygonToConvex`.
 */
function sideOf(from: FloorPoint, to: FloorPoint, point: FloorPoint): number {
  return (
    (to.xMeters - from.xMeters) * (point.zMeters - from.zMeters) -
    (to.zMeters - from.zMeters) * (point.xMeters - from.xMeters)
  );
}

/** +1 or −1 for which way the polygon runs, or 0 if it encloses nothing. */
function orientationOf(polygon: readonly FloorPoint[]): number {
  return Math.sign(polygonSignedArea(polygon));
}

/**
 * Whether a point lies on a convex polygon.
 *
 * The boundary counts, as it does everywhere else in this domain: a sofa
 * pushed flush against a wall is in the room, not half out of it.
 *
 * A polygon enclosing no area contains nothing. That is a degenerate shape
 * rather than an infinitely thin one worth having opinions about, and saying
 * "no" keeps a room mid-drag from claiming the whole floor.
 */
export function convexPolygonContains(
  polygon: readonly FloorPoint[],
  point: FloorPoint,
): boolean {
  const orientation = orientationOf(polygon);
  if (orientation === 0) {
    return false;
  }

  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index];
    const to = polygon[(index + 1) % polygon.length];
    if (from === undefined || to === undefined) {
      continue;
    }
    if (orientation * sideOf(from, to, point) < 0) {
      return false;
    }
  }
  return true;
}

/**
 * The separating axes a convex polygon offers: one unit normal per edge.
 *
 * Which way a normal points does not matter. Negating an axis mirrors both
 * shadows cast on it, and the overlap between two mirrored intervals is the
 * interval it was, so a rectangle's four edge normals give exactly what its
 * two distinct directions gave.
 *
 * A repeated point is not an edge and has no direction to offer, so it is
 * skipped rather than dividing by its own zero length.
 */
export function convexPolygonAxes(
  polygon: readonly FloorPoint[],
): readonly FloorAxis[] {
  const axes: FloorAxis[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index];
    const to = polygon[(index + 1) % polygon.length];
    if (from === undefined || to === undefined) {
      continue;
    }
    const dx = to.xMeters - from.xMeters;
    const dz = to.zMeters - from.zMeters;
    const length = Math.hypot(dx, dz);
    if (length === 0) {
      continue;
    }
    axes.push({ x: -dz / length, z: dx / length });
  }
  return axes;
}

/**
 * The polygon clipped to a convex clipper, by Sutherland–Hodgman.
 *
 * Each of the clipper's edges is a half-plane, and the polygon is cut against
 * them one after another; what survives every cut is the intersection. Both
 * shapes being convex is what makes this exact — the result is a single
 * polygon rather than the several pieces a concave clipper could leave.
 *
 * Comes back empty when the two do not meet, and when the clipper encloses no
 * area: an intersection with nothing is nothing.
 */
export function clipPolygonToConvex(
  polygon: readonly FloorPoint[],
  clipper: readonly FloorPoint[],
): FloorPoint[] {
  const orientation = orientationOf(clipper);
  if (orientation === 0) {
    return [];
  }

  let clipped = [...polygon];
  for (
    let index = 0;
    index < clipper.length && clipped.length > 0;
    index += 1
  ) {
    const from = clipper[index];
    const to = clipper[(index + 1) % clipper.length];
    if (from === undefined || to === undefined) {
      continue;
    }
    clipped = clipToHalfPlane(clipped, from, to, orientation);
  }
  return clipped;
}

/** One Sutherland–Hodgman pass: what is left of the polygon on one side. */
function clipToHalfPlane(
  polygon: readonly FloorPoint[],
  from: FloorPoint,
  to: FloorPoint,
  orientation: number,
): FloorPoint[] {
  const kept: FloorPoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    if (current === undefined || previous === undefined) {
      continue;
    }

    const currentSide = orientation * sideOf(from, to, current);
    const previousSide = orientation * sideOf(from, to, previous);
    const currentInside = currentSide >= 0;
    const previousInside = previousSide >= 0;

    // An edge that crosses the line contributes the crossing point first. The
    // two side values are distances to the same line, so their ratio is where
    // along the edge it is cut — and the denominator cannot be zero here,
    // because the two sides differing means they are not both on it.
    if (currentInside !== previousInside) {
      const ratio = previousSide / (previousSide - currentSide);
      kept.push({
        xMeters:
          previous.xMeters + (current.xMeters - previous.xMeters) * ratio,
        zMeters:
          previous.zMeters + (current.zMeters - previous.zMeters) * ratio,
      });
    }
    if (currentInside) {
      kept.push(current);
    }
  }
  return kept;
}
