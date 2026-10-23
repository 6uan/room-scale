import { describe, expect, it } from "vitest";
import { DEFAULT_FLOOR } from "@/domain/room";
import { LIVING_ROOM } from "@/domain/room/fixtures";
import { createInstance, turnInstance } from "./instance";
import type { FurnitureProduct } from "./product";
import { groupGaps, nearestGaps, wallGaps, withWallGap } from "./gaps";

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
  purchaseStatus: "wanted",
  category: "seating",
  footprint: { widthMeters: 2, depthMeters: 1 },
  heightMeters: 0.8,
};

function sofaAt(
  xMeters: number,
  zMeters: number,
  rotationRadians = 0,
  id = "i1",
) {
  const instance = turnInstance(
    createInstance(id, SOFA.id, { xMeters, zMeters }),
    rotationRadians,
  );
  return { instance, product: SOFA };
}

/** The sofa's footprint on the floor, unturned. */
function sofaBox(placed: ReturnType<typeof sofaAt>) {
  const { position } = placed.instance;
  return {
    minZ: position.zMeters - SOFA.footprint.depthMeters / 2,
  };
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

describe("wallGaps with a closet section", () => {
  it("stops at a section's dividing wall rather than the room's far wall", () => {
    // A closet in the south-east corner: a section whose north and west
    // sides are kept as walls. A sofa north of it measures to the closet's
    // north wall, not to the room's south wall behind it.
    const closet = {
      ...FLOOR,
      rooms: FLOOR.rooms.map((room) => ({
        ...room,
        parts: [
          ...room.parts,
          {
            id: "room-1-part-2",
            origin: { xMeters: 2.5, zMeters: 2.2 },
            widthMeters: 1.5,
            depthMeters: 0.8,
            rotationRadians: 0,
            openWalls: [],
            dividingWalls: ["north" as const, "west" as const],
          },
        ],
      })),
    };
    const placed = sofaAt(3, 1);

    // To the band's outer face: the wall stands outside the section's edge.
    const gaps = gapsBySide(closet, placed);
    expect(gaps.south).toBeCloseTo(0.7 - DEFAULT_FLOOR.wallThicknessMeters, 10);
    expect(gaps.east).toBeCloseTo(0, 10);
    // North is the room's own north wall, not the closet's wall behind the
    // sofa: a wall on the far side of a piece is no gap on this side.
    expect(gaps.north).toBeGreaterThan(0);
    const box = sofaBox(placed);
    expect(gaps.north).toBeCloseTo(box.minZ, 10);
  });

  it("measures from inside the closet to the section's own edge", () => {
    const closet = {
      ...FLOOR,
      rooms: FLOOR.rooms.map((room) => ({
        ...room,
        parts: [
          ...room.parts,
          {
            id: "room-1-part-2",
            origin: { xMeters: 1.5, zMeters: 1.5 },
            widthMeters: 2.5,
            depthMeters: 1.5,
            rotationRadians: 0,
            openWalls: [],
            dividingWalls: ["north" as const, "west" as const],
          },
        ],
      })),
    };
    // A sofa standing in the closet, 10 cm off its north wall.
    const placed = sofaAt(3, 2.1);

    const gaps = gapsBySide(closet, placed);
    expect(gaps.north).toBeCloseTo(0.1, 10);
    expect(gaps.west).toBeCloseTo(0.5, 10);
  });
});

describe("nearestGaps", () => {
  it("stops at a piece standing in the way before the wall", () => {
    // Another sofa against the west wall, across from this one.
    const against = sofaAt(1, 0.8, 0, "i2");
    const placed = sofaAt(3, 0.8);

    const west = nearestGaps(FLOOR, [against, placed], placed).find(
      (gap) => gap.side === "west",
    );
    expect(west?.to).toBe("piece");
    expect(west?.gapMeters).toBeCloseTo(0, 10);
    expect(west?.faceMeters).toBeCloseTo(2, 10);
  });

  it("looks past a piece that is beside the middle rather than across it", () => {
    // A nightstand south of the sofa, under its east end only. The sofa's
    // middle runs clear of it, so the gap south is still to the wall.
    const stand = {
      instance: createInstance("i2", "stand", { xMeters: 2.25, zMeters: 2 }),
      product: {
        ...SOFA,
        id: "stand",
        footprint: { widthMeters: 0.5, depthMeters: 0.5 },
      },
    };
    const placed = sofaAt(1.5, 0.8);

    const south = nearestGaps(FLOOR, [stand, placed], placed).find(
      (gap) => gap.side === "south",
    );
    expect(south?.to).toBe("wall");
    expect(south?.alongMeters).toBe(1.5);
  });

  it("ignores a piece that is not across from this one", () => {
    // The same sofa, but down in the south half: nothing between this one
    // and the west wall at its own height.
    const aside = sofaAt(1, 2.5, 0, "i2");
    const placed = sofaAt(3, 0.8);

    const west = nearestGaps(FLOOR, [aside, placed], placed).find(
      (gap) => gap.side === "west",
    );
    expect(west?.to).toBe("wall");
    expect(west?.gapMeters).toBeCloseTo(2, 10);
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

describe("groupGaps", () => {
  // Two sofas end to end along the north wall, from x = 0.5 to 4.5 in a
  // room 4 wide... so use a wider stance: sofas at x = 1 and 3, z = 1.
  const sofas = [sofaAt(1, 1, 0, "a"), sofaAt(3, 1, 0, "b")];

  it("measures the rectangle around the group, not the grabbed piece", () => {
    const gaps = Object.fromEntries(
      groupGaps(FLOOR, sofas, ["a", "b"]).map((gap) => [gap.side, gap]),
    );
    // The group runs the room's full width, and stands 0.5 off the north
    // wall and 1.5 off the south one.
    expect(gaps.west?.gapMeters).toBeCloseTo(0, 9);
    expect(gaps.east?.gapMeters).toBeCloseTo(0, 9);
    expect(gaps.north?.gapMeters).toBeCloseTo(0.5, 9);
    expect(gaps.south?.gapMeters).toBeCloseTo(1.5, 9);
  });

  it("never measures a member against another member", () => {
    for (const gap of groupGaps(FLOOR, sofas, ["a", "b"])) {
      expect(gap.to).toBe("wall");
    }
  });

  it("stops at a piece outside the group that stands in the way", () => {
    const table = sofaAt(2, 2.5, 0, "table");
    const south = groupGaps(FLOOR, [...sofas, table], ["a", "b"]).find(
      (gap) => gap.side === "south",
    );
    expect(south?.to).toBe("piece");
    expect(south?.gapMeters).toBeCloseTo(0.5, 9);
  });

  it("has nothing for an empty group", () => {
    expect(groupGaps(FLOOR, sofas, [])).toEqual([]);
  });
});
