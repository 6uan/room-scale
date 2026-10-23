import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLOOR,
  roomBounds,
  roomFloorAreaSquareMeters,
  withOrigin,
  withParts,
  type Floor,
  type Room,
} from "@/domain/room";
import { LIVING_ROOM } from "@/domain/room/fixtures";
import { inchesFromMeters, metersFromInches } from "@/domain/units";
import { createInstance, type PlacedFurniture } from "./instance";
import type { FurnitureProduct } from "./product";
import { roundPositions } from "./round-positions";

const INCH = metersFromInches(1);
const WALL = metersFromInches(1.5);

/** A room of `width` × `depth` inches with its corner at (x, z) inches. */
function room(id: string, x: number, z: number, width = 120, depth = 96) {
  return withOrigin(
    withParts({ ...LIVING_ROOM, id, name: id, openings: [] }, [
      {
        id: `${id}-part-1`,
        origin: { xMeters: 0, zMeters: 0 },
        widthMeters: metersFromInches(width),
        depthMeters: metersFromInches(depth),
        rotationRadians: 0,
        openWalls: [],
      },
    ]),
    { xMeters: metersFromInches(x), zMeters: metersFromInches(z) },
  );
}

function floorOf(...rooms: Room[]): Floor {
  return { ...DEFAULT_FLOOR, wallThicknessMeters: WALL, rooms };
}

const TABLE: FurnitureProduct = {
  id: "table",
  name: "Table",
  retailer: "",
  productUrl: "",
  priceCents: 0,
  purchaseStatus: "wanted",
  category: "table",
  footprint: {
    widthMeters: metersFromInches(30),
    depthMeters: metersFromInches(20),
  },
  heightMeters: 0.4,
};

function piece(id: string, x: number, z: number): PlacedFurniture {
  return {
    instance: createInstance(id, TABLE.id, {
      xMeters: metersFromInches(x),
      zMeters: metersFromInches(z),
    }),
    product: TABLE,
  };
}

/** Where a room's X/Y fields read, in inches. */
const cornerOf = (one: Room | undefined) => {
  const origin = one?.parts[0]?.origin;
  return [
    inchesFromMeters(origin?.xMeters ?? Number.NaN),
    inchesFromMeters(origin?.zMeters ?? Number.NaN),
  ];
};

const all = (floor: Floor, furniture: readonly PlacedFurniture[] = []) => ({
  roomIds: floor.rooms.map((one) => one.id),
  instanceIds: furniture.map(({ instance }) => instance.id),
});

describe("roundPositions", () => {
  it("moves a room to the nearest whole inch", () => {
    const floor = floorOf(room("a", 97.43, 154.34));
    const { rooms } = roundPositions(floor, [], all(floor), INCH);
    const [x, z] = cornerOf(rooms[0]);
    expect(x).toBeCloseTo(97, 9);
    expect(z).toBeCloseTo(154, 9);
  });

  it("never changes what a room measures, only where it is", () => {
    // Three rooms in a row sharing walls, one off on its own, one turned and
    // one built of two sections — every kind of room the floor has.
    const lShaped = withParts(room("l", 300.3, 10.6), [
      ...room("l", 300.3, 10.6).parts,
      {
        id: "l-part-2",
        origin: {
          xMeters: metersFromInches(300.3),
          zMeters: metersFromInches(106.6),
        },
        widthMeters: metersFromInches(40.25),
        depthMeters: metersFromInches(30.5),
        rotationRadians: 0,
        openWalls: [],
      },
    ]);
    const turned = withParts(room("t", -200.7, 50.2), [
      { ...room("t", -200.7, 50.2).parts[0]!, rotationRadians: Math.PI / 4 },
    ]);
    const floor = floorOf(
      room("a", 0.4, 0.3, 100.25, 80.5),
      room("b", 101.75, 0.3, 60, 80.5),
      room("c", 163.25, 0.3, 33.3, 80.5),
      room("far", 20.6, 300.9),
      lShaped,
      turned,
    );

    const { rooms } = roundPositions(floor, [], all(floor), INCH);

    floor.rooms.forEach((before, index) => {
      const after = rooms[index]!;
      expect(roomFloorAreaSquareMeters(after)).toBeCloseTo(
        roomFloorAreaSquareMeters(before),
        12,
      );
      const was = roomBounds(before);
      const is = roomBounds(after);
      expect(is.widthMeters).toBeCloseTo(was.widthMeters, 12);
      expect(is.depthMeters).toBeCloseTo(was.depthMeters, 12);
      after.parts.forEach((part, partIndex) => {
        const old = before.parts[partIndex]!;
        expect(part.widthMeters).toBe(old.widthMeters);
        expect(part.depthMeters).toBe(old.depthMeters);
        expect(part.rotationRadians).toBe(old.rotationRadians);
        expect(part.cuts).toEqual(old.cuts);
        // The sections of one room move together, by one amount.
        expect(part.origin.xMeters - old.origin.xMeters).toBeCloseTo(
          after.parts[0]!.origin.xMeters - before.parts[0]!.origin.xMeters,
          12,
        );
      });
    });
  });

  it("moves rooms that share a wall together, so the wall stays its thickness", () => {
    // 100.25" wide, then a 1.5" wall: the second room starts at 101.75.
    const floor = floorOf(
      room("a", 0.4, 0, 100.25),
      room("b", 101.75 + 0.4, 0),
    );
    const { rooms } = roundPositions(floor, [], all(floor), INCH);
    const [ax] = cornerOf(rooms[0]);
    const [bx] = cornerOf(rooms[1]);
    expect(ax).toBeCloseTo(0, 9);
    expect(bx! - ax!).toBeCloseTo(101.75, 9);
  });

  it("leaves a room alone on the axis it meets a room left out", () => {
    const floor = floorOf(room("a", 0.4, 0.4), room("b", 121.5 + 0.4, 0.4));
    const { rooms } = roundPositions(
      floor,
      [],
      { roomIds: ["a"], instanceIds: [] },
      INCH,
    );
    const [ax, az] = cornerOf(rooms[0]);
    // Held on x by b, which is not being rounded; free on z.
    expect(ax).toBeCloseTo(0.4, 9);
    expect(az).toBeCloseTo(0, 9);
  });

  it("will not round a room newly against another it was clear of", () => {
    // 2" apart: rounding a down by its 0.6" would leave 2.6", fine; rounding
    // b toward a would close to 1.4", inside one wall — so b goes the other way.
    const floor = floorOf(room("a", 0, 0, 100), room("b", 101.6, 0));
    const { rooms } = roundPositions(
      floor,
      [],
      { roomIds: ["b"], instanceIds: [] },
      INCH,
    );
    const [bx] = cornerOf(rooms[1]);
    expect(bx).toBeCloseTo(102, 9);
  });

  it("carries the pieces standing in a room, and rounds them in turn", () => {
    const floor = floorOf(room("a", 0.4, 0.3));
    const furniture = [piece("t", 60.7, 40.2)];
    const { instances } = roundPositions(
      floor,
      furniture,
      all(floor, furniture),
      INCH,
    );
    expect(inchesFromMeters(instances[0]!.position.xMeters)).toBeCloseTo(60, 9);
    expect(inchesFromMeters(instances[0]!.position.zMeters)).toBeCloseTo(40, 9);
  });

  it("keeps a piece against the wall it was pushed against", () => {
    // 30" wide against the west wall: its middle is 15" in, at 15.25 here
    // because the wall is at 0.25. Free along the wall, held off it.
    const floor = floorOf(room("a", 0.25, 0));
    const furniture = [piece("t", 15.25, 40.6)];
    const { instances } = roundPositions(
      floor,
      furniture,
      { roomIds: [], instanceIds: ["t"] },
      INCH,
    );
    expect(inchesFromMeters(instances[0]!.position.xMeters)).toBeCloseTo(
      15.25,
      9,
    );
    expect(inchesFromMeters(instances[0]!.position.zMeters)).toBeCloseTo(41, 9);
  });

  it("rounds the other way rather than push a piece into a wall", () => {
    // The wall is at 0.3, left where it is; the piece's west edge is 0.1"
    // off it. Rounding to 15 would put it 0.3" through, so it goes to 16.
    const floor = floorOf(room("a", 0.3, 0));
    const furniture = [piece("t", 15.4, 40)];
    const { instances } = roundPositions(
      floor,
      furniture,
      { roomIds: [], instanceIds: ["t"] },
      INCH,
    );
    expect(inchesFromMeters(instances[0]!.position.xMeters)).toBeCloseTo(16, 9);
  });

  it("moves touching pieces together, so they still touch", () => {
    const floor = floorOf(room("a", 0, 0));
    // Side by side, 30" wide each: touching at x = 70.4.
    const furniture = [piece("a1", 55.4, 40.4), piece("a2", 85.4, 40.4)];
    const { instances } = roundPositions(
      floor,
      furniture,
      all(floor, furniture),
      INCH,
    );
    const [one, two] = instances.map((instance) =>
      inchesFromMeters(instance.position.xMeters),
    );
    expect(one).toBeCloseTo(55, 9);
    expect(two! - one!).toBeCloseTo(30, 9);
  });
});
