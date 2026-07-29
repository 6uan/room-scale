/**
 * An oriented rectangle on the floor plane: a footprint that has been turned.
 *
 * Footprints are rectangles during the MVP, but not axis-aligned ones — a sofa
 * at 30° is an ordinary thing to want, and an axis-aligned box would either
 * refuse it or measure the wrong area. Everything that asks a spatial question
 * about a piece of furniture asks it of this shape.
 *
 * ## Which way a positive angle turns
 *
 * `rotationRadians` turns the rectangle's own +X axis toward +Z:
 *
 *     worldX = centerX + localX·cos θ − localZ·sin θ
 *     worldZ = centerZ + localX·sin θ + localZ·cos θ
 *
 * In a plan view screen Y follows Z, so that reads clockwise on screen, which
 * is also the direction a 2D canvas rotates in — the drawing and this module
 * agree without a correction. A right-handed Y-up scene turns the other way,
 * so the perspective view in step 20 takes the negative of this angle. That
 * sign lives at the renderer, not here.
 */

import type { FloorPoint } from "./plan-projection";

export type OrientedRect = {
  readonly center: FloorPoint;
  /** The extent along the rectangle's own X axis, before it is turned. */
  readonly widthMeters: number;
  /** The extent along the rectangle's own Z axis, before it is turned. */
  readonly depthMeters: number;
  readonly rotationRadians: number;
};

/** The four corners in world coordinates, going round the rectangle. */
export function orientedRectCorners(
  rect: OrientedRect,
): readonly [FloorPoint, FloorPoint, FloorPoint, FloorPoint] {
  const halfWidth = rect.widthMeters / 2;
  const halfDepth = rect.depthMeters / 2;

  return [
    toWorld(rect, -halfWidth, -halfDepth),
    toWorld(rect, halfWidth, -halfDepth),
    toWorld(rect, halfWidth, halfDepth),
    toWorld(rect, -halfWidth, halfDepth),
  ];
}

/**
 * Whether a point lies on the rectangle. The boundary counts as on it: a click
 * exactly on an edge means the piece under the pointer, not a miss.
 */
export function orientedRectContains(
  rect: OrientedRect,
  point: FloorPoint,
): boolean {
  const local = toLocal(rect, point);
  return (
    Math.abs(local.xMeters) <= rect.widthMeters / 2 &&
    Math.abs(local.zMeters) <= rect.depthMeters / 2
  );
}

/**
 * A world point in the rectangle's own frame: X along its width, Z across its
 * depth, both measured from its center. Point tests are simplest once the
 * rectangle has been turned back to face the axes.
 */
export function orientedRectLocalPoint(
  rect: OrientedRect,
  point: FloorPoint,
): FloorPoint {
  return toLocal(rect, point);
}

function toWorld(
  rect: OrientedRect,
  localX: number,
  localZ: number,
): FloorPoint {
  const cos = Math.cos(rect.rotationRadians);
  const sin = Math.sin(rect.rotationRadians);
  return {
    xMeters: rect.center.xMeters + localX * cos - localZ * sin,
    zMeters: rect.center.zMeters + localX * sin + localZ * cos,
  };
}

/** A world point in the rectangle's own frame: the rotation undone. */
function toLocal(rect: OrientedRect, point: FloorPoint): FloorPoint {
  const cos = Math.cos(rect.rotationRadians);
  const sin = Math.sin(rect.rotationRadians);
  const dx = point.xMeters - rect.center.xMeters;
  const dz = point.zMeters - rect.center.zMeters;
  return {
    xMeters: dx * cos + dz * sin,
    zMeters: -dx * sin + dz * cos,
  };
}
