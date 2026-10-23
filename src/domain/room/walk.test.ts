import { describe, expect, it } from "vitest";
import { metersFromInches } from "@/domain/units";
import { LIVING_ROOM, LIVING_ROOM_FLOOR } from "./fixtures";
import { withRooms } from "./floor";
import { withOpenings } from "./room";
import {
  WALKER_RADIUS_METERS,
  onWalkableFloor,
  walkStart,
  walkStep,
  walkerFits,
} from "./walk";

// The living room runs from -84" to 84" east-west and -72" to 72" north-south.
// A second room stands east of it, one wall's thickness away, and a 32" door
// in the living room's east wall, centred, joins them.
const part = LIVING_ROOM.parts[0]!;
const thickness = LIVING_ROOM_FLOOR.wallThicknessMeters;
const eastFace = metersFromInches(84);
const door = {
  ...LIVING_ROOM.openings[0]!,
  id: "east-door",
  wall: "east" as const,
  centerMeters: metersFromInches(72),
};
const living = withOpenings(LIVING_ROOM, [door]);
const next = {
  ...LIVING_ROOM,
  id: "room-2",
  openings: [],
  parts: [
    {
      ...part,
      id: "room-2-part-1",
      origin: {
        xMeters: part.origin.xMeters + part.widthMeters + thickness,
        zMeters: part.origin.zMeters,
      },
    },
  ],
};
const floor = withRooms(LIVING_ROOM_FLOOR, [living, next]);
const inWall = (zMeters: number) => ({
  xMeters: eastFace + thickness / 2,
  zMeters,
});

describe("where a person can stand", () => {
  it("is any room's floor, and not the wall between them", () => {
    expect(onWalkableFloor(floor, { xMeters: 0, zMeters: 0 })).toBe(true);
    expect(onWalkableFloor(floor, inWall(metersFromInches(-50)))).toBe(false);
    expect(onWalkableFloor(floor, { xMeters: 0, zMeters: 10 })).toBe(false);
  });

  it("is a doorway through that wall, and not a window", () => {
    expect(onWalkableFloor(floor, inWall(0))).toBe(true);
    // The living room's own window, on its north wall, is no way out.
    const north = withOpenings(LIVING_ROOM, [LIVING_ROOM.openings[1]!]);
    const outside = { xMeters: 0, zMeters: metersFromInches(-72) - 0.05 };
    expect(
      onWalkableFloor(withRooms(LIVING_ROOM_FLOOR, [north]), outside),
    ).toBe(false);
  });

  it("is a place the whole walker fits, not only their middle", () => {
    // Middle on the floor, shoulder in the wall.
    const tight = {
      xMeters: eastFace - WALKER_RADIUS_METERS / 2,
      zMeters: metersFromInches(-50),
    };
    expect(onWalkableFloor(floor, tight)).toBe(true);
    expect(walkerFits(floor, tight)).toBe(false);
  });
});

describe("a step", () => {
  const walk = (
    from: { xMeters: number; zMeters: number },
    step: { dx: number; dz: number },
    times: number,
  ) => {
    let at = from;
    for (let index = 0; index < times; index += 1) {
      at = walkStep(floor, at, step);
    }
    return at;
  };

  it("goes through the door into the next room", () => {
    const at = walk(
      { xMeters: eastFace - 0.5, zMeters: 0 },
      { dx: 0.05, dz: 0 },
      40,
    );
    expect(at.xMeters).toBeGreaterThan(
      eastFace + thickness + WALKER_RADIUS_METERS,
    );
  });

  it("stops at the wall anywhere else", () => {
    const z = metersFromInches(-50);
    const at = walk(
      { xMeters: eastFace - 0.5, zMeters: z },
      { dx: 0.05, dz: 0 },
      40,
    );
    expect(at.xMeters).toBeLessThanOrEqual(eastFace - WALKER_RADIUS_METERS);
    expect(at.zMeters).toBe(z);
  });

  it("slides along a wall it is walked into at an angle", () => {
    const z = metersFromInches(-50);
    const against = {
      xMeters: eastFace - WALKER_RADIUS_METERS - 0.01,
      zMeters: z,
    };
    const at = walkStep(floor, against, { dx: 0.05, dz: 0.05 });
    expect(at.xMeters).toBe(against.xMeters);
    expect(at.zMeters).toBeCloseTo(z + 0.05, 12);
  });
});

describe("where a walk starts", () => {
  it("is the point asked for, when a person fits there", () => {
    expect(walkStart(floor, { xMeters: 0.3, zMeters: 0.2 })).toEqual({
      xMeters: 0.3,
      zMeters: 0.2,
    });
  });

  it("is the middle of a room when the point is outside", () => {
    expect(walkStart(floor, { xMeters: 0, zMeters: 50 })).toEqual({
      xMeters: expect.closeTo(0, 9),
      zMeters: expect.closeTo(0, 9),
    });
  });

  it("is nowhere on a floor with no rooms", () => {
    expect(
      walkStart(withRooms(LIVING_ROOM_FLOOR, []), { xMeters: 0, zMeters: 0 }),
    ).toBeNull();
  });
});
