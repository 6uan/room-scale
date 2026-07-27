/**
 * Openings in the room's walls: doors, windows, and open passages.
 *
 * An opening sits on one wall, measured along that wall from its start corner
 * to the opening's center. Start corners are picked so the measurement always
 * runs the way a plan is read: north and south walls are measured from their
 * west end, east and west walls from their north end.
 *
 * In plan, north is the top of the drawing and Z increases downward, so the
 * north wall is at z = 0 and the south wall at z = depth.
 */

import type { FloorPoint } from "@/domain/geometry";
import type { Room } from "./room";

export type WallSide = "north" | "east" | "south" | "west";

export const WALL_SIDES: readonly WallSide[] = [
  "north",
  "east",
  "south",
  "west",
];

export type OpeningKind = "door" | "window" | "passage";

/** Which jamb the door is hung on, in the wall's own direction. */
export type DoorHinge = "start" | "end";

export type DoorSwing = "inward" | "outward";

type OpeningPlacement = {
  readonly id: string;
  readonly wall: WallSide;
  readonly centerMeters: number;
  readonly widthMeters: number;
};

export type Door = OpeningPlacement & {
  readonly kind: "door";
  readonly hinge: DoorHinge;
  readonly swing: DoorSwing;
};

/** Named to stay out of the way of the DOM's `Window`. */
export type WindowOpening = OpeningPlacement & { readonly kind: "window" };

export type Passage = OpeningPlacement & { readonly kind: "passage" };

export type Opening = Door | WindowOpening | Passage;

/** Narrower than this is a hole, not an opening anyone walks or looks through. */
export const MIN_OPENING_METERS = 0.3;

/** Starting sizes: a 32 inch door, a 48 inch window, a 36 inch passage. */
export const DEFAULT_OPENING_WIDTH_METERS: Record<OpeningKind, number> = {
  door: 0.8128,
  window: 1.2192,
  passage: 0.9144,
};

/** A direction on the floor plane, as a unit vector. */
export type FloorVector = { readonly dx: number; readonly dz: number };

export function wallLengthMeters(room: Room, wall: WallSide): number {
  return wall === "north" || wall === "south"
    ? room.widthMeters
    : room.depthMeters;
}

/** Where the opening starts and ends, measured along its wall. */
export function openingRangeMeters(opening: OpeningPlacement): {
  startMeters: number;
  endMeters: number;
} {
  const half = opening.widthMeters / 2;
  return {
    startMeters: opening.centerMeters - half,
    endMeters: opening.centerMeters + half,
  };
}

export type OpeningProblem = "not-a-number" | "too-narrow" | "off-wall";

export function checkOpening(
  room: Room,
  opening: Opening,
): OpeningProblem | null {
  if (
    !Number.isFinite(opening.centerMeters) ||
    !Number.isFinite(opening.widthMeters)
  ) {
    return "not-a-number";
  }
  if (opening.widthMeters < MIN_OPENING_METERS) {
    return "too-narrow";
  }
  const { startMeters, endMeters } = openingRangeMeters(opening);
  if (startMeters < 0 || endMeters > wallLengthMeters(room, opening.wall)) {
    return "off-wall";
  }
  return null;
}

/** The direction the wall runs, from its start corner toward its end. */
export function wallDirection(wall: WallSide): FloorVector {
  return wall === "north" || wall === "south"
    ? { dx: 1, dz: 0 }
    : { dx: 0, dz: 1 };
}

/** The unit vector pointing out of the room, through the wall. */
export function wallOutwardNormal(wall: WallSide): FloorVector {
  switch (wall) {
    case "north":
      return { dx: 0, dz: -1 };
    case "south":
      return { dx: 0, dz: 1 };
    case "west":
      return { dx: -1, dz: 0 };
    case "east":
      return { dx: 1, dz: 0 };
  }
}

/** A point on the inside face of a wall, `alongMeters` from its start corner. */
export function pointAlongWall(
  room: Room,
  wall: WallSide,
  alongMeters: number,
): FloorPoint {
  switch (wall) {
    case "north":
      return { xMeters: alongMeters, zMeters: 0 };
    case "south":
      return { xMeters: alongMeters, zMeters: room.depthMeters };
    case "west":
      return { xMeters: 0, zMeters: alongMeters };
    case "east":
      return { xMeters: room.widthMeters, zMeters: alongMeters };
  }
}

/**
 * The opening's two jambs on the inside face of its wall. `start` is the end
 * nearer the wall's start corner, which is also the `"start"` hinge.
 */
export function openingEndpoints(
  room: Room,
  opening: Opening,
): { start: FloorPoint; end: FloorPoint } {
  const { startMeters, endMeters } = openingRangeMeters(opening);
  return {
    start: pointAlongWall(room, opening.wall, startMeters),
    end: pointAlongWall(room, opening.wall, endMeters),
  };
}

/** A new opening of standard width, centered on its wall. */
export function createOpening(
  kind: OpeningKind,
  id: string,
  room: Room,
  wall: WallSide = "north",
): Opening {
  const wallLength = wallLengthMeters(room, wall);
  const placement = {
    id,
    wall,
    centerMeters: wallLength / 2,
    widthMeters: Math.min(DEFAULT_OPENING_WIDTH_METERS[kind], wallLength),
  };

  switch (kind) {
    case "door":
      return { ...placement, kind, hinge: "start", swing: "inward" };
    case "window":
      return { ...placement, kind };
    case "passage":
      return { ...placement, kind };
  }
}

/**
 * Moves an opening to a different wall, keeping it on the wall it lands on.
 * Walls differ in length, so a center that was valid may not be.
 */
export function withOpeningWall(
  room: Room,
  opening: Opening,
  wall: WallSide,
): Opening {
  const wallLength = wallLengthMeters(room, wall);
  const widthMeters = Math.min(opening.widthMeters, wallLength);
  const half = widthMeters / 2;
  return {
    ...opening,
    wall,
    widthMeters,
    centerMeters: clamp(opening.centerMeters, half, wallLength - half),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
