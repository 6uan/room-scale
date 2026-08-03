import { describe, expect, it } from "vitest";
import { DEFAULT_FLOOR, type Floor } from "./floor";
import { createOpening } from "./openings";
import { checkOpening } from "./openings";
import {
  createRoom,
  withParts,
  withRoomPartWallOpen,
  type Room,
  type RoomPart,
} from "./room";
import { openingWallThicknessMeters, wallStretches } from "./walls";

const INTERIOR = 0.1;
const EXTERIOR = 0.25;

function part(overrides: Partial<RoomPart> & { id: string }): RoomPart {
  return {
    origin: { xMeters: 0, zMeters: 0 },
    widthMeters: 4,
    depthMeters: 3,
    rotationRadians: 0,
    openWalls: [],
    ...overrides,
  };
}

function roomOf(id: string, parts: readonly RoomPart[]): Room {
  return withParts(
    { ...createRoom(id, id, { xMeters: 0, zMeters: 0 }), openings: [] },
    parts,
  );
}

function floorOf(rooms: readonly Room[]): Floor {
  return {
    ...DEFAULT_FLOOR,
    exteriorWallThicknessMeters: EXTERIOR,
    interiorWallThicknessMeters: INTERIOR,
    rooms,
  };
}

describe("wallStretches", () => {
  it("reads a lone room's walls as shell, end to end", () => {
    const alone = roomOf("room-1", [part({ id: "p1" })]);
    const floor = floorOf([alone]);

    expect(wallStretches(floor, alone, alone.parts[0]!, "north")).toEqual([
      { startMeters: 0, endMeters: 4, kind: "exterior" },
    ]);
    expect(wallStretches(floor, alone, alone.parts[0]!, "east")).toEqual([
      { startMeters: 0, endMeters: 3, kind: "exterior" },
    ]);
  });

  it("cuts the seam out where the room's own floor continues", () => {
    // An L: the second part hangs below the west half of the first.
    const l = roomOf("room-1", [
      part({ id: "p1", depthMeters: 2 }),
      part({
        id: "p2",
        origin: { xMeters: 0, zMeters: 2 },
        widthMeters: 2,
        depthMeters: 2,
      }),
    ]);
    const floor = floorOf([l]);

    expect(wallStretches(floor, l, l.parts[0]!, "south")).toEqual([
      { startMeters: 0, endMeters: 2, kind: "seam" },
      { startMeters: 2, endMeters: 4, kind: "exterior" },
    ]);
    expect(wallStretches(floor, l, l.parts[1]!, "north")).toEqual([
      { startMeters: 0, endMeters: 2, kind: "seam" },
    ]);
  });

  it("reads a wall as partition exactly where a neighbour stands beyond it", () => {
    const home = roomOf("room-1", [part({ id: "p1" })]);
    // One interior thickness past the east wall, spanning its upper two meters.
    const neighbour = roomOf("room-2", [
      part({
        id: "p2",
        origin: { xMeters: 4 + INTERIOR, zMeters: 0 },
        widthMeters: 3,
        depthMeters: 2,
      }),
    ]);
    const floor = floorOf([home, neighbour]);

    expect(wallStretches(floor, home, home.parts[0]!, "east")).toEqual([
      { startMeters: 0, endMeters: 2, kind: "interior" },
      { startMeters: 2, endMeters: 3, kind: "exterior" },
    ]);
  });

  it("keeps a distant room from thinning the shell", () => {
    const home = roomOf("room-1", [part({ id: "p1" })]);
    const acrossTheGarden = roomOf("room-2", [
      part({ id: "p2", origin: { xMeters: 4.4, zMeters: 0 } }),
    ]);
    const floor = floorOf([home, acrossTheGarden]);

    expect(wallStretches(floor, home, home.parts[0]!, "east")).toEqual([
      { startMeters: 0, endMeters: 3, kind: "exterior" },
    ]);
  });

  it("marks an open wall open, but never where the room continues through", () => {
    const l = withRoomPartWallOpen(
      roomOf("room-1", [
        part({ id: "p1", depthMeters: 2 }),
        part({
          id: "p2",
          origin: { xMeters: 0, zMeters: 2 },
          widthMeters: 2,
          depthMeters: 2,
        }),
      ]),
      "p1",
      "south",
      true,
    );
    const floor = floorOf([l]);

    expect(wallStretches(floor, l, l.parts[0]!, "south")).toEqual([
      { startMeters: 0, endMeters: 2, kind: "seam" },
      { startMeters: 2, endMeters: 4, kind: "open" },
    ]);
  });

  it("measures a turned part's walls in its own frame", () => {
    const turned = roomOf("room-1", [
      part({ id: "p1", rotationRadians: Math.PI / 4 }),
    ]);
    const floor = floorOf([turned]);

    expect(wallStretches(floor, turned, turned.parts[0]!, "north")).toEqual([
      { startMeters: 0, endMeters: 4, kind: "exterior" },
    ]);
  });

  it("finds a parallel turned neighbour across a turned wall", () => {
    // Both parts turned 45°; the neighbour's south wall floats one interior
    // thickness outside the subject's north wall, covering its whole length.
    const normal = { dx: Math.SQRT2 / 2, dz: -Math.SQRT2 / 2 };
    const reach = INTERIOR + 2;
    const home = roomOf("room-1", [
      part({ id: "p1", rotationRadians: Math.PI / 4 }),
    ]);
    const neighbour = roomOf("room-2", [
      part({
        id: "p2",
        origin: { xMeters: normal.dx * reach, zMeters: normal.dz * reach },
        widthMeters: 4,
        depthMeters: 2,
        rotationRadians: Math.PI / 4,
      }),
    ]);
    const floor = floorOf([home, neighbour]);

    const stretches = wallStretches(floor, home, home.parts[0]!, "north");
    expect(stretches).toHaveLength(1);
    expect(stretches[0]?.kind).toBe("interior");
    expect(stretches[0]?.startMeters).toBeCloseTo(0, 6);
    expect(stretches[0]?.endMeters).toBeCloseTo(4, 6);
  });
});

describe("openings and open walls", () => {
  it("cuts a doorway as deep as the wall that actually stands there", () => {
    const home = roomOf("room-1", [part({ id: "p1" })]);
    const neighbour = roomOf("room-2", [
      part({
        id: "p2",
        origin: { xMeters: 4 + INTERIOR, zMeters: 0 },
      }),
    ]);
    const floor = floorOf([home, neighbour]);

    const shared = createOpening("door", "d1", home, "east", 1.5, "p1");
    const shell = createOpening("window", "w1", home, "north", 2, "p1");

    expect(openingWallThicknessMeters(floor, home, shared)).toBe(INTERIOR);
    expect(openingWallThicknessMeters(floor, home, shell)).toBe(EXTERIOR);
  });

  it("refuses an opening on a wall that is not there", () => {
    const open = withRoomPartWallOpen(
      roomOf("room-1", [part({ id: "p1" })]),
      "p1",
      "north",
      true,
    );
    const door = createOpening("door", "d1", open, "north", 2, "p1");

    expect(checkOpening(open, door)).toBe("open-wall");
    expect(
      checkOpening(withRoomPartWallOpen(open, "p1", "north", false), door),
    ).toBeNull();
  });
});
