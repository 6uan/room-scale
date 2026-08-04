import { describe, expect, it } from "vitest";
import { turnedRectCorners, turnedUnionArea } from "@/domain/geometry";
import { LIVING_ROOM } from "./fixtures";
import {
  checkOpening,
  createOpening,
  partWallFrame,
  partWallSides,
  pointAlongWall,
  wallLengthMeters,
  type Opening,
} from "./openings";
import {
  checkRoomPartCuts,
  cutLegLimits,
  isValidRoom,
  partWallLengthMeters,
  primaryRoomPart,
  roomFloorAreaSquareMeters,
  roomPartContains,
  roomPartPolygon,
  withParts,
  withOpenings,
  withRoomPartCut,
  type Room,
  type RoomPart,
} from "./room";

const SQUARE: RoomPart = {
  id: "p1",
  origin: { xMeters: 0, zMeters: 0 },
  widthMeters: 4,
  depthMeters: 3,
  rotationRadians: 0,
  openWalls: [],
};

/** That rectangle with a metre taken off its north-west corner each way. */
const CLIPPED: RoomPart = {
  ...SQUARE,
  cuts: { "north-west": { widthMeters: 1, depthMeters: 1 } },
};

function roomOf(part: RoomPart): Room {
  return withParts(
    {
      id: "room-1",
      name: "Room",
      heightMeters: 2.4,
      parts: [],
      openings: [],
      exteriorWallThicknessMeters: null,
      interiorWallThicknessMeters: null,
    },
    [part],
  );
}

/**
 * The load-bearing test. Cuts are optional, and a part without them has to
 * come back through every one of these paths with exactly the answer it gave
 * before there was such a thing as a cut — not nearly, and not to twelve
 * places.
 */
describe("a part with no cuts", () => {
  it("has the four corners it always had, as its outline", () => {
    expect(roomPartPolygon(SQUARE)).toEqual(turnedRectCorners(SQUARE));

    const turned = { ...SQUARE, rotationRadians: Math.PI / 5 };
    expect(roomPartPolygon(turned)).toEqual(turnedRectCorners(turned));
  });

  it("measures its walls as exactly its own width and depth", () => {
    expect(partWallLengthMeters(SQUARE, "north")).toBe(4);
    expect(partWallLengthMeters(SQUARE, "south")).toBe(4);
    expect(partWallLengthMeters(SQUARE, "east")).toBe(3);
    expect(partWallLengthMeters(SQUARE, "west")).toBe(3);
  });

  it("has four walls, and offers no chamfer to put a door on", () => {
    expect(partWallSides(SQUARE)).toEqual(["north", "east", "south", "west"]);
  });

  it("keeps the exact area arithmetic a union of rectangles has", () => {
    const room = withParts(roomOf(SQUARE), [
      SQUARE,
      { ...SQUARE, id: "p2", origin: { xMeters: 3, zMeters: 2 } },
    ]);

    expect(roomFloorAreaSquareMeters(room)).toBe(turnedUnionArea(room.parts));
  });

  it("starts each wall where it has always started", () => {
    const room = roomOf(SQUARE);

    expect(pointAlongWall(room, "north", 1)).toEqual({
      xMeters: 1,
      zMeters: 0,
    });
    expect(pointAlongWall(room, "west", 1)).toEqual({ xMeters: 0, zMeters: 1 });
  });
});

describe("a clipped corner", () => {
  it("puts two points where the corner was", () => {
    expect(roomPartPolygon(CLIPPED)).toEqual([
      { xMeters: 0, zMeters: 1 },
      { xMeters: 1, zMeters: 0 },
      { xMeters: 4, zMeters: 0 },
      { xMeters: 4, zMeters: 3 },
      { xMeters: 0, zMeters: 3 },
    ]);
  });

  it("takes exactly the triangle off the floor area", () => {
    expect(roomFloorAreaSquareMeters(roomOf(CLIPPED))).toBeCloseTo(
      4 * 3 - (1 * 1) / 2,
      12,
    );
  });

  it("is not forced to 45°: the two legs are measured separately", () => {
    const shallow = {
      ...SQUARE,
      cuts: { "north-west": { widthMeters: 2, depthMeters: 1 } },
    };

    expect(roomFloorAreaSquareMeters(roomOf(shallow))).toBeCloseTo(
      4 * 3 - (2 * 1) / 2,
      12,
    );
    expect(partWallLengthMeters(shallow, "north-west")).toBeCloseTo(
      Math.hypot(2, 1),
      12,
    );
  });

  it("is floor the room does not have", () => {
    // Inside the rectangle it was drawn as, but on the far side of the chamfer.
    expect(roomPartContains(CLIPPED, { xMeters: 0.2, zMeters: 0.2 })).toBe(
      false,
    );
    // The same corner of the same rectangle, before it was clipped.
    expect(roomPartContains(SQUARE, { xMeters: 0.2, zMeters: 0.2 })).toBe(true);
    // Just inside the chamfer, which runs from (0, 1) to (1, 0).
    expect(roomPartContains(CLIPPED, { xMeters: 0.6, zMeters: 0.6 })).toBe(
      true,
    );
  });

  it("shortens the two walls it meets, and moves where they start", () => {
    expect(partWallLengthMeters(CLIPPED, "north")).toBe(3);
    expect(partWallLengthMeters(CLIPPED, "west")).toBe(2);
    // The south and east walls are untouched by a cut at the far corner.
    expect(partWallLengthMeters(CLIPPED, "south")).toBe(4);
    expect(partWallLengthMeters(CLIPPED, "east")).toBe(3);

    const room = roomOf(CLIPPED);
    // A metre along the north wall is measured from the end of the chamfer,
    // which is where a tape run along that wall would start.
    expect(pointAlongWall(room, "north", 1)).toEqual({
      xMeters: 2,
      zMeters: 0,
    });
  });

  it("is a wall itself, with a length and a direction out of the room", () => {
    expect(partWallSides(CLIPPED)).toEqual([
      "north",
      "east",
      "south",
      "west",
      "north-west",
    ]);
    expect(partWallLengthMeters(CLIPPED, "north-west")).toBeCloseTo(
      Math.SQRT2,
      12,
    );

    const frame = partWallFrame(CLIPPED, "north-west");
    // Out of the room is up and to the left, away from its middle.
    expect(frame.normal.dx).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(frame.normal.dz).toBeCloseTo(-Math.SQRT1_2, 12);
  });

  it("travels with the section's own turn", () => {
    const turned = { ...CLIPPED, rotationRadians: Math.PI / 2 };
    const [first] = roomPartPolygon(turned);

    // A quarter turn carries the local (0, 1) round to (-1, 0).
    expect(first?.xMeters).toBeCloseTo(-1, 12);
    expect(first?.zMeters).toBeCloseTo(0, 12);
  });
});

describe("an opening on a chamfer", () => {
  const room = roomOf(CLIPPED);

  it("measures along the chamfer, from its western end", () => {
    expect(wallLengthMeters(room, "north-west", "p1")).toBeCloseTo(
      Math.SQRT2,
      12,
    );

    // Half way along it is the middle of the chamfer: (0.5, 0.5).
    const middle = pointAlongWall(room, "north-west", Math.SQRT2 / 2, "p1");
    expect(middle.xMeters).toBeCloseTo(0.5, 12);
    expect(middle.zMeters).toBeCloseTo(0.5, 12);
  });

  it("is a door like any other, and says so when it runs off the end", () => {
    const door = createOpening(
      "door",
      "d1",
      room,
      "north-west",
      undefined,
      "p1",
    );
    const withDoor = withOpenings(room, [door]);

    expect(checkOpening(withDoor, door)).toBeNull();
    expect(door.widthMeters).toBeLessThanOrEqual(Math.SQRT2);

    const overhanging: Opening = { ...door, centerMeters: Math.SQRT2 };
    expect(checkOpening(withOpenings(room, [overhanging]), overhanging)).toBe(
      "off-wall",
    );
  });

  it("has nowhere to be when the corner is square", () => {
    const square = roomOf(SQUARE);
    const door = createOpening("door", "d1", square, "north-west", 0.5, "p1");

    expect(checkOpening(withOpenings(square, [door]), door)).toBe("off-wall");
  });
});

describe("what a cut is allowed to be", () => {
  it("accepts a corner that fits on both its sides", () => {
    expect(checkRoomPartCuts(CLIPPED)).toBeNull();
    expect(isValidRoom(roomOf(CLIPPED))).toBe(true);
  });

  it("rejects two cuts longer between them than the side they share", () => {
    const both: RoomPart = {
      ...SQUARE,
      cuts: {
        "north-west": { widthMeters: 3, depthMeters: 1 },
        "north-east": { widthMeters: 2, depthMeters: 1 },
      },
    };

    expect(checkRoomPartCuts(both)).toBe("overruns-side");
    expect(isValidRoom(roomOf(both))).toBe(false);
  });

  it("accepts two cuts that use the side up exactly", () => {
    const both: RoomPart = {
      ...SQUARE,
      cuts: {
        "north-west": { widthMeters: 3, depthMeters: 1 },
        "north-east": { widthMeters: 1, depthMeters: 1 },
      },
    };

    expect(checkRoomPartCuts(both)).toBeNull();
    // The north wall is used up: there is no square side left between them.
    expect(partWallSides(both)).not.toContain("north");
  });

  it("rejects a leg that is not a number, or is no cut at all", () => {
    expect(
      checkRoomPartCuts({
        ...SQUARE,
        cuts: { "south-east": { widthMeters: Number.NaN, depthMeters: 1 } },
      }),
    ).toBe("not-a-number");
    expect(
      checkRoomPartCuts({
        ...SQUARE,
        cuts: { "south-east": { widthMeters: 0, depthMeters: 1 } },
      }),
    ).toBe("too-small");
  });

  it("holds a field to what the cut at the far end has left", () => {
    const both: RoomPart = {
      ...SQUARE,
      cuts: {
        "north-west": { widthMeters: 1, depthMeters: 1 },
        "north-east": { widthMeters: 1.5, depthMeters: 1 },
      },
    };

    // The north side is 4 m and the north-east corner already takes 1.5 of it.
    expect(cutLegLimits(both, "north-west", "widthMeters").maxMeters).toBe(2.5);
    // The west side is 3 m and nothing is cut off its southern end.
    expect(cutLegLimits(both, "north-west", "depthMeters").maxMeters).toBe(3);
  });
});

describe("editing a corner", () => {
  it("clips it and squares it again, leaving the rectangle alone", () => {
    const room = roomOf(SQUARE);
    const clipped = withRoomPartCut(room, "p1", "south-east", {
      widthMeters: 0.5,
      depthMeters: 0.75,
    });

    expect(roomFloorAreaSquareMeters(clipped)).toBeCloseTo(
      12 - (0.5 * 0.75) / 2,
      12,
    );
    expect(primaryRoomPart(clipped).widthMeters).toBe(4);

    const squared = withRoomPartCut(clipped, "p1", "south-east", null);
    expect(roomFloorAreaSquareMeters(squared)).toBe(12);
    expect(roomPartPolygon(primaryRoomPart(squared))).toHaveLength(4);
  });

  it("leaves the ordinary room the application ships exactly as it was", () => {
    expect(roomPartPolygon(primaryRoomPart(LIVING_ROOM))).toEqual(
      turnedRectCorners(primaryRoomPart(LIVING_ROOM)),
    );
    expect(roomFloorAreaSquareMeters(LIVING_ROOM)).toBe(
      turnedUnionArea(LIVING_ROOM.parts),
    );
  });
});
