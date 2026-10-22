import { describe, expect, it } from "vitest";
import { metersFromInches } from "@/domain/units";
import { DEFAULT_FLOOR } from "./floor";
import { LIVING_ROOM } from "./fixtures";
import { createRoom, withOpenings, withOrigin, withParts } from "./room";
import { sharedOpenings } from "./shared-openings";

// The living room: 14' by 12' about the origin, a door on its south wall at
// 36" from the west corner, a window on its north wall. The hall below it
// shares the south wall when it stands one thickness past the living
// room's south edge at 72".
const thickness = DEFAULT_FLOOR.wallThicknessMeters;
const south = metersFromInches(72);
const hallAt = (xInches: number, zMeters: number) =>
  withOrigin(createRoom("hall", "Hall", { xMeters: 0, zMeters: 0 }), {
    xMeters: metersFromInches(xInches),
    zMeters,
  });

describe("sharedOpenings", () => {
  it("finds the living room's door for a hall sharing its south wall", () => {
    const hall = hallAt(-84, south + thickness);
    const floor = { ...DEFAULT_FLOOR, rooms: [LIVING_ROOM, hall] };
    const shared = sharedOpenings(floor, hall);
    expect(shared.map((one) => [one.owner.id, one.opening.id])).toEqual([
      ["room-1", "door-1"],
    ]);
  });

  it("never lists a window", () => {
    // A room above shares the north wall, where only the window is.
    const above = hallAt(-84, -metersFromInches(72) - thickness - 3);
    const tall = withParts(above, [{ ...above.parts[0]!, depthMeters: 3 }]);
    const floor = { ...DEFAULT_FLOOR, rooms: [LIVING_ROOM, tall] };
    expect(sharedOpenings(floor, tall)).toEqual([]);
  });

  it("lists nothing when the rooms do not share the wall", () => {
    const apart = hallAt(-84, south + thickness + 0.2);
    const floor = { ...DEFAULT_FLOOR, rooms: [LIVING_ROOM, apart] };
    expect(sharedOpenings(floor, apart)).toEqual([]);
  });

  it("lists nothing when the door is beyond the end of this room's wall", () => {
    // The hall starts east of the door, which runs from 20" to 52".
    const east = hallAt(60, south + thickness);
    const floor = { ...DEFAULT_FLOOR, rooms: [LIVING_ROOM, east] };
    expect(sharedOpenings(floor, east)).toEqual([]);
  });

  it("is not a list of the room's own openings", () => {
    const floor = { ...DEFAULT_FLOOR, rooms: [LIVING_ROOM] };
    expect(sharedOpenings(floor, LIVING_ROOM)).toEqual([]);
    expect(sharedOpenings(floor, withOpenings(LIVING_ROOM, []))).toEqual([]);
  });
});
