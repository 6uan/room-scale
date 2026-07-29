import { describe, expect, it } from "vitest";
import { metersFromInches } from "@/domain/units";
import { DEFAULT_ROOM } from "./room";
import {
  MIN_OPENING_METERS,
  checkOpening,
  createOpening,
  metersAlongWall,
  moveOpening,
  openingAtPoint,
  openingEndpoints,
  openingRangeMeters,
  pointAlongWall,
  resizeOpeningJamb,
  wallLengthMeters,
  wallOutwardNormal,
  wallPlacementAt,
  withOpeningWall,
  type Opening,
} from "./openings";

const ROOM = { ...DEFAULT_ROOM, widthMeters: 4, depthMeters: 3, openings: [] };

function passage(overrides: Partial<Opening> = {}): Opening {
  return {
    id: "test",
    kind: "passage",
    wall: "north",
    centerMeters: 2,
    widthMeters: 0.9144,
    ...overrides,
  } as Opening;
}

describe("walls", () => {
  it("measures north and south along the width, east and west along the depth", () => {
    expect(wallLengthMeters(ROOM, "north")).toBe(4);
    expect(wallLengthMeters(ROOM, "south")).toBe(4);
    expect(wallLengthMeters(ROOM, "east")).toBe(3);
    expect(wallLengthMeters(ROOM, "west")).toBe(3);
  });

  it("places a point on the inside face of each wall", () => {
    expect(pointAlongWall(ROOM, "north", 1)).toEqual({
      xMeters: 1,
      zMeters: 0,
    });
    expect(pointAlongWall(ROOM, "south", 1)).toEqual({
      xMeters: 1,
      zMeters: 3,
    });
    expect(pointAlongWall(ROOM, "west", 1)).toEqual({ xMeters: 0, zMeters: 1 });
    expect(pointAlongWall(ROOM, "east", 1)).toEqual({ xMeters: 4, zMeters: 1 });
  });

  it("points every normal away from the room", () => {
    expect(wallOutwardNormal("north")).toEqual({ dx: 0, dz: -1 });
    expect(wallOutwardNormal("south")).toEqual({ dx: 0, dz: 1 });
    expect(wallOutwardNormal("west")).toEqual({ dx: -1, dz: 0 });
    expect(wallOutwardNormal("east")).toEqual({ dx: 1, dz: 0 });
  });
});

describe("opening placement", () => {
  it("spans half its width either side of its center", () => {
    expect(
      openingRangeMeters(passage({ centerMeters: 2, widthMeters: 1 })),
    ).toEqual({ startMeters: 1.5, endMeters: 2.5 });
  });

  it("puts both jambs on the wall it belongs to", () => {
    const { start, end } = openingEndpoints(
      ROOM,
      passage({ wall: "east", centerMeters: 1.5, widthMeters: 1 }),
    );

    expect(start).toEqual({ xMeters: 4, zMeters: 1 });
    expect(end).toEqual({ xMeters: 4, zMeters: 2 });
  });

  it("measures pointer positions along horizontal and vertical walls", () => {
    const point = { xMeters: 1.25, zMeters: 2.5 };

    expect(metersAlongWall("north", point)).toBe(1.25);
    expect(metersAlongWall("east", point)).toBe(2.5);
  });

  it("finds the nearest wall within the pointer's reach", () => {
    expect(
      wallPlacementAt(ROOM, { xMeters: 1.25, zMeters: -0.05 }, 0.1),
    ).toEqual({ wall: "north", alongMeters: 1.25 });
    expect(wallPlacementAt(ROOM, { xMeters: 4.04, zMeters: 2.5 }, 0.1)).toEqual(
      { wall: "east", alongMeters: 2.5 },
    );
    expect(wallPlacementAt(ROOM, { xMeters: 2, zMeters: 1.5 }, 0.1)).toBeNull();
  });

  it("finds an opening through the gap it cuts in its wall", () => {
    const opening = passage({ centerMeters: 2, widthMeters: 1 });
    const room = { ...ROOM, openings: [opening] };

    expect(openingAtPoint(room, { xMeters: 2.4, zMeters: 0.04 }, 0.1)).toEqual(
      opening,
    );
    expect(
      openingAtPoint(room, { xMeters: 0.5, zMeters: 0.04 }, 0.1),
    ).toBeNull();
  });
});

describe("checkOpening", () => {
  it("accepts an opening well inside its wall", () => {
    expect(checkOpening(ROOM, passage())).toBeNull();
  });

  it("accepts an opening that reaches exactly to both corners", () => {
    expect(
      checkOpening(ROOM, passage({ centerMeters: 2, widthMeters: 4 })),
    ).toBeNull();
  });

  it("rejects an opening that runs past either end of its wall", () => {
    expect(
      checkOpening(ROOM, passage({ centerMeters: 0.2, widthMeters: 0.9144 })),
    ).toBe("off-wall");
    expect(
      checkOpening(ROOM, passage({ centerMeters: 3.8, widthMeters: 0.9144 })),
    ).toBe("off-wall");
  });

  it("measures against the wall it is on, not the widest wall", () => {
    // 2.8 m is comfortably inside the 4 m north wall and past the 3 m east one.
    const wide = passage({ centerMeters: 2.8, widthMeters: 0.9144 });

    expect(checkOpening(ROOM, wide)).toBeNull();
    expect(checkOpening(ROOM, { ...wide, wall: "east" })).toBe("off-wall");
  });

  it("rejects an opening narrower than the minimum", () => {
    expect(
      checkOpening(ROOM, passage({ widthMeters: MIN_OPENING_METERS - 0.001 })),
    ).toBe("too-narrow");
  });

  it("rejects values that are not real numbers", () => {
    expect(checkOpening(ROOM, passage({ centerMeters: Number.NaN }))).toBe(
      "not-a-number",
    );
  });
});

describe("createOpening", () => {
  it("centers a standard-width opening on the wall", () => {
    const door = createOpening("door", "d1", ROOM, "north");

    expect(door.kind).toBe("door");
    expect(door.centerMeters).toBe(2);
    expect(door.widthMeters).toBeCloseTo(metersFromInches(32), 10);
    expect(checkOpening(ROOM, door)).toBeNull();
  });

  it("hangs a new door on its start jamb, swinging into the room", () => {
    const door = createOpening("door", "d1", ROOM);

    expect(door).toMatchObject({ hinge: "start", swing: "inward" });
  });

  it("narrows an opening that would not fit the wall it is created on", () => {
    const narrow = { ...ROOM, depthMeters: 0.8 };
    const passageOpening = createOpening("passage", "p1", narrow, "east");

    expect(passageOpening.widthMeters).toBe(0.8);
    expect(checkOpening(narrow, passageOpening)).toBeNull();
  });

  it("places a new opening where the wall was clicked", () => {
    const door = createOpening("door", "d1", ROOM, "south", 0.25);

    expect(door.wall).toBe("south");
    expect(door.centerMeters).toBeCloseTo(door.widthMeters / 2, 10);
    expect(checkOpening(ROOM, door)).toBeNull();
  });
});

describe("withOpeningWall", () => {
  it("keeps an opening on the wall it is moved to", () => {
    // Near the far end of the 4 m north wall, moved to the 3 m east wall.
    const moved = withOpeningWall(
      ROOM,
      passage({ centerMeters: 3.5, widthMeters: 0.9144 }),
      "east",
    );

    expect(moved.wall).toBe("east");
    expect(checkOpening(ROOM, moved)).toBeNull();
    expect(moved.centerMeters).toBeCloseTo(3 - 0.9144 / 2, 10);
  });

  it("leaves an opening that already fits where it was", () => {
    const moved = withOpeningWall(ROOM, passage({ centerMeters: 1.5 }), "east");

    expect(moved.centerMeters).toBe(1.5);
  });
});

describe("pointer editing", () => {
  it("moves an opening along its wall and stops at either corner", () => {
    const opening = passage({ centerMeters: 2, widthMeters: 1 });

    expect(moveOpening(ROOM, opening, 2.75).centerMeters).toBe(2.75);
    expect(moveOpening(ROOM, opening, -2).centerMeters).toBe(0.5);
    expect(moveOpening(ROOM, opening, 9).centerMeters).toBe(3.5);
  });

  it("resizes from one jamb while leaving the other in place", () => {
    const opening = passage({ centerMeters: 2, widthMeters: 1 });

    const fromStart = resizeOpeningJamb(ROOM, opening, "start", 1);
    expect(openingRangeMeters(fromStart)).toEqual({
      startMeters: 1,
      endMeters: 2.5,
    });

    const fromEnd = resizeOpeningJamb(ROOM, opening, "end", 3);
    expect(openingRangeMeters(fromEnd)).toEqual({
      startMeters: 1.5,
      endMeters: 3,
    });
  });

  it("keeps a resized jamb on the wall and preserves the minimum width", () => {
    const opening = passage({ centerMeters: 2, widthMeters: 1 });

    const pastStart = resizeOpeningJamb(ROOM, opening, "start", -5);
    expect(openingRangeMeters(pastStart).startMeters).toBe(0);

    const throughEnd = resizeOpeningJamb(ROOM, opening, "start", 9);
    expect(throughEnd.widthMeters).toBeCloseTo(MIN_OPENING_METERS, 10);

    const pastEnd = resizeOpeningJamb(ROOM, opening, "end", 9);
    expect(openingRangeMeters(pastEnd).endMeters).toBe(4);
  });
});
