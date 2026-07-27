/**
 * Whether a footprint stays inside the floor.
 *
 * The floor is an axis-aligned rectangle from (0, 0) to its width and depth, so
 * this needs no Separating Axis Theorem: the extremes of a convex shape are at
 * its corners, and how far past an edge it reaches is read straight off them.
 *
 * Overhang is measured per side, because "it crosses the north wall by 20 cm"
 * is something a person can act on and "it does not fit" is not.
 */

import { orientedRectCorners, type OrientedRect } from "./oriented-rect";
import { CONTACT_TOLERANCE_METERS } from "./sat";
import type { FloorExtent } from "./plan-projection";

/**
 * How far a footprint reaches past each edge of the floor, in meters. Zero
 * where it is inside. Named for the walls of a room read as a plan: west is
 * x = 0, north is z = 0.
 */
export type Overhang = {
  readonly west: number;
  readonly east: number;
  readonly north: number;
  readonly south: number;
};

export const NO_OVERHANG: Overhang = { west: 0, east: 0, north: 0, south: 0 };

export function rectOverhang(rect: OrientedRect, floor: FloorExtent): Overhang {
  const corners = orientedRectCorners(rect);
  const xs = corners.map((corner) => corner.xMeters);
  const zs = corners.map((corner) => corner.zMeters);

  return {
    west: past(-Math.min(...xs)),
    east: past(Math.max(...xs) - floor.widthMeters),
    north: past(-Math.min(...zs)),
    south: past(Math.max(...zs) - floor.depthMeters),
  };
}

/** Whether a footprint reaches past any edge at all. */
export function overhangs(overhang: Overhang): boolean {
  return (
    overhang.west > 0 ||
    overhang.east > 0 ||
    overhang.north > 0 ||
    overhang.south > 0
  );
}

/**
 * Whether a footprint misses the floor altogether.
 *
 * Dragging cannot produce this — a piece's center is held on the floor — but a
 * project file edited by hand can, and "the rug is not in the room" is a
 * different sentence from "the rug crosses the west wall".
 */
export function rectOutsideFloor(
  rect: OrientedRect,
  floor: FloorExtent,
): boolean {
  const corners = orientedRectCorners(rect);
  const xs = corners.map((corner) => corner.xMeters);
  const zs = corners.map((corner) => corner.zMeters);

  return (
    Math.max(...xs) <= CONTACT_TOLERANCE_METERS ||
    Math.min(...xs) >= floor.widthMeters - CONTACT_TOLERANCE_METERS ||
    Math.max(...zs) <= CONTACT_TOLERANCE_METERS ||
    Math.min(...zs) >= floor.depthMeters - CONTACT_TOLERANCE_METERS
  );
}

/** Ignores a reach smaller than the tolerance the rest of the geometry uses. */
function past(distance: number): number {
  return distance > CONTACT_TOLERANCE_METERS ? distance : 0;
}
