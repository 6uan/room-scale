import { describe, expect, it } from "vitest";
import { DEFAULT_FLOOR, SNAP_METERS } from "@/domain/room";
import { LIVING_ROOM } from "@/domain/room/fixtures";
import { createInstance, turnInstance } from "./instance";
import type { FurnitureProduct } from "./product";
import {
  NO_HOLD,
  heldSnap,
  snapGroupDelta,
  snapInstancePosition,
} from "./snap";

/** A one-room apartment, four by three, with its north-west corner at the origin. */
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

describe("snapInstancePosition", () => {
  it("pulls a piece let go just short of a wall flush against it", () => {
    // Its back edge 3 cm off the north wall: the center lands at half its depth.
    const placed = sofaAt(2, 0.53);

    expect(
      snapInstancePosition(FLOOR, [placed], placed, placed.instance.position),
    ).toEqual({ xMeters: 2, zMeters: 0.5 });
  });

  it("snaps each axis on its own, so a corner lands in the corner", () => {
    const placed = sofaAt(1.03, 2.48);

    expect(
      snapInstancePosition(FLOOR, [placed], placed, placed.instance.position),
    ).toEqual({ xMeters: 1, zMeters: 2.5 });
  });

  it("leaves a piece alone when nothing is within reach", () => {
    const placed = sofaAt(2, 1.5);

    expect(
      snapInstancePosition(FLOOR, [placed], placed, placed.instance.position),
    ).toEqual({ xMeters: 2, zMeters: 1.5 });
  });

  it("does not reach further than the room snap does", () => {
    const placed = sofaAt(2, 0.5 + SNAP_METERS);

    expect(
      snapInstancePosition(FLOOR, [placed], placed, placed.instance.position)
        .zMeters,
    ).toBe(0.5 + SNAP_METERS);
  });

  it("snaps a turned piece by its bounding box", () => {
    // Turned a quarter: now one wide and two deep, so flush against the west
    // wall means its center is half a meter in.
    const placed = sofaAt(0.47, 1.5, Math.PI / 2);

    const snapped = snapInstancePosition(
      FLOOR,
      [placed],
      placed,
      placed.instance.position,
    );
    expect(snapped.xMeters).toBeCloseTo(0.5, 10);
    expect(snapped.zMeters).toBe(1.5);
  });

  it("offers a turned room no faces at all", () => {
    const turned = {
      ...FLOOR,
      rooms: FLOOR.rooms.map((room) => ({
        ...room,
        parts: room.parts.map((part) => ({ ...part, rotationRadians: 0.3 })),
      })),
    };
    const placed = sofaAt(2, 0.53);

    expect(
      snapInstancePosition(turned, [placed], placed, placed.instance.position),
    ).toEqual({ xMeters: 2, zMeters: 0.53 });
  });

  it("lands a piece against another piece it is let go beside", () => {
    // A sofa standing with its east edge at x = 2.5; the dragged one let go
    // 3 cm short of touching it.
    const standing = sofaAt(1.5, 1.5, 0, "i2");
    const placed = sofaAt(3.53, 1.5);

    expect(
      snapInstancePosition(
        FLOOR,
        [standing, placed],
        placed,
        placed.instance.position,
      ),
    ).toEqual({ xMeters: 3.5, zMeters: 1.5 });
  });

  it("lines a piece up with another piece's edge", () => {
    // Below the standing sofa, 2 cm off having the same west edge.
    const standing = sofaAt(1.5, 0.5, 0, "i2");
    const placed = sofaAt(1.52, 2);

    expect(
      snapInstancePosition(
        FLOOR,
        [standing, placed],
        placed,
        placed.instance.position,
      ),
    ).toEqual({ xMeters: 1.5, zMeters: 2 });
  });

  it("centres a piece on another piece's middle", () => {
    // A sofa at (1.5, 2); a second let go 3 cm off centred above it, clear
    // of every wall.
    const other = sofaAt(1.5, 2, 0, "i2");
    const placed = sofaAt(1.53, 0.7);

    expect(
      snapInstancePosition(FLOOR, [other], placed, placed.instance.position),
    ).toEqual({ xMeters: 1.5, zMeters: 0.7 });
  });

  it("reaches only as far as it is told", () => {
    // 3 cm off the north wall, with a reach of 2 cm: left alone.
    const placed = sofaAt(2, 0.53);

    expect(
      snapInstancePosition(FLOOR, [], placed, placed.instance.position, 0.02),
    ).toEqual({ xMeters: 2, zMeters: 0.53 });
  });

  it("never snaps a piece to itself", () => {
    const placed = sofaAt(2, 1.5);

    expect(
      snapInstancePosition(FLOOR, [placed], placed, {
        xMeters: 2.02,
        zMeters: 1.5,
      }),
    ).toEqual({ xMeters: 2.02, zMeters: 1.5 });
  });
});

describe("snapInstancePosition against a closet", () => {
  // A closet across the south of the room: a section 2.5 wide and 1.5 deep
  // whose north and west sides are kept as walls.
  const CLOSET = {
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
  const thickness = DEFAULT_FLOOR.wallThicknessMeters;

  it("lands a piece in the room on the outer face of the closet wall", () => {
    // Let go 2 cm short of the band.
    const placed = sofaAt(3, 1.5 - thickness - 0.5 - 0.02);

    expect(
      snapInstancePosition(CLOSET, [], placed, placed.instance.position),
    ).toEqual({
      xMeters: 3,
      zMeters: expect.closeTo(1.5 - thickness - 0.5, 10),
    });
  });

  it("lands a piece in the closet on the section's own edge", () => {
    const placed = sofaAt(3, 1.5 + 0.5 + 0.02);

    expect(
      snapInstancePosition(CLOSET, [], placed, placed.instance.position),
    ).toEqual({ xMeters: 3, zMeters: expect.closeTo(2, 10) });
  });

  it("never offers the middle of the wall", () => {
    // Let go with its back edge inside the band: it is pushed out, not in.
    const placed = sofaAt(3, 1.5 - 0.5 - thickness / 2);

    const landed = snapInstancePosition(
      CLOSET,
      [],
      placed,
      placed.instance.position,
    );
    expect(landed.zMeters).toBeCloseTo(1.5 - thickness - 0.5, 10);
  });
});

/** One by one, for a group that does not span the room. */
const CHAIR: FurnitureProduct = {
  ...SOFA,
  id: "chair",
  name: "Chair",
  footprint: { widthMeters: 1, depthMeters: 1 },
};

function chairAt(xMeters: number, zMeters: number, id: string) {
  return {
    instance: createInstance(id, CHAIR.id, { xMeters, zMeters }),
    product: CHAIR,
  };
}

describe("snapGroupDelta", () => {
  // Two chairs side by side, so the group is 2 m by 1 m, from x = 1 to 3.
  const chairs = [chairAt(1.5, 1.5, "a"), chairAt(2.5, 1.5, "b")];

  it("lands the group's outline on the wall, not the grabbed chair", () => {
    // Dragged until the group's west edge is 2 cm from the west wall: the
    // whole group is pulled those 2 cm, which is the same move for both.
    const delta = snapGroupDelta(FLOOR, chairs, ["a", "b"], {
      xMeters: -0.98,
      zMeters: 0,
    });
    expect(delta.xMeters).toBeCloseTo(-1, 9);
    expect(delta.zMeters).toBe(0);
  });

  it("never catches a member on another member", () => {
    // Chair b is exactly against chair a. A drag of 5 cm is nowhere near a
    // wall, and a's east edge must not pull b back into place.
    const delta = snapGroupDelta(FLOOR, chairs, ["a", "b"], {
      xMeters: 0.05,
      zMeters: 0.05,
    });
    expect(delta).toEqual({ xMeters: 0.05, zMeters: 0.05 });
  });

  it("still lands against a piece outside the group", () => {
    // A table whose north edge is 3 cm below the group's south edge.
    const table = chairAt(2, 2.53, "table");
    const delta = snapGroupDelta(FLOOR, [...chairs, table], ["a", "b"], {
      xMeters: 0,
      zMeters: 0,
    });
    expect(delta.zMeters).toBeCloseTo(0.03, 9);
  });

  it("leaves the drag alone with nothing to land on", () => {
    expect(
      snapGroupDelta(FLOOR, chairs, ["a", "b"], { xMeters: 0.3, zMeters: 0.2 }),
    ).toEqual({ xMeters: 0.3, zMeters: 0.2 });
  });
});

describe("heldSnap", () => {
  const at = (xMeters: number, zMeters = 0) => ({ xMeters, zMeters });

  it("takes hold where the ordinary snap lands", () => {
    const { value, hold } = heldSnap(at(0.98), at(1), NO_HOLD, 0.3);
    expect(value).toEqual(at(1));
    expect(hold).toEqual({ x: 1, z: null });
  });

  it("stays held while the pointer has not pulled clearly away", () => {
    // Out of the ordinary reach, so the snap offers nothing — but within
    // the hold's, so the piece stays where it landed.
    const { value, hold } = heldSnap(at(1.2), at(1.2), { x: 1, z: null }, 0.3);
    expect(value).toEqual(at(1));
    expect(hold).toEqual({ x: 1, z: null });
  });

  it("lets go once pulled further than the hold's reach", () => {
    const { value, hold } = heldSnap(at(1.4), at(1.4), { x: 1, z: null }, 0.3);
    expect(value).toEqual(at(1.4));
    expect(hold).toEqual({ x: null, z: null });
  });

  it("holds each axis on its own", () => {
    const { value } = heldSnap(at(1.2, 2.5), at(1.2, 2.5), { x: 1, z: 2 }, 0.3);
    expect(value).toEqual(at(1, 2.5));
  });
});
