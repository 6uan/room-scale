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
  /**
   * Where the image's top-left corner sits on the floor, before it is turned:
   * the corner of the box it fills, which it turns about the middle of.
   */
  readonly origin: FloorPoint;
  readonly visible: boolean;
  /**
   * How far the image is turned about its middle, in the floor's sense (its
   * +X toward +Z, which is clockwise on the plan). Absent is square to the
   * plan, as every image placed before it could be turned is.
   */
  readonly rotationRadians?: number | undefined;
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

/** The middle of the image, which it turns about. */
export function underlayCenter(underlay: PlanUnderlay): FloorPoint {
  const { widthMeters, depthMeters } = underlayExtentMeters(underlay);
  return {
    xMeters: underlay.origin.xMeters + widthMeters / 2,
    zMeters: underlay.origin.zMeters + depthMeters / 2,
  };
}

/** Turns a point about a center by an angle in the floor's sense. */
function turned(
  point: FloorPoint,
  center: FloorPoint,
  radians: number,
): FloorPoint {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.xMeters - center.xMeters;
  const dz = point.zMeters - center.zMeters;
  return {
    xMeters: center.xMeters + dx * cos - dz * sin,
    zMeters: center.zMeters + dx * sin + dz * cos,
  };
}

/**
 * A floor point in the image's own frame: where it would be if the image
 * were turned back square, so the box tests and the corner arithmetic work
 * as they always have.
 */
function intoImage(underlay: PlanUnderlay, point: FloorPoint): FloorPoint {
  return turned(
    point,
    underlayCenter(underlay),
    -(underlay.rotationRadians ?? 0),
  );
}

/** A point in the image's own frame, back out onto the floor. */
function outOfImage(underlay: PlanUnderlay, point: FloorPoint): FloorPoint {
  return turned(point, underlayCenter(underlay), underlay.rotationRadians ?? 0);
}

/** Whether a floor point lies on the image, edges included, however it is turned. */
export function underlayContains(
  underlay: PlanUnderlay,
  point: FloorPoint,
): boolean {
  const { widthMeters, depthMeters } = underlayExtentMeters(underlay);
  const local = intoImage(underlay, point);
  return (
    local.xMeters >= underlay.origin.xMeters - 1e-9 &&
    local.xMeters <= underlay.origin.xMeters + widthMeters + 1e-9 &&
    local.zMeters >= underlay.origin.zMeters - 1e-9 &&
    local.zMeters <= underlay.origin.zMeters + depthMeters + 1e-9
  );
}

/** The image turned about its middle to an angle, nothing else changed. */
export function withUnderlayRotation(
  underlay: PlanUnderlay,
  rotationRadians: number,
): PlanUnderlay {
  return { ...underlay, rotationRadians };
}

/** The image with its top-left corner moved, its size untouched. */
export function movedUnderlay(
  underlay: PlanUnderlay,
  origin: FloorPoint,
): PlanUnderlay {
  return { ...underlay, origin };
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

/**
 * The image's four corners on the floor, for the handles that resize it —
 * where they are once it is turned. Named for the corner of the image, not
 * of the plan: "north-west" is the image's own top-left.
 */
export function underlayCorners(
  underlay: PlanUnderlay,
): readonly { readonly corner: UnderlayCorner; readonly at: FloorPoint }[] {
  return CORNERS.map((corner) => ({
    corner,
    at: outOfImage(underlay, boxCorner(underlay, corner)),
  }));
}

const CORNERS: readonly UnderlayCorner[] = [
  "north-west",
  "north-east",
  "south-east",
  "south-west",
];

/** A corner of the image's box, before it is turned. */
function boxCorner(underlay: PlanUnderlay, corner: UnderlayCorner): FloorPoint {
  const { widthMeters, depthMeters } = underlayExtentMeters(underlay);
  const east = corner === "north-east" || corner === "south-east";
  const south = corner === "south-east" || corner === "south-west";
  return {
    xMeters: underlay.origin.xMeters + (east ? widthMeters : 0),
    zMeters: underlay.origin.zMeters + (south ? depthMeters : 0),
  };
}

/**
 * The image at a new scale, one of its corners held where it is on the floor.
 *
 * Turned, the image turns about its middle, and the middle moves when the
 * size changes — so the held corner is put back where it was by placing the
 * new middle at the held corner less the turned offset from the middle to
 * that corner: C' = P − R(θ)·(±w'/2, ±h'/2).
 */
function rescaledHolding(
  underlay: PlanUnderlay,
  held: UnderlayCorner,
  metersPerPixel: number,
): PlanUnderlay {
  const anchor = outOfImage(underlay, boxCorner(underlay, held));
  const width = underlay.imageWidthPixels * metersPerPixel;
  const depth = underlay.imageHeightPixels * metersPerPixel;
  const east = held === "north-east" || held === "south-east";
  const south = held === "south-east" || held === "south-west";
  const offset = {
    xMeters: (east ? 1 : -1) * (width / 2),
    zMeters: (south ? 1 : -1) * (depth / 2),
  };
  const turnedOffset = turned(
    offset,
    { xMeters: 0, zMeters: 0 },
    underlay.rotationRadians ?? 0,
  );
  const center = {
    xMeters: anchor.xMeters - turnedOffset.xMeters,
    zMeters: anchor.zMeters - turnedOffset.zMeters,
  };
  return {
    ...underlay,
    metersPerPixel,
    origin: {
      xMeters: center.xMeters - width / 2,
      zMeters: center.zMeters - depth / 2,
    },
  };
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
  const held = OPPOSITE[corner];
  // Measured in the image's own frame, so a turned image sizes along its
  // own diagonal rather than the plan's.
  const fixed = boxCorner(underlay, held);
  const local = intoImage(underlay, point);
  const wide = underlay.imageWidthPixels;
  const tall = underlay.imageHeightPixels;
  const diagonal = wide * wide + tall * tall;
  if (diagonal <= 0) {
    return underlay;
  }

  const reach =
    ((local.xMeters - fixed.xMeters) * (east ? wide : -wide) +
      (local.zMeters - fixed.zMeters) * (south ? tall : -tall)) /
    diagonal;
  const metersPerPixel = clamp(
    reach,
    UNDERLAY_WIDTH_LIMITS.minMeters / wide,
    UNDERLAY_WIDTH_LIMITS.maxMeters / wide,
  );
  return rescaledHolding(underlay, held, metersPerPixel);
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
  return rescaledHolding(
    underlay,
    "north-west",
    widthMeters / underlay.imageWidthPixels,
  );
}

const OPPOSITE: Record<UnderlayCorner, UnderlayCorner> = {
  "north-west": "south-east",
  "north-east": "south-west",
  "south-east": "north-west",
  "south-west": "north-east",
};

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
