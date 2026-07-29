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
 * How far along one wall a room-local point lies.
 *
 * The perpendicular coordinate is deliberately ignored: a pointer moving an
 * opening may stray away from the narrow wall band, but it still changes only
 * the measured distance along that wall.
 */
export function metersAlongWall(wall: WallSide, point: FloorPoint): number {
  return wall === "north" || wall === "south" ? point.xMeters : point.zMeters;
}

export type WallPlacement = {
  readonly wall: WallSide;
  readonly alongMeters: number;
};

/**
 * The wall near a room-local point, if one is within reach.
 *
 * Reach is supplied by the caller because a pointer target is measured on
 * screen: the canvas converts its fixed pixel tolerance to meters at the
 * current zoom. The wall's own length is still exact domain geometry.
 */
export function wallPlacementAt(
  room: Room,
  point: FloorPoint,
  reachMeters: number,
): WallPlacement | null {
  const candidates = WALL_SIDES.map((wall) => {
    const alongMeters = metersAlongWall(wall, point);
    const length = wallLengthMeters(room, wall);
    const distanceMeters = distanceFromWall(room, wall, point);
    return { wall, alongMeters, length, distanceMeters };
  })
    .filter(
      ({ alongMeters, length, distanceMeters }) =>
        distanceMeters <= reachMeters &&
        alongMeters >= 0 &&
        alongMeters <= length,
    )
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const nearest = candidates[0];
  return nearest === undefined
    ? null
    : { wall: nearest.wall, alongMeters: nearest.alongMeters };
}

/** The topmost opening under a room-local point, if there is one. */
export function openingAtPoint(
  room: Room,
  point: FloorPoint,
  reachMeters: number,
): Opening | null {
  const placement = wallPlacementAt(room, point, reachMeters);
  if (placement === null) {
    return null;
  }

  return (
    room.openings
      .filter((opening) => opening.wall === placement.wall)
      .filter((opening) => checkOpening(room, opening) === null)
      .filter((opening) => {
        const { startMeters, endMeters } = openingRangeMeters(opening);
        return (
          placement.alongMeters >= startMeters &&
          placement.alongMeters <= endMeters
        );
      })
      .at(-1) ?? null
  );
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
  centerMeters?: number,
): Opening {
  const wallLength = wallLengthMeters(room, wall);
  const widthMeters = Math.min(DEFAULT_OPENING_WIDTH_METERS[kind], wallLength);
  const half = widthMeters / 2;
  const placement = {
    id,
    wall,
    centerMeters: clamp(
      centerMeters ?? wallLength / 2,
      half,
      wallLength - half,
    ),
    widthMeters,
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

/** Moves an opening along its wall without letting either jamb leave it. */
export function moveOpening(
  room: Room,
  opening: Opening,
  centerMeters: number,
): Opening {
  const wallLength = wallLengthMeters(room, opening.wall);
  const half = opening.widthMeters / 2;
  return {
    ...opening,
    centerMeters: clamp(centerMeters, half, wallLength - half),
  };
}

export type OpeningJamb = "start" | "end";

/**
 * Moves one jamb while the opposite jamb stays where it is.
 *
 * Pointer editing cannot create a hole narrower than the domain minimum or
 * pull it beyond a corner. Numeric editing remains separate and exact.
 */
export function resizeOpeningJamb(
  room: Room,
  opening: Opening,
  jamb: OpeningJamb,
  alongMeters: number,
): Opening {
  const wallLength = wallLengthMeters(room, opening.wall);
  const { startMeters, endMeters } = openingRangeMeters(opening);
  const start =
    jamb === "start"
      ? clamp(alongMeters, 0, endMeters - MIN_OPENING_METERS)
      : startMeters;
  const end =
    jamb === "end"
      ? clamp(alongMeters, startMeters + MIN_OPENING_METERS, wallLength)
      : endMeters;

  return {
    ...opening,
    centerMeters: (start + end) / 2,
    widthMeters: end - start,
  };
}

function distanceFromWall(
  room: Room,
  wall: WallSide,
  point: FloorPoint,
): number {
  switch (wall) {
    case "north":
      return Math.abs(point.zMeters);
    case "south":
      return Math.abs(point.zMeters - room.depthMeters);
    case "west":
      return Math.abs(point.xMeters);
    case "east":
      return Math.abs(point.xMeters - room.widthMeters);
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
