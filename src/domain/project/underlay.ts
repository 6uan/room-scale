/**
 * The listing's floor plan, laid under the canvas to be traced.
 *
 * The image never leaves the machine and never becomes a measurement: it is
 * scaled by one line somebody drew along a wall they know, and everything
 * traced over it still goes through the same snapping and typeable fields as
 * a room entered blind. A traced dimension is an eyeballed one — the picture
 * makes entering an apartment fast, and the numbers keep it honest.
 *
 * Stored as a data URL because the project document is one plain serializable
 * value; an exported project carries its underlay with it.
 */

import type { FloorPoint } from "@/domain/geometry";

export type PlanUnderlay = {
  readonly imageDataUrl: string;
  readonly imageWidthPixels: number;
  readonly imageHeightPixels: number;
  /** The one number calibration fixes: how long an image pixel really is. */
  readonly metersPerPixel: number;
  /** Where the image's top-left corner sits on the floor. */
  readonly origin: FloorPoint;
  readonly visible: boolean;
};

/** How wide a freshly dropped, uncalibrated plan is assumed to be. */
export const PROVISIONAL_PLAN_WIDTH_METERS = 8;

/** The footprint the underlay covers on the floor, at its current scale. */
export function underlayExtentMeters(underlay: PlanUnderlay): {
  readonly widthMeters: number;
  readonly depthMeters: number;
} {
  return {
    widthMeters: underlay.imageWidthPixels * underlay.metersPerPixel,
    depthMeters: underlay.imageHeightPixels * underlay.metersPerPixel,
  };
}

/**
 * A new underlay, centered on `around`, waiting to be calibrated.
 *
 * The provisional scale only has to put the image on screen at a plausible
 * size; the calibration line replaces it before anything is traced.
 */
export function createUnderlay(
  imageDataUrl: string,
  imageWidthPixels: number,
  imageHeightPixels: number,
  around: FloorPoint,
): PlanUnderlay {
  const metersPerPixel = PROVISIONAL_PLAN_WIDTH_METERS / imageWidthPixels;
  return {
    imageDataUrl,
    imageWidthPixels,
    imageHeightPixels,
    metersPerPixel,
    origin: {
      xMeters: around.xMeters - (imageWidthPixels * metersPerPixel) / 2,
      zMeters: around.zMeters - (imageHeightPixels * metersPerPixel) / 2,
    },
    visible: true,
  };
}

/**
 * The scale fixed by one drawn line: its length on the floor at the current
 * scale, against the length somebody read off their tape.
 *
 * Scaling holds the line's own midpoint still, so the wall that was just
 * measured stays under the line that measured it rather than sliding away as
 * the rest of the image grows around it.
 */
export function calibratedUnderlay(
  underlay: PlanUnderlay,
  lineFrom: FloorPoint,
  lineTo: FloorPoint,
  realMeters: number,
): PlanUnderlay {
  const drawnMeters = Math.hypot(
    lineTo.xMeters - lineFrom.xMeters,
    lineTo.zMeters - lineFrom.zMeters,
  );
  if (!(drawnMeters > 0) || !(realMeters > 0)) {
    return underlay;
  }
  const factor = realMeters / drawnMeters;
  const middle = {
    xMeters: (lineFrom.xMeters + lineTo.xMeters) / 2,
    zMeters: (lineFrom.zMeters + lineTo.zMeters) / 2,
  };
  return {
    ...underlay,
    metersPerPixel: underlay.metersPerPixel * factor,
    origin: {
      xMeters:
        middle.xMeters - (middle.xMeters - underlay.origin.xMeters) * factor,
      zMeters:
        middle.zMeters - (middle.zMeters - underlay.origin.zMeters) * factor,
    },
  };
}
