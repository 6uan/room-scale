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
  projectPoint,
  unprojectPoint,
  type FloorExtent,
  type FloorPoint,
  type PixelPoint,
  type PixelSize,
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

/**
 * The most one gesture may scale the plan by.
 *
 * A mouse wheel reports about a hundred units per notch and a trackpad pinch
 * reports ones, so the same rule applied to both made a single notch a third of
 * the way in or out. That is a plan you have to chase. Capping the step rather
 * than tuning the rate per device keeps a pinch as smooth as it was and makes a
 * notch a step you can follow.
 */
export const MAX_ZOOM_STEP = 1.15;

/**
 * How much of the apartment must stay on screen.
 *
 * Not a fraction of it: a bare strip is enough to grab and pull back, and
 * insisting on more would fight somebody deliberately working on one corner at
 * high zoom. This is the difference between a plan you have pushed aside and a
 * plan you have lost.
 */
export const MIN_VISIBLE_PIXELS = 48;

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

/**
 * The same projection, moved as little as it takes to keep the plan reachable.
 *
 * Panning has no natural limit — the origin is just a number of pixels — so
 * without this a stray trackpad swipe sends the apartment off the edge and
 * leaves an empty grid with no clue which way to go back. Zoom to fit is one
 * key away, but a tool should not need rescuing.
 *
 * `rect` is the apartment in floor coordinates. The result guarantees at least
 * `MIN_VISIBLE_PIXELS` of it overlaps the viewport on each axis, and changes
 * nothing when that is already true — so it is safe to run after every pan and
 * every zoom.
 */
export function clampToViewport(
  projection: PlanProjection,
  rect: { readonly origin: FloorPoint; readonly extent: FloorExtent },
  viewport: PixelSize,
  minVisiblePixels = MIN_VISIBLE_PIXELS,
): PlanProjection {
  if (!(projection.pixelsPerMeter > 0)) {
    return projection;
  }

  const topLeft = projectPoint(projection, rect.origin);
  const width = rect.extent.widthMeters * projection.pixelsPerMeter;
  const depth = rect.extent.depthMeters * projection.pixelsPerMeter;

  return {
    ...projection,
    originX:
      projection.originX +
      shiftHome(topLeft.x, width, viewport.width, minVisiblePixels),
    originY:
      projection.originY +
      shiftHome(topLeft.y, depth, viewport.height, minVisiblePixels),
  };
}

/**
 * How far one axis has to move to bring the plan back within reach, and zero
 * when it is already there.
 *
 * The visible strip is capped at the drawn length, so an apartment narrower
 * than the strip is held whole rather than being pushed until a piece of it
 * that does not exist comes on screen.
 */
function shiftHome(
  start: number,
  length: number,
  viewportLength: number,
  minVisiblePixels: number,
): number {
  const visible = Math.min(minVisiblePixels, length);
  const earliest = visible - length;
  const latest = viewportLength - visible;

  if (start < earliest) {
    return earliest - start;
  }
  if (start > latest) {
    return latest - start;
  }
  return 0;
}
