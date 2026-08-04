/**
 * Rooms to test against.
 *
 * `LIVING_ROOM` is the 14'×12' room the application used to hand every new
 * project — a door on the south wall, a window on the north. It stopped being
 * a default because a new project should not open on measurements nobody took,
 * but it remains a good room to test with: it is a realistic size, it has both
 * kinds of opening on opposite walls, and a great many assertions were written
 * against its exact dimensions.
 *
 * Nothing in the application imports this. It is here rather than duplicated
 * across a dozen test files so that a room used as "an ordinary room" is the
 * same ordinary room everywhere.
 */

import { metersFromInches } from "@/domain/units";
import { DEFAULT_FLOOR, type Floor } from "./floor";
import { createRoom, withOpenings, withParts, type Room } from "./room";

const PART_ID = "room-1-part-1";

export const LIVING_ROOM: Room = withOpenings(
  withParts(createRoom("room-1", "Living room", { xMeters: 0, zMeters: 0 }), [
    {
      id: PART_ID,
      origin: {
        xMeters: -metersFromInches(84),
        zMeters: -metersFromInches(72),
      },
      widthMeters: metersFromInches(168),
      depthMeters: metersFromInches(144),
      rotationRadians: 0,
      openWalls: [],
    },
  ]),
  [
    {
      id: "door-1",
      kind: "door",
      partId: PART_ID,
      wall: "south",
      centerMeters: metersFromInches(36),
      widthMeters: metersFromInches(32),
      hinge: "start",
      swing: "inward",
    },
    {
      id: "window-1",
      kind: "window",
      partId: PART_ID,
      wall: "north",
      centerMeters: metersFromInches(84),
      widthMeters: metersFromInches(48),
    },
  ],
);

/** That room standing alone on a floor, which is what a project used to be. */
export const LIVING_ROOM_FLOOR: Floor = {
  ...DEFAULT_FLOOR,
  rooms: [LIVING_ROOM],
};
