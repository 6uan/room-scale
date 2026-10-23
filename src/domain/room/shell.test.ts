import { describe, expect, it } from "vitest";
import { metersFromInches } from "@/domain/units";
import { LIVING_ROOM, LIVING_ROOM_FLOOR } from "./fixtures";
import { apartmentShell, roomShell, type WallSlab } from "./shell";
import { withOpenings, withParts, withRoomPartRotation } from "./room";
import { withOpeningHeights } from "./openings";
import { withRooms } from "./floor";

/**
 * The living room with nothing cut in it: these are about where walls stand,
 * and a door would split one into three.
 */
const BARE = { ...LIVING_ROOM, openings: [] };
const BARE_FLOOR = withRooms(LIVING_ROOM_FLOOR, [BARE]);

const WIDTH = metersFromInches(168);
const DEPTH = metersFromInches(144);
const THICKNESS = BARE_FLOOR.wallThicknessMeters;

function wallFacing(walls: readonly WallSlab[], angle: number, z: number) {
  return walls.find(
    (wall) =>
      Math.abs(wall.angleRadians - angle) < 1e-9 &&
      Math.abs(wall.center.zMeters - z) < 1e-9,
  );
}

describe("roomShell", () => {
  const shell = roomShell(BARE_FLOOR, BARE);

  it("lays one floor slab per part, on the part's own outline", () => {
    expect(shell.floors).toHaveLength(1);
    expect(shell.floors[0]?.polygon).toEqual([
      { xMeters: -WIDTH / 2, zMeters: -DEPTH / 2 },
      { xMeters: WIDTH / 2, zMeters: -DEPTH / 2 },
      { xMeters: WIDTH / 2, zMeters: DEPTH / 2 },
      { xMeters: -WIDTH / 2, zMeters: DEPTH / 2 },
    ]);
  });

  it("stands four walls, each as long as its side and as high as the room", () => {
    expect(shell.walls).toHaveLength(4);
    for (const wall of shell.walls) {
      expect(wall.heightMeters).toBe(BARE.heightMeters);
      expect(wall.thicknessMeters).toBe(THICKNESS);
    }
    const lengths = shell.walls.map((wall) => wall.lengthMeters).sort();
    expect(lengths).toEqual([DEPTH, DEPTH, WIDTH, WIDTH].sort());
  });

  it("stands each wall outside the floor it bounds", () => {
    // The north wall runs east along z = -depth/2, and its box sits north of
    // that line by half its thickness, so the inside face is the floor's edge.
    const north = wallFacing(shell.walls, 0, -DEPTH / 2 - THICKNESS / 2);
    expect(north).toBeDefined();
    expect(north?.center.xMeters).toBeCloseTo(0, 9);
    expect(north?.lengthMeters).toBeCloseTo(WIDTH, 9);
  });

  it("leaves a side marked open without a wall", () => {
    const part = BARE.parts[0];
    if (part === undefined) {
      throw new Error("fixture has no part");
    }
    const open = withParts(BARE, [{ ...part, openWalls: ["east"] }]);
    expect(roomShell(BARE_FLOOR, open).walls).toHaveLength(3);
  });

  it("turns the walls with a turned part", () => {
    const part = BARE.parts[0];
    if (part === undefined) {
      throw new Error("fixture has no part");
    }
    const turned = withRoomPartRotation(BARE, part.id, Math.PI / 2);
    const walls = roomShell(BARE_FLOOR, turned).walls;
    expect(walls).toHaveLength(4);
    // The long sides now run north-south, and the short ones east-west.
    for (const wall of walls) {
      const runsNorthSouth = Math.abs(Math.sin(wall.angleRadians)) > 0.5;
      expect(wall.lengthMeters).toBeCloseTo(runsNorthSouth ? WIDTH : DEPTH, 9);
    }
  });
});

describe("apartmentShell", () => {
  it("joins every room's slabs, and draws no wall along a seam between sections", () => {
    const part = BARE.parts[0];
    if (part === undefined) {
      throw new Error("fixture has no part");
    }
    // A second section flush against the east side: that side is a seam now,
    // and the second section's west side too.
    const lShaped = withParts(BARE, [
      part,
      {
        ...part,
        id: "part-2",
        origin: { xMeters: WIDTH / 2, zMeters: -DEPTH / 2 },
        widthMeters: 1,
      },
    ]);
    const shell = apartmentShell(withRooms(BARE_FLOOR, [lShaped]));
    expect(shell.floors).toHaveLength(2);
    expect(shell.walls).toHaveLength(6);
  });
});

/** The area a face covers: its outline less its holes, by the shoelace formula. */
function faceArea(wall: WallSlab): number {
  const area = (points: readonly { alongMeters: number; upMeters: number }[]) =>
    Math.abs(
      points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length]!;
        return (
          sum +
          point.alongMeters * next.upMeters -
          next.alongMeters * point.upMeters
        );
      }, 0),
    ) / 2;
  return (
    area(wall.outline) - wall.holes.reduce((sum, hole) => sum + area(hole), 0)
  );
}

describe("openings in the shell", () => {
  // The living room: 168 by 144 inches, 96 high, a 32" door centred 36" along
  // the south wall and a 48" window centred 84" along the north.
  const walls = roomShell(LIVING_ROOM_FLOOR, LIVING_ROOM).walls;
  const square = (inches: number) => inches * 0.0254 * 0.0254;
  const runsEastWest = (wall: WallSlab) =>
    Math.abs(Math.sin(wall.angleRadians)) < 0.5;
  const south = walls.filter(
    (wall) => runsEastWest(wall) && wall.center.zMeters > 0,
  );
  const north = walls.filter(
    (wall) => runsEastWest(wall) && wall.center.zMeters < 0,
  );

  it("cuts a door as a notch in one face, not three boxes", () => {
    expect(south).toHaveLength(1);
    expect(south[0]?.holes).toHaveLength(0);
    // Four corners and the door's four: up its jamb, across its head, down.
    expect(south[0]?.outline).toHaveLength(8);
    // The wall less exactly the door: 168 × 96, less 32 × 80.
    expect(faceArea(south[0]!)).toBeCloseTo(square(168 * 96 - 32 * 80), 9);
  });

  it("cuts a window as a hole in the face, between its sill and head", () => {
    expect(north).toHaveLength(1);
    expect(north[0]?.outline).toHaveLength(4);
    expect(north[0]?.holes).toHaveLength(1);
    const ups = north[0]!.holes[0]!.map((point) => point.upMeters / 0.0254);
    expect(Math.min(...ups)).toBeCloseTo(36, 9);
    expect(Math.max(...ups)).toBeCloseTo(84, 9);
    expect(faceArea(north[0]!)).toBeCloseTo(square(168 * 96 - 48 * 48), 9);
  });

  it("splits a wall where an opening runs from the floor to the ceiling", () => {
    const tall = withOpenings(
      LIVING_ROOM,
      LIVING_ROOM.openings.map((opening) =>
        withOpeningHeights(opening, {
          sillMeters: 0,
          headMeters: LIVING_ROOM.heightMeters,
        }),
      ),
    );
    const pieces = roomShell(withRooms(LIVING_ROOM_FLOOR, [tall]), tall).walls;
    const southPieces = pieces.filter(
      (wall) => runsEastWest(wall) && wall.center.zMeters > 0,
    );
    // Nothing above or below a full-height opening: two plain faces.
    expect(southPieces).toHaveLength(2);
    for (const piece of southPieces) {
      expect(piece.outline).toHaveLength(4);
      expect(piece.holes).toHaveLength(0);
    }
  });

  it("notches from the ceiling an opening that reaches it", () => {
    const high = withOpenings(LIVING_ROOM, [
      withOpeningHeights(LIVING_ROOM.openings[1]!, {
        headMeters: LIVING_ROOM.heightMeters,
      }),
    ]);
    const face = roomShell(
      withRooms(LIVING_ROOM_FLOOR, [high]),
      high,
    ).walls.find((wall) => runsEastWest(wall) && wall.center.zMeters < 0)!;
    expect(face.holes).toHaveLength(0);
    expect(face.outline).toHaveLength(8);
    expect(faceArea(face)).toBeCloseTo(square(168 * 96 - 48 * 60), 9);
  });

  it("takes a door at the very end of a wall into the corner", () => {
    // A 32" door hard against the wall's start corner.
    const corner = withOpenings(LIVING_ROOM, [
      { ...LIVING_ROOM.openings[0]!, centerMeters: metersFromInches(16) },
    ]);
    const face = roomShell(
      withRooms(LIVING_ROOM_FLOOR, [corner]),
      corner,
    ).walls.find((wall) => runsEastWest(wall) && wall.center.zMeters > 0)!;
    // An L: the notch has taken the corner, so six points, not eight.
    expect(face.outline).toHaveLength(6);
    expect(faceArea(face)).toBeCloseTo(square(168 * 96 - 32 * 80), 9);
  });

  it("opens a door in a shared wall through both rooms' copies of it", () => {
    // A second room east of the living room, one wall's thickness away, and
    // a door in the living room's east wall.
    const part = LIVING_ROOM.parts[0]!;
    const thickness = LIVING_ROOM_FLOOR.wallThicknessMeters;
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
    const door = {
      ...LIVING_ROOM.openings[0]!,
      id: "east-door",
      wall: "east" as const,
      centerMeters: metersFromInches(72),
    };
    const living = withOpenings(LIVING_ROOM, [door]);
    const shell = apartmentShell(withRooms(LIVING_ROOM_FLOOR, [living, next]));
    const notched = shell.walls.filter((wall) => wall.outline.length > 4);
    expect(notched.map((wall) => wall.roomId).sort()).toEqual([
      "room-1",
      "room-2",
    ]);
  });

  it("knows a wall between two rooms from a wall to the outside", () => {
    const part = BARE.parts[0]!;
    const thickness = BARE_FLOOR.wallThicknessMeters;
    const next = {
      ...BARE,
      id: "room-2",
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
    const shell = apartmentShell(withRooms(BARE_FLOOR, [BARE, next]));
    const interior = shell.walls.filter((wall) => wall.interior);
    expect(interior).toHaveLength(2);
    expect(interior.map((wall) => wall.roomId).sort()).toEqual([
      "room-1",
      "room-2",
    ]);
    expect(shell.walls.filter((wall) => !wall.interior)).toHaveLength(6);
  });
});
