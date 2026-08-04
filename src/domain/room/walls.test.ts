import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLOOR,
  exteriorThicknessMeters,
  interiorThicknessMeters,
  maxWallThicknessMeters,
  partitionThicknessMeters,
  type Floor,
} from "./floor";
import { createOpening } from "./openings";
import { checkOpening } from "./openings";
import {
  createRoom,
  withParts,
  withRoomPartWallOpen,
  withRoomWallThickness,
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
  it("reads a clipped corner as a wall of its own", () => {
    const clipped = roomOf("room-1", [
      part({
        id: "p1",
        cuts: { "north-west": { widthMeters: 1, depthMeters: 1 } },
      }),
    ]);
    const floor = floorOf([clipped]);
    const [section] = clipped.parts;

    // The chamfer is shell like the rest of the outside of the room.
    expect(wallStretches(floor, clipped, section!, "north-west")).toEqual([
      {
        startMeters: 0,
        endMeters: Math.SQRT2,
        kind: "exterior",
        thicknessMeters: EXTERIOR,
      },
    ]);
    // And the two walls it eats into are shorter by what it took.
    expect(wallStretches(floor, clipped, section!, "north")).toEqual([
      {
        startMeters: 0,
        endMeters: 3,
        kind: "exterior",
        thicknessMeters: EXTERIOR,
      },
    ]);
    expect(wallStretches(floor, clipped, section!, "west")).toEqual([
      {
        startMeters: 0,
        endMeters: 2,
        kind: "exterior",
        thicknessMeters: EXTERIOR,
      },
    ]);
  });

  it("has no stretches for a corner that was never clipped", () => {
    const square = roomOf("room-1", [part({ id: "p1" })]);

    expect(
      wallStretches(floorOf([square]), square, square.parts[0]!, "south-east"),
    ).toEqual([]);
  });

  it("lets a chamfer be left open, like any other wall", () => {
    const clipped = roomOf("room-1", [
      part({
        id: "p1",
        cuts: { "south-east": { widthMeters: 1, depthMeters: 1 } },
      }),
    ]);
    const open = withRoomPartWallOpen(clipped, "p1", "south-east", true);

    expect(
      wallStretches(floorOf([open]), open, open.parts[0]!, "south-east"),
    ).toEqual([
      {
        startMeters: 0,
        endMeters: Math.SQRT2,
        kind: "open",
        thicknessMeters: 0,
      },
    ]);
  });

  it("reads a lone room's walls as shell, end to end", () => {
    const alone = roomOf("room-1", [part({ id: "p1" })]);
    const floor = floorOf([alone]);

    expect(wallStretches(floor, alone, alone.parts[0]!, "north")).toEqual([
      {
        startMeters: 0,
        endMeters: 4,
        kind: "exterior",
        thicknessMeters: EXTERIOR,
      },
    ]);
    expect(wallStretches(floor, alone, alone.parts[0]!, "east")).toEqual([
      {
        startMeters: 0,
        endMeters: 3,
        kind: "exterior",
        thicknessMeters: EXTERIOR,
      },
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
      { startMeters: 0, endMeters: 2, kind: "seam", thicknessMeters: 0 },
      {
        startMeters: 2,
        endMeters: 4,
        kind: "exterior",
        thicknessMeters: EXTERIOR,
      },
    ]);
    expect(wallStretches(floor, l, l.parts[1]!, "north")).toEqual([
      { startMeters: 0, endMeters: 2, kind: "seam", thicknessMeters: 0 },
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
      {
        startMeters: 0,
        endMeters: 2,
        kind: "interior",
        thicknessMeters: INTERIOR,
      },
      {
        startMeters: 2,
        endMeters: 3,
        kind: "exterior",
        thicknessMeters: EXTERIOR,
      },
    ]);
  });

  it("keeps a distant room from thinning the shell", () => {
    const home = roomOf("room-1", [part({ id: "p1" })]);
    const acrossTheGarden = roomOf("room-2", [
      part({ id: "p2", origin: { xMeters: 4.4, zMeters: 0 } }),
    ]);
    const floor = floorOf([home, acrossTheGarden]);

    expect(wallStretches(floor, home, home.parts[0]!, "east")).toEqual([
      {
        startMeters: 0,
        endMeters: 3,
        kind: "exterior",
        thicknessMeters: EXTERIOR,
      },
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
      { startMeters: 0, endMeters: 2, kind: "seam", thicknessMeters: 0 },
      { startMeters: 2, endMeters: 4, kind: "open", thicknessMeters: 0 },
    ]);
  });

  it("measures a turned part's walls in its own frame", () => {
    const turned = roomOf("room-1", [
      part({ id: "p1", rotationRadians: Math.PI / 4 }),
    ]);
    const floor = floorOf([turned]);

    expect(wallStretches(floor, turned, turned.parts[0]!, "north")).toEqual([
      {
        startMeters: 0,
        endMeters: 4,
        kind: "exterior",
        thicknessMeters: EXTERIOR,
      },
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

describe("a room that declares its own wall thickness", () => {
  const FAT = 0.3;

  it("takes the floor's numbers until it says otherwise", () => {
    const room = roomOf("room-1", [part({ id: "p1" })]);
    const floor = floorOf([room]);

    expect(exteriorThicknessMeters(floor, room)).toBe(EXTERIOR);
    expect(interiorThicknessMeters(floor, room)).toBe(INTERIOR);
    // And with nothing to ask — a room being drawn — the floor answers.
    expect(exteriorThicknessMeters(floor, null)).toBe(EXTERIOR);
  });

  it("draws its own shell at its own thickness", () => {
    const room = withRoomWallThickness(
      roomOf("room-1", [part({ id: "p1" })]),
      "exterior",
      FAT,
    );
    const floor = floorOf([room]);

    expect(wallStretches(floor, room, room.parts[0]!, "north")).toEqual([
      { startMeters: 0, endMeters: 4, kind: "exterior", thicknessMeters: FAT },
    ]);
  });

  it("puts the thicker of the two rooms' numbers between them", () => {
    // The neighbour stands a fat thickness east, which is where it lands once
    // the two rooms have been snapped together.
    const home = withRoomWallThickness(
      roomOf("room-1", [part({ id: "p1" })]),
      "interior",
      FAT,
    );
    const thin = roomOf("room-2", [
      part({ id: "p2", origin: { xMeters: 4 + FAT, zMeters: 0 } }),
    ]);
    const floor = floorOf([home, thin]);

    // Read from either side, it is the same wall and the same number. A rule
    // that answered differently depending on which room asked would draw one
    // wall in two places.
    for (const [room, sibling] of [
      [home, thin],
      [thin, home],
    ] as const) {
      const wall = room.id === home.id ? "east" : "west";
      const stretches = wallStretches(floor, room, room.parts[0]!, wall);
      expect(stretches).toEqual([
        {
          startMeters: 0,
          endMeters: 3,
          kind: "interior",
          thicknessMeters: FAT,
        },
      ]);
      expect(partitionThicknessMeters(floor, room, sibling)).toBe(FAT);
    }
  });

  it("reads one wall as two stretches when two neighbours disagree", () => {
    // North half faces a fat-walled room, south half an ordinary one. Both are
    // set flush against the wall band each of them actually shares.
    const home = roomOf("room-1", [part({ id: "p1" })]);
    const fat = withRoomWallThickness(
      roomOf("room-2", [
        part({
          id: "p2",
          origin: { xMeters: 4 + FAT, zMeters: 0 },
          depthMeters: 1,
        }),
      ]),
      "interior",
      FAT,
    );
    const ordinary = roomOf("room-3", [
      part({
        id: "p3",
        origin: { xMeters: 4 + INTERIOR, zMeters: 1 },
        depthMeters: 2,
      }),
    ]);
    const floor = floorOf([home, fat, ordinary]);

    expect(wallStretches(floor, home, home.parts[0]!, "east")).toEqual([
      { startMeters: 0, endMeters: 1, kind: "interior", thicknessMeters: FAT },
      {
        startMeters: 1,
        endMeters: 3,
        kind: "interior",
        thicknessMeters: INTERIOR,
      },
    ]);
  });

  it("gives an overlapped stretch to the thicker of the two claims", () => {
    // Both neighbours cover the whole east wall: the fat one is further out,
    // but its band reaches the wall, so it is the wall that stands there.
    const home = roomOf("room-1", [part({ id: "p1" })]);
    const fat = withRoomWallThickness(
      roomOf("room-2", [
        part({ id: "p2", origin: { xMeters: 4 + FAT, zMeters: 0 } }),
      ]),
      "interior",
      FAT,
    );
    const ordinary = roomOf("room-3", [
      part({ id: "p3", origin: { xMeters: 4 + INTERIOR, zMeters: 0 } }),
    ]);
    const floor = floorOf([home, fat, ordinary]);

    expect(wallStretches(floor, home, home.parts[0]!, "east")).toEqual([
      { startMeters: 0, endMeters: 3, kind: "interior", thicknessMeters: FAT },
    ]);
  });

  it("cuts an opening as deep as the wall its own room declares", () => {
    const home = withRoomWallThickness(
      roomOf("room-1", [part({ id: "p1" })]),
      "exterior",
      FAT,
    );
    const floor = floorOf([home]);
    const window = createOpening("window", "w1", home, "north", 2, "p1");

    expect(openingWallThicknessMeters(floor, home, window)).toBe(FAT);
  });

  it("reports the fattest wall anywhere, defaults and overrides together", () => {
    const plain = roomOf("room-1", [part({ id: "p1" })]);
    const fat = withRoomWallThickness(
      roomOf("room-2", [
        part({ id: "p2", origin: { xMeters: 9, zMeters: 0 } }),
      ]),
      "interior",
      FAT,
    );

    expect(maxWallThicknessMeters(floorOf([plain]))).toBe(EXTERIOR);
    expect(maxWallThicknessMeters(floorOf([plain, fat]))).toBe(FAT);
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
