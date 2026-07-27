/**
 * Panning and zooming the plan.
 *
 * A `PlanProjection` is already the whole transform between the floor and the
 * screen — a scale and an origin. Panning moves the origin; zooming changes the
 * scale and moves the origin to compensate. So there is no separate camera to
 * keep in step with the drawing: the thing being moved is the drawing's own
 * projection, and everything that reads it — the hit testing included — follows
 * for nothing.
 *
 * ## Zooming toward a point
 *
 * Zoom that ignores the pointer sends whatever you were looking at off the
 * screen. The rule here is that the floor point under the pointer does not
 * move: find it before the scale changes, then place the origin so it lands
 * back under the same pixel afterwards.
 */

import {
  unprojectPoint,
  type PixelPoint,
  type PlanProjection,
} from "./plan-projection";

/**
 * How far the plan can be scaled from the size it was fitted at.
 *
 * Out to a third: an apartment already fits, so zooming out is for putting a
 * gap around it, not for finding it. In to eight times: at that scale an inch
 * is a comfortable target, which is as fine as a tape measure is honest.
 */
export const MIN_ZOOM = 1 / 3;
export const MAX_ZOOM = 8;

/** Moves the plan by a distance on screen, leaving the scale alone. */
export function panBy(
  projection: PlanProjection,
  dxPixels: number,
  dyPixels: number,
): PlanProjection {
  return {
    ...projection,
    originX: projection.originX + dxPixels,
    originY: projection.originY + dyPixels,
  };
}

/**
 * Scales the plan about a point on screen, keeping the floor under it still.
 *
 * `factor` multiplies the current scale; the result is held between `minimum`
 * and `maximum` pixels per meter so a stray gesture cannot lose the drawing.
 */
export function zoomAt(
  projection: PlanProjection,
  factor: number,
  at: PixelPoint,
  minimum: number,
  maximum: number,
): PlanProjection {
  const anchor = unprojectPoint(projection, at);
  if (anchor === null || !(factor > 0)) {
    return projection;
  }

  const pixelsPerMeter = clamp(
    projection.pixelsPerMeter * factor,
    minimum,
    maximum,
  );

  return {
    pixelsPerMeter,
    originX: at.x - anchor.xMeters * pixelsPerMeter,
    originY: at.y - anchor.zMeters * pixelsPerMeter,
  };
}

/** How far the plan is scaled from the projection it was fitted at. */
export function zoomLevel(
  projection: PlanProjection,
  fitted: PlanProjection,
): number {
  return fitted.pixelsPerMeter > 0
    ? projection.pixelsPerMeter / fitted.pixelsPerMeter
    : 1;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
