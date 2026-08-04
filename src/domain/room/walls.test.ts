import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLOOR,
  maxWallThicknessMeters,
  sharedWallThicknessMeters,
  wallThicknessMeters,
  type Floor,
} from "./floor";
import { createOpening } from "./openings";
import { checkOpening } from "./openings";
import {
  createRoom,
  withOpenings,
  withParts,
  withRoomPartWallOpen,
  withRoomPartWallState,
  withRoomWallThickness,
  type Room,
  type RoomPart,
} from "./room";
import { openingWallThicknessMeters, wallStretches } from "./walls";

const THICKNESS = 0.1;

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
  return { ...DEFAULT_FLOOR, wallThicknessMeters: THICKNESS, rooms };
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
        kind: "wall",
        thicknessMeters: THICKNESS,
      },
    ]);
    // And the two walls it eats into are shorter by what it took.
    expect(wallStretches(floor, clipped, section!, "north")).toEqual([
      {
        startMeters: 0,
        endMeters: 3,
        kind: "wall",
        thicknessMeters: THICKNESS,
      },
    ]);
    expect(wallStretches(floor, clipped, section!, "west")).toEqual([
      {
        startMeters: 0,
        endMeters: 2,
        kind: "wall",
        thicknessMeters: THICKNESS,
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

  it("reads a lone room's walls as wall, end to end", () => {
    const alone = roomOf("room-1", [part({ id: "p1" })]);
    const floor = floorOf([alone]);

    expect(wallStretches(floor, alone, alone.parts[0]!, "north")).toEqual([
      {
        startMeters: 0,
        endMeters: 4,
        kind: "wall",
        thicknessMeters: THICKNESS,
      },
    ]);
    expect(wallStretches(floor, alone, alone.parts[0]!, "east")).toEqual([
      {
        startMeters: 0,
        endMeters: 3,
        kind: "wall",
        thicknessMeters: THICKNESS,
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
        kind: "wall",
        thicknessMeters: THICKNESS,
      },
    ]);
    expect(wallStretches(floor, l, l.parts[1]!, "north")).toEqual([
      { startMeters: 0, endMeters: 2, kind: "seam", thicknessMeters: 0 },
    ]);
  });

  /**
   * The load-bearing test of this model, and the reason the old one went.
   *
   * A wall used to be measured by what stood beyond it: partition where a
   * neighbour was, shell where none was. So a wall shared for part of its run
   * drew at two widths with a step where the neighbour ended, and an apartment
   * of a dozen rooms came out ragged. One wall is now one thickness, whatever
   * is on the far side of it.
   */
  it("draws the same wall whether or not a neighbour stands beyond it", () => {
    const home = roomOf("room-1", [part({ id: "p1" })]);
    // Flush against the east wall, across its upper two meters — the exact
    // case that used to split that wall into a partition and a shell.
    const neighbour = roomOf("room-2", [
      part({
        id: "p2",
        origin: { xMeters: 4 + THICKNESS, zMeters: 0 },
        widthMeters: 3,
        depthMeters: 2,
      }),
    ]);
    const alone = wallStretches(floorOf([home]), home, home.parts[0]!, "east");

    expect(alone).toEqual([
      {
        startMeters: 0,
        endMeters: 3,
        kind: "wall",
        thicknessMeters: THICKNESS,
      },
    ]);
    expect(
      wallStretches(floorOf([home, neighbour]), home, home.parts[0]!, "east"),
    ).toEqual(alone);
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

  /**
   * A laundry in the corner of a kitchen: one room's floor, with a wall
   * across it. Without saying so the side is a seam and nothing is drawn,
   * because the kitchen carries on beyond it.
   */
  it("keeps a wall across the room's own floor when the side says so", () => {
    const kitchen = roomOf("room-1", [
      part({ id: "big", widthMeters: 6, depthMeters: 4 }),
      part({
        id: "laundry",
        origin: { xMeters: 4, zMeters: 2 },
        widthMeters: 2,
        depthMeters: 2,
      }),
    ]);
    const floor = floorOf([kitchen]);
    const laundry = kitchen.parts[1]!;

    // Left alone, the laundry's north side is a seam: the kitchen is beyond it.
    expect(wallStretches(floor, kitchen, laundry, "north")).toEqual([
      { startMeters: 0, endMeters: 2, kind: "seam", thicknessMeters: 0 },
    ]);

    const divided = withRoomPartWallState(
      kitchen,
      "laundry",
      "north",
      "dividing",
    );
    expect(wallStretches(floor, divided, divided.parts[1]!, "north")).toEqual([
      {
        startMeters: 0,
        endMeters: 2,
        kind: "wall",
        thicknessMeters: THICKNESS,
      },
    ]);
  });

  it("hangs a door on a dividing wall, and refuses one on a seam", () => {
    const kitchen = roomOf("room-1", [
      part({ id: "big", widthMeters: 6, depthMeters: 4 }),
      part({
        id: "laundry",
        origin: { xMeters: 4, zMeters: 2 },
        widthMeters: 2,
        depthMeters: 2,
      }),
    ]);
    const door = createOpening("door", "d1", kitchen, "north", 1, "laundry");

    expect(checkOpening(withOpenings(kitchen, [door]), door)).toBe("off-wall");

    const divided = withRoomPartWallState(
      kitchen,
      "laundry",
      "north",
      "dividing",
    );
    expect(checkOpening(withOpenings(divided, [door]), door)).toBeNull();
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
        kind: "wall",
        thicknessMeters: THICKNESS,
      },
    ]);
  });
});

describe("a room that declares its own wall thickness", () => {
  const FAT = 0.3;

  it("takes the apartment's number until it says otherwise", () => {
    const room = roomOf("room-1", [part({ id: "p1" })]);
    const floor = floorOf([room]);

    expect(wallThicknessMeters(floor, room)).toBe(THICKNESS);
    // And with nothing to ask — a room being drawn — the apartment answers.
    expect(wallThicknessMeters(floor, null)).toBe(THICKNESS);
  });

  it("keeps its own number once it is typed, whatever the apartment says", () => {
    const measured = withRoomWallThickness(
      roomOf("room-1", [part({ id: "p1" })]),
      FAT,
    );
    const floor = floorOf([measured]);

    expect(wallStretches(floor, measured, measured.parts[0]!, "north")).toEqual(
      [{ startMeters: 0, endMeters: 4, kind: "wall", thicknessMeters: FAT }],
    );
    // The apartment moving does not reach a room that has been measured.
    expect(
      wallThicknessMeters({ ...floor, wallThicknessMeters: 0.02 }, measured),
    ).toBe(FAT);
  });

  it("hands the number back to the apartment when the override is cleared", () => {
    const measured = withRoomWallThickness(
      roomOf("room-1", [part({ id: "p1" })]),
      FAT,
    );
    const inherited = withRoomWallThickness(measured, null);

    expect(wallThicknessMeters(floorOf([inherited]), inherited)).toBe(
      THICKNESS,
    );
  });

  it("puts the thicker of two rooms' numbers in the gap between them", () => {
    // Which is what decides how far apart they land when one is snapped to
    // the other. Read from either side it has to be the same number, or the
    // same pair of rooms would snap to a different gap depending on which one
    // was dragged.
    const fat = withRoomWallThickness(
      roomOf("room-1", [part({ id: "p1" })]),
      FAT,
    );
    const thin = roomOf("room-2", [
      part({ id: "p2", origin: { xMeters: 4 + FAT, zMeters: 0 } }),
    ]);
    const floor = floorOf([fat, thin]);

    expect(sharedWallThicknessMeters(floor, fat, thin)).toBe(FAT);
    expect(sharedWallThicknessMeters(floor, thin, fat)).toBe(FAT);
  });

  it("cuts an opening as deep as the wall its own room declares", () => {
    const home = withRoomWallThickness(
      roomOf("room-1", [part({ id: "p1" })]),
      FAT,
    );
    const floor = floorOf([home]);
    const window = createOpening("window", "w1", home, "north", 2, "p1");

    expect(openingWallThicknessMeters(floor, home, window)).toBe(FAT);
  });

  it("reports the fattest wall anywhere, default and overrides together", () => {
    const plain = roomOf("room-1", [part({ id: "p1" })]);
    const fat = withRoomWallThickness(
      roomOf("room-2", [
        part({ id: "p2", origin: { xMeters: 9, zMeters: 0 } }),
      ]),
      FAT,
    );

    expect(maxWallThicknessMeters(floorOf([plain]))).toBe(THICKNESS);
    expect(maxWallThicknessMeters(floorOf([plain, fat]))).toBe(FAT);
  });
});

describe("openings and open walls", () => {
  it("cuts every doorway as deep as the wall its room is built of", () => {
    const home = roomOf("room-1", [part({ id: "p1" })]);
    const neighbour = roomOf("room-2", [
      part({ id: "p2", origin: { xMeters: 4 + THICKNESS, zMeters: 0 } }),
    ]);
    const floor = floorOf([home, neighbour]);

    const shared = createOpening("door", "d1", home, "east", 1.5, "p1");
    const outside = createOpening("window", "w1", home, "north", 2, "p1");

    // A door through a shared wall and a window through an outside one are
    // cut to the same depth: there is one wall thickness now.
    expect(openingWallThicknessMeters(floor, home, shared)).toBe(THICKNESS);
    expect(openingWallThicknessMeters(floor, home, outside)).toBe(THICKNESS);
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
