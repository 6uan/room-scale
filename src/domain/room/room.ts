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
  metersFromInches,
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

/**
 * Where a room can be placed on the floor.
 *
 * Negative on purpose. The floor's zero is the middle of the apartment rather
 * than a corner of it, so a room added to the west of everything else has a
 * negative origin — and being unable to type one would mean laying an apartment
 * out from whichever room happened to be entered first.
 */
export const ROOM_ORIGIN_LIMITS: LengthLimits = {
  minMeters: -60,
  maxMeters: 60,
};

/**
 * A fourteen by twelve foot living room with an eight foot ceiling, standing
 * in the middle of the floor.
 *
 * Round in inches rather than in meters, because the application opens in
 * inches: 4.2 m is a tidy number that reads as 165.35", which is a number
 * nobody measured and everybody has to retype. Centred on the origin so the
 * apartment grows in whichever direction it actually goes.
 */
export const DEFAULT_ROOM: Room = {
  id: "room-1",
  name: "Living room",
  origin: {
    xMeters: -metersFromInches(84),
    zMeters: -metersFromInches(72),
  },
  widthMeters: metersFromInches(168),
  depthMeters: metersFromInches(144),
  heightMeters: metersFromInches(96),
  openings: [
    {
      id: "door-1",
      kind: "door",
      wall: "south",
      centerMeters: metersFromInches(36),
      widthMeters: metersFromInches(32),
      hinge: "start",
      swing: "inward",
    },
    {
      id: "window-1",
      kind: "window",
      wall: "north",
      centerMeters: metersFromInches(84),
      widthMeters: metersFromInches(48),
    },
  ],
};

/**
 * A new block, ten feet square, dropped east of everything already on the floor
 * so it does not land on top of another room. Round in inches, like the rest.
 */
export function createRoom(id: string, name: string, origin: FloorPoint): Room {
  return {
    id,
    name,
    origin,
    widthMeters: metersFromInches(120),
    depthMeters: metersFromInches(120),
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
