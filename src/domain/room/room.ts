/**
 * One room of the apartment.
 *
 * A room is a rectangle with a name, a size, and a place on the floor — a
 * building block. The floor it stands on holds the things true of all of them
 * (`floor.ts`), including how thick the walls are.
 *
 * Every length is meters (docs/adr/0001-use-meters-internally.md); conversion
 * to the reader's unit happens at the UI edge, never here.
 *
 * Width, depth, and height are inside faces — the numbers a tape measure gives.
 * Wall thickness surrounds that, outside the measured room, so it changes how
 * the plan is drawn and never how much room there is to fill.
 *
 * A room's own contents — its openings — are placed from its north-west corner.
 * Everything else on the floor, furniture included, is in floor coordinates.
 */

import type { FloorPoint } from "@/domain/geometry";
import {
  checkLength,
  type LengthLimits,
  type LengthProblem,
} from "@/domain/units";
import { checkOpening, type Opening } from "./openings";

export type Room = {
  readonly id: string;
  /** What it is called in the plan and in the problem list. */
  readonly name: string;
  /** The north-west corner, in floor coordinates. */
  readonly origin: FloorPoint;
  readonly widthMeters: number;
  readonly depthMeters: number;
  readonly heightMeters: number;
  readonly openings: readonly Opening[];
};

/** The lengths of a room that can be edited as a single number. */
export type RoomDimension = "widthMeters" | "depthMeters" | "heightMeters";

export const ROOM_DIMENSIONS: readonly RoomDimension[] = [
  "widthMeters",
  "depthMeters",
  "heightMeters",
];

/**
 * Sanity bounds, not spatial validation. These exist so a slipped decimal point
 * (42 meters for a 4.2 meter wall) is caught while it is still one keystroke
 * from being fixed.
 */
export const ROOM_LENGTH_LIMITS: Record<RoomDimension, LengthLimits> = {
  widthMeters: { minMeters: 0.5, maxMeters: 30 },
  depthMeters: { minMeters: 0.5, maxMeters: 30 },
  heightMeters: { minMeters: 1.5, maxMeters: 6 },
};

/** Where a room can be placed on the floor. Generous: an apartment is small. */
export const ROOM_ORIGIN_LIMITS: LengthLimits = {
  minMeters: 0,
  maxMeters: 60,
};

/** A living room a little over 13 by 11 feet, with an 8 foot ceiling. */
export const DEFAULT_ROOM: Room = {
  id: "room-1",
  name: "Living room",
  origin: { xMeters: 0, zMeters: 0 },
  widthMeters: 4.2,
  depthMeters: 3.6,
  heightMeters: 2.44,
  openings: [
    {
      id: "door-1",
      kind: "door",
      wall: "south",
      centerMeters: 0.9,
      widthMeters: 0.8128,
      hinge: "start",
      swing: "inward",
    },
    {
      id: "window-1",
      kind: "window",
      wall: "north",
      centerMeters: 2.1,
      widthMeters: 1.2192,
    },
  ],
};

/**
 * A new block, the size of a small bedroom, dropped east of everything already
 * on the floor so it does not land on top of another room.
 */
export function createRoom(id: string, name: string, origin: FloorPoint): Room {
  return {
    id,
    name,
    origin,
    widthMeters: 3,
    depthMeters: 3,
    heightMeters: DEFAULT_ROOM.heightMeters,
    openings: [],
  };
}

export function checkRoomLength(
  meters: number,
  dimension: RoomDimension,
): LengthProblem | null {
  return checkLength(meters, ROOM_LENGTH_LIMITS[dimension]);
}

export function isValidRoom(room: Room): boolean {
  return (
    ROOM_DIMENSIONS.every(
      (dimension) => checkRoomLength(room[dimension], dimension) === null,
    ) && room.openings.every((opening) => checkOpening(room, opening) === null)
  );
}

/** Replaces one dimension, leaving the original room untouched. */
export function withRoomLength(
  room: Room,
  dimension: RoomDimension,
  meters: number,
): Room {
  return { ...room, [dimension]: meters };
}

export function withOpenings(room: Room, openings: readonly Opening[]): Room {
  return { ...room, openings };
}

export function withOrigin(room: Room, origin: FloorPoint): Room {
  return { ...room, origin };
}

export function roomFloorAreaSquareMeters(room: Room): number {
  return room.widthMeters * room.depthMeters;
}
