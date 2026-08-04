/**
 * The listing's floor plan, laid under the canvas to be traced.
 *
 * The image never leaves the machine and never becomes a measurement: it is
 * sized until it looks right against what is being drawn, and everything
 * traced over it still goes through the same snapping and typeable fields as a
 * room entered blind. A traced dimension is an eyeballed one — the picture
 * makes entering an apartment fast, and the numbers keep it honest.
 *
 * **It is resized, not calibrated.** There used to be a tape-measure mode:
 * arm the plan, drag a line along a wall whose length you knew, type that
 * length, press Apply. It was a ceremony for setting one number, it demanded a
 * measurement before the image could be any use, and the number it produced is
 * one nobody checks afterwards — the picture is a guide, and it is right when
 * it looks right. Dragging a corner says the same thing in one gesture, and
 * the width stays typeable for anyone who does know it.
 *
 * Stored as a data URL because the project document is one plain serializable
 * value; an exported project carries its underlay with it.
 */

import type { FloorPoint } from "@/domain/geometry";
import type { LengthLimits } from "@/domain/units";

export type PlanUnderlay = {
  readonly imageDataUrl: string;
  readonly imageWidthPixels: number;
  readonly imageHeightPixels: number;
  /** The one number the sizing fixes: how long an image pixel really is. */
  readonly metersPerPixel: number;
  /** Where the image's top-left corner sits on the floor. */
  readonly origin: FloorPoint;
  readonly visible: boolean;
};

/** How wide a freshly dropped plan is assumed to be, until it is resized. */
export const PROVISIONAL_PLAN_WIDTH_METERS = 8;

/**
 * What an underlay may be sized to.
 *
 * Wide enough for a plan of a whole floor drawn with a margin round it, and
 * narrow enough that a slipped decimal point is caught rather than sending the
 * image somewhere the view has to be rescued from.
 */
export const UNDERLAY_WIDTH_LIMITS: LengthLimits = {
  minMeters: 0.5,
  maxMeters: 120,
};

/** The corner of the image being taken hold of. */
export type UnderlayCorner =
  "north-west" | "north-east" | "south-east" | "south-west";

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
 * A new underlay, centered on `around`.
 *
 * The provisional width only has to put the image on screen at a plausible
 * size; a corner drag or the width field replaces it.
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

/** The image's four corners on the floor, for the handles that resize it. */
export function underlayCorners(
  underlay: PlanUnderlay,
): readonly { readonly corner: UnderlayCorner; readonly at: FloorPoint }[] {
  const { widthMeters, depthMeters } = underlayExtentMeters(underlay);
  const west = underlay.origin.xMeters;
  const north = underlay.origin.zMeters;
  const east = west + widthMeters;
  const south = north + depthMeters;

  return [
    { corner: "north-west", at: { xMeters: west, zMeters: north } },
    { corner: "north-east", at: { xMeters: east, zMeters: north } },
    { corner: "south-east", at: { xMeters: east, zMeters: south } },
    { corner: "south-west", at: { xMeters: west, zMeters: south } },
  ];
}

/**
 * The image resized by dragging one corner to a floor point, with the corner
 * opposite held still.
 *
 * **The proportions are kept**, because a floor plan stretched on one axis is
 * a drawing that lies about every dimension on the other — the one thing an
 * underlay must not do, even as a guide. So the pointer chooses a single
 * scale, and the corner follows it as near as the aspect allows.
 *
 * Which scale that is comes out of a projection rather than a guess. Writing
 * the dragged corner as `fixed + k · (w, h)` for the image's own pixel
 * dimensions, the `k` putting it nearest the pointer is the pointer's offset
 * projected onto that diagonal — and `k` is exactly the meters per pixel,
 * because that is what a pixel of the image is worth. Dragging along either
 * axis or right down the diagonal all read the way a hand expects.
 */
export function resizedUnderlay(
  underlay: PlanUnderlay,
  corner: UnderlayCorner,
  point: FloorPoint,
): PlanUnderlay {
  const east = corner === "north-east" || corner === "south-east";
  const south = corner === "south-east" || corner === "south-west";
  const fixed = oppositeCorner(underlay, corner);
  const wide = underlay.imageWidthPixels;
  const tall = underlay.imageHeightPixels;
  const diagonal = wide * wide + tall * tall;
  if (diagonal <= 0) {
    return underlay;
  }

  const reach =
    ((point.xMeters - fixed.xMeters) * (east ? wide : -wide) +
      (point.zMeters - fixed.zMeters) * (south ? tall : -tall)) /
    diagonal;
  const metersPerPixel = clamp(
    reach,
    UNDERLAY_WIDTH_LIMITS.minMeters / wide,
    UNDERLAY_WIDTH_LIMITS.maxMeters / wide,
  );

  return {
    ...underlay,
    metersPerPixel,
    // The origin is the north-west corner, so it is the fixed corner itself
    // only when the drag was on the south-east one.
    origin: {
      xMeters: east ? fixed.xMeters : fixed.xMeters - wide * metersPerPixel,
      zMeters: south ? fixed.zMeters : fixed.zMeters - tall * metersPerPixel,
    },
  };
}

/**
 * The image sized to a width somebody typed, its top-left corner held still.
 *
 * The height follows the image's own proportions, for the reason
 * `resizedUnderlay` keeps them. Held still at the north-west corner because
 * that is the point the X and Y fields beside this one describe.
 */
export function underlayWithWidth(
  underlay: PlanUnderlay,
  widthMeters: number,
): PlanUnderlay {
  if (!(widthMeters > 0) || !(underlay.imageWidthPixels > 0)) {
    return underlay;
  }
  return {
    ...underlay,
    metersPerPixel: widthMeters / underlay.imageWidthPixels,
  };
}

function oppositeCorner(
  underlay: PlanUnderlay,
  corner: UnderlayCorner,
): FloorPoint {
  const opposite: Record<UnderlayCorner, UnderlayCorner> = {
    "north-west": "south-east",
    "north-east": "south-west",
    "south-east": "north-west",
    "south-west": "north-east",
  };
  const found = underlayCorners(underlay).find(
    (one) => one.corner === opposite[corner],
  );
  return found?.at ?? underlay.origin;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
