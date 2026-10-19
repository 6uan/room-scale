import { describe, expect, it } from "vitest";
import { DEFAULT_FLOOR } from "@/domain/room";
import { LIVING_ROOM } from "@/domain/room/fixtures";
import { createInstance, turnInstance } from "./instance";
import type { FurnitureProduct } from "./product";
import { wallGaps, withWallGap } from "./gaps";

/** A one-room apartment, four by three, north-west corner at the origin. */
const FLOOR = {
  ...DEFAULT_FLOOR,
  rooms: [
    {
      ...LIVING_ROOM,
      parts: [
        {
          id: "room-1-part-1",
          origin: { xMeters: 0, zMeters: 0 },
          widthMeters: 4,
          depthMeters: 3,
          rotationRadians: 0,
          openWalls: [],
        },
      ],
      openings: [],
    },
  ],
};

/** The same room as an L: a second section hanging off the south-east. */
const L_FLOOR = {
  ...FLOOR,
  rooms: [
    {
      ...FLOOR.rooms[0]!,
      parts: [
        ...FLOOR.rooms[0]!.parts,
        {
          id: "room-1-part-2",
          origin: { xMeters: 2, zMeters: 3 },
          widthMeters: 2,
          depthMeters: 2,
          rotationRadians: 0,
          openWalls: [],
        },
      ],
    },
  ],
};

/** Two wide, one deep. */
const SOFA: FurnitureProduct = {
  id: "sofa",
  name: "Sofa",
  retailer: "",
  productUrl: "",
  priceCents: 0,
  purchaseStatus: "considering",
  category: "seating",
  footprint: { widthMeters: 2, depthMeters: 1 },
  heightMeters: 0.8,
};

function sofaAt(xMeters: number, zMeters: number, rotationRadians = 0) {
  const instance = turnInstance(
    createInstance("i1", SOFA.id, { xMeters, zMeters }),
    rotationRadians,
  );
  return { instance, product: SOFA };
}

function gapsBySide(floor: typeof FLOOR, placed: ReturnType<typeof sofaAt>) {
  return Object.fromEntries(
    wallGaps(floor, placed).map((gap) => [gap.side, gap.gapMeters]),
  );
}

describe("wallGaps", () => {
  it("measures from each edge of the piece to the wall on that side", () => {
    const gaps = gapsBySide(FLOOR, sofaAt(1.5, 0.8));

    expect(gaps.west).toBeCloseTo(0.5, 10);
    expect(gaps.east).toBeCloseTo(1.5, 10);
    expect(gaps.north).toBeCloseTo(0.3, 10);
    expect(gaps.south).toBeCloseTo(1.7, 10);
  });

  it("measures a turned piece by its nearest point", () => {
    // A quarter turn: one wide, two deep, so the west gap is from x = 1.
    const gaps = gapsBySide(FLOOR, sofaAt(1.5, 1.5, Math.PI / 2));

    expect(gaps.west).toBeCloseTo(1, 10);
    expect(gaps.north).toBeCloseTo(0.5, 10);
  });

  it("reports a piece through a wall as a negative gap", () => {
    expect(gapsBySide(FLOOR, sofaAt(0.8, 1.5)).west).toBeCloseTo(-0.2, 10);
  });

  it("passes over the seam between two sections of an L", () => {
    // In the lower wing, whose west edge at x = 2 is a wall: the floor to the
    // west of it at z = 4 is not the room's. Its north edge at z = 3 is a
    // seam, so the north gap reaches the upper section's wall at z = 0.
    expect(gapsBySide(L_FLOOR, sofaAt(3, 4))).toEqual({
      west: 0,
      east: 0,
      north: 3.5,
      south: 0.5,
    });
  });

  it("has nothing to say about a piece in no room", () => {
    expect(wallGaps(FLOOR, sofaAt(10, 10))).toEqual([]);
  });

  it("ignores a turned section", () => {
    const turned = {
      ...FLOOR,
      rooms: FLOOR.rooms.map((room) => ({
        ...room,
        parts: room.parts.map((part) => ({ ...part, rotationRadians: 0.2 })),
      })),
    };

    expect(wallGaps(turned, sofaAt(2, 1.5))).toEqual([]);
  });
});

describe("withWallGap", () => {
  it("moves the piece so the gap on that side is what was typed", () => {
    const placed = sofaAt(1.5, 0.8);

    expect(withWallGap(FLOOR, placed, "west", 0.2).position).toEqual({
      xMeters: 1.2,
      zMeters: 0.8,
    });
    expect(withWallGap(FLOOR, placed, "south", 0.5).position).toEqual({
      xMeters: 1.5,
      zMeters: 2,
    });
  });

  it("leaves a piece in no room where it is", () => {
    const placed = sofaAt(10, 10);

    expect(withWallGap(FLOOR, placed, "west", 0.2)).toBe(placed.instance);
  });
});
