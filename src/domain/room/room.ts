/**
 * The room being planned.
 *
 * The MVP models one rectangular room (AGENTS.md > MVP constraints). Every
 * length is meters (docs/adr/0001-use-meters-internally.md) — conversion to
 * the reader's unit happens at the UI edge, never here.
 *
 * The floor occupies the XZ plane with the room's near-left corner at the
 * origin: X runs 0..widthMeters, Z runs 0..depthMeters, and Y is height.
 *
 * Width, depth, and height are inside faces — the numbers a tape measure
 * gives. Wall thickness surrounds that, outside the measured room, so it
 * changes how the plan is drawn and never how much room there is to fill.
 */

import {
  checkLength,
  type LengthLimits,
  type LengthProblem,
} from "@/domain/units";
import { checkOpening, type Opening } from "./openings";

export type Room = {
  readonly widthMeters: number;
  readonly depthMeters: number;
  readonly heightMeters: number;
  readonly wallThicknessMeters: number;
  readonly openings: readonly Opening[];
};

/** The lengths of a room that can be edited as a single number. */
export type RoomDimension =
  "widthMeters" | "depthMeters" | "heightMeters" | "wallThicknessMeters";

export const ROOM_DIMENSIONS: readonly RoomDimension[] = [
  "widthMeters",
  "depthMeters",
  "heightMeters",
  "wallThicknessMeters",
];

/**
 * Sanity bounds, not spatial validation — furniture and clearance checks arrive
 * in later steps. These exist so a slipped decimal point (42 meters for a 4.2
 * meter wall) is caught while it is still one keystroke from being fixed.
 */
export const ROOM_LENGTH_LIMITS: Record<RoomDimension, LengthLimits> = {
  widthMeters: { minMeters: 0.5, maxMeters: 30 },
  depthMeters: { minMeters: 0.5, maxMeters: 30 },
  heightMeters: { minMeters: 1.5, maxMeters: 6 },
  // A stud wall with drywall is about 0.114 m; a masonry wall is thicker.
  wallThicknessMeters: { minMeters: 0.02, maxMeters: 0.6 },
};

/** A living room a little over 13 by 11 feet, with an 8 foot ceiling. */
export const DEFAULT_ROOM: Room = {
  widthMeters: 4.2,
  depthMeters: 3.6,
  heightMeters: 2.44,
  // 4.5 inches: a 2x4 stud wall with drywall on both faces.
  wallThicknessMeters: 0.1143,
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

export function roomFloorAreaSquareMeters(room: Room): number {
  return room.widthMeters * room.depthMeters;
}
