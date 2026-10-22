import { describe, expect, it } from "vitest";
import { metersFromInches } from "@/domain/units";
import { LIVING_ROOM, LIVING_ROOM_FLOOR } from "./fixtures";
import { apartmentShell, roomShell, type WallSlab } from "./shell";
import { withParts, withRoomPartRotation } from "./room";
import { withRooms } from "./floor";

const WIDTH = metersFromInches(168);
const DEPTH = metersFromInches(144);
const THICKNESS = LIVING_ROOM_FLOOR.wallThicknessMeters;

function wallFacing(walls: readonly WallSlab[], angle: number, z: number) {
  return walls.find(
    (wall) =>
      Math.abs(wall.angleRadians - angle) < 1e-9 &&
      Math.abs(wall.center.zMeters - z) < 1e-9,
  );
}

describe("roomShell", () => {
  const shell = roomShell(LIVING_ROOM_FLOOR, LIVING_ROOM);

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
      expect(wall.heightMeters).toBe(LIVING_ROOM.heightMeters);
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
    const part = LIVING_ROOM.parts[0];
    if (part === undefined) {
      throw new Error("fixture has no part");
    }
    const open = withParts(LIVING_ROOM, [{ ...part, openWalls: ["east"] }]);
    expect(roomShell(LIVING_ROOM_FLOOR, open).walls).toHaveLength(3);
  });

  it("turns the walls with a turned part", () => {
    const part = LIVING_ROOM.parts[0];
    if (part === undefined) {
      throw new Error("fixture has no part");
    }
    const turned = withRoomPartRotation(LIVING_ROOM, part.id, Math.PI / 2);
    const walls = roomShell(LIVING_ROOM_FLOOR, turned).walls;
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
    const part = LIVING_ROOM.parts[0];
    if (part === undefined) {
      throw new Error("fixture has no part");
    }
    // A second section flush against the east side: that side is a seam now,
    // and the second section's west side too.
    const lShaped = withParts(LIVING_ROOM, [
      part,
      {
        ...part,
        id: "part-2",
        origin: { xMeters: WIDTH / 2, zMeters: -DEPTH / 2 },
        widthMeters: 1,
      },
    ]);
    const shell = apartmentShell(withRooms(LIVING_ROOM_FLOOR, [lShaped]));
    expect(shell.floors).toHaveLength(2);
    expect(shell.walls).toHaveLength(6);
  });
});
