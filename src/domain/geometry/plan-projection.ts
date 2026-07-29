/**
 * Fitting a floor plan into a pixel viewport.
 *
 * A plan view looks straight down at the XZ floor plane. Screen X follows room
 * X, and screen Y follows room Z, so depth increases downward — the way a floor
 * plan is normally read.
 *
 * The projection is uniform: one scale for both axes. A square room must be
 * drawn square, and a measured length must cover the same number of pixels
 * whichever direction it runs, or the drawing stops being a measurement.
 *
 * This module is pure. It knows about meters and pixels, and nothing about
 * canvases, elements, or React.
 */

export type PixelSize = { readonly width: number; readonly height: number };
export type PixelPoint = { readonly x: number; readonly y: number };

/** A point on the floor plane. Height plays no part in a plan view. */
export type FloorPoint = { readonly xMeters: number; readonly zMeters: number };

/** The footprint being fitted, in meters. */
export type FloorExtent = {
  readonly widthMeters: number;
  readonly depthMeters: number;
};

export type PlanProjection = {
  /** Pixels per meter, uniform across both axes. Zero means nothing fits. */
  readonly pixelsPerMeter: number;
  /** Where the floor's (0, 0) corner lands, in pixels. */
  readonly originX: number;
  readonly originY: number;
};

/** The projection for a viewport nothing can be drawn in. */
export const EMPTY_PLAN_PROJECTION: PlanProjection = {
  pixelsPerMeter: 0,
  originX: 0,
  originY: 0,
};

/**
 * Scales `extent` to fit inside `viewport`, keeping `paddingPixels` clear on
 * every side, and centers it in the full viewport.
 *
 * Padding is subtracted before scaling but not before centering, so the drawn
 * floor sits in the middle of the element with the padding available around it
 * for dimension labels.
 *
 * `origin` is the floor coordinate the extent starts at — the north-west corner
 * of what is being fitted. It defaults to the floor's own zero, and passing the
 * real one is what makes the result a **complete** transform: a projection that
 * takes any floor point straight to a pixel, with no second term to remember.
 *
 * That mattered more than it sounds. When the origin was left out, everything
 * reading the projection had to add the apartment's north-west corner back on —
 * and that corner is derived from where the rooms are. Dragging a room west of
 * everything else moved it, which moved the whole drawing, which moved the
 * floor point under a pointer that had not itself moved, which dragged the room
 * further west. The wall ran away from the hand dragging it.
 */
export function createPlanProjection(
  extent: FloorExtent,
  viewport: PixelSize,
  paddingPixels = 0,
  origin: FloorPoint = { xMeters: 0, zMeters: 0 },
): PlanProjection {
  const usableWidth = viewport.width - paddingPixels * 2;
  const usableHeight = viewport.height - paddingPixels * 2;

  // Negated comparisons, so NaN falls through to the empty projection.
  if (
    !(extent.widthMeters > 0) ||
    !(extent.depthMeters > 0) ||
    !(usableWidth > 0) ||
    !(usableHeight > 0)
  ) {
    return EMPTY_PLAN_PROJECTION;
  }

  const pixelsPerMeter = Math.min(
    usableWidth / extent.widthMeters,
    usableHeight / extent.depthMeters,
  );

  // Centred, then shifted so the extent's own corner — rather than the floor's
  // zero — lands in the middle. The two are the same only for an apartment
  // whose north-west room happens to start at the origin.
  return {
    pixelsPerMeter,
    originX:
      (viewport.width - extent.widthMeters * pixelsPerMeter) / 2 -
      origin.xMeters * pixelsPerMeter,
    originY:
      (viewport.height - extent.depthMeters * pixelsPerMeter) / 2 -
      origin.zMeters * pixelsPerMeter,
  };
}

export function projectLength(
  projection: PlanProjection,
  meters: number,
): number {
  return meters * projection.pixelsPerMeter;
}

export function projectPoint(
  projection: PlanProjection,
  point: FloorPoint,
): PixelPoint {
  return {
    x: projection.originX + point.xMeters * projection.pixelsPerMeter,
    y: projection.originY + point.zMeters * projection.pixelsPerMeter,
  };
}

/**
 * `projectPoint` run backwards: the floor point a pixel lands on.
 *
 * This is how the plan view is clicked. A canvas has no nodes to hit test
 * against, so a pointer position comes back through the projection into meters
 * and the question is answered against the floor instead of against the DOM.
 *
 * Null when nothing fits in the viewport, because then no pixel means anything.
 */
export function unprojectPoint(
  projection: PlanProjection,
  point: PixelPoint,
): FloorPoint | null {
  if (!(projection.pixelsPerMeter > 0)) {
    return null;
  }
  return {
    xMeters: (point.x - projection.originX) / projection.pixelsPerMeter,
    zMeters: (point.y - projection.originY) / projection.pixelsPerMeter,
  };
}
