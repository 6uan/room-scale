import { describe, expect, it } from "vitest";
import {
  createInstance,
  turnInstance,
  type PlacedFurniture,
} from "@/domain/furniture";
import type { FurnitureProduct } from "@/domain/furniture";
import { DEFAULT_FLOOR, DEFAULT_ROOM } from "@/domain/room";
import { checkLayout, troubledInstanceIds } from "./layout";

/** A one-room apartment, four by three. */
const ROOM = {
  ...DEFAULT_ROOM,
  origin: { xMeters: 0, zMeters: 0 },
  widthMeters: 4,
  depthMeters: 3,
  openings: [],
};
const FLOOR = { ...DEFAULT_FLOOR, rooms: [ROOM] };

function product(id: string, widthMeters: number, depthMeters: number) {
  const made: FurnitureProduct = {
    id,
    name: id,
    retailer: "",
    productUrl: "",
    priceCents: 0,
    purchaseStatus: "considering",
    footprint: { widthMeters, depthMeters },
    heightMeters: 0.5,
  };
  return made;
}

const SECTIONAL = product("sectional", 2.4, 1.6);
const TABLE = product("table", 0.9, 0.9);

/** One piece of furniture, placed. */
function place(
  id: string,
  made: FurnitureProduct,
  xMeters: number,
  zMeters: number,
  rotationRadians = 0,
): PlacedFurniture {
  return {
    instance: turnInstance(
      createInstance(id, made.id, { xMeters, zMeters }),
      rotationRadians,
    ),
    product: made,
  };
}

describe("checkLayout: a room that works", () => {
  it("finds nothing wrong with an empty room", () => {
    expect(checkLayout(FLOOR, [])).toEqual([]);
  });

  it("finds nothing wrong with two pieces that clear each other", () => {
    const layout = [
      place("i1", SECTIONAL, 1.3, 0.85),
      place("i2", TABLE, 3, 2.4),
    ];

    expect(checkLayout(FLOOR, layout)).toEqual([]);
  });

  it("accepts a piece pushed flush against a wall", () => {
    // A 1.6 m deep sectional centered 0.8 m from the north wall touches it.
    expect(checkLayout(FLOOR, [place("i1", SECTIONAL, 2, 0.8)])).toEqual([]);
  });
});

describe("checkLayout: furniture overlapping furniture", () => {
  it("reports the pair once, with the least it has to move", () => {
    const layout = [
      place("i1", SECTIONAL, 1.5, 1.5),
      place("i2", TABLE, 2.5, 1.5),
    ];

    // The sectional reaches x = 2.7 and the table starts at x = 2.05:
    // 0.65 m of each other, and the shorter way out.
    expect(checkLayout(FLOOR, layout)).toEqual([
      {
        kind: "overlap",
        instanceIds: ["i1", "i2"],
        depthMeters: expect.closeTo(0.65, 10),
      },
    ]);
  });

  it("names both pieces, so either one can be the one that moves", () => {
    const layout = [
      place("i1", SECTIONAL, 1.5, 1.5),
      place("i2", TABLE, 2.5, 1.5),
    ];

    expect(troubledInstanceIds(checkLayout(FLOOR, layout))).toEqual(
      new Set(["i1", "i2"]),
    );
  });

  it("reports each overlapping pair of three pieces separately", () => {
    const layout = [
      place("i1", TABLE, 2, 1.5),
      place("i2", TABLE, 2.2, 1.5),
      place("i3", TABLE, 2.4, 1.5),
    ];

    expect(checkLayout(FLOOR, layout)).toHaveLength(3);
  });

  it("clears a piece turned out of the way, which a bounding box would not", () => {
    // Side by side with 5 cm between them once the table is square on, but the
    // table's corners reach further when it is turned an eighth.
    const square = [
      place("i1", SECTIONAL, 1.2, 1.5),
      place("i2", TABLE, 2.87, 1.5),
    ];
    const turned = [
      place("i1", SECTIONAL, 1.2, 1.5),
      place("i2", TABLE, 2.87, 1.5, Math.PI / 4),
    ];

    expect(checkLayout(FLOOR, square)).toEqual([]);
    expect(checkLayout(FLOOR, turned)).toHaveLength(1);
  });
});

describe("checkLayout: furniture against the room", () => {
  it("reports how far a piece crosses a wall", () => {
    const layout = [place("i1", SECTIONAL, 0.9, 1.5)];

    expect(checkLayout(FLOOR, layout)).toEqual([
      {
        kind: "crosses-wall",
        instanceId: "i1",
        roomId: ROOM.id,
        wall: "west",
        overhangMeters: expect.closeTo(0.3, 10),
      },
    ]);
  });

  it("reports both walls a piece crosses in a corner", () => {
    const problems = checkLayout(FLOOR, [place("i1", SECTIONAL, 0.9, 0.5)]);

    expect(problems.map((problem) => problem.kind)).toEqual([
      "crosses-wall",
      "crosses-wall",
    ]);
    expect(problems).toContainEqual({
      kind: "crosses-wall",
      instanceId: "i1",
      roomId: ROOM.id,
      wall: "north",
      overhangMeters: expect.closeTo(0.3, 10),
    });
  });

  it("says a piece is outside the room rather than listing four walls", () => {
    expect(checkLayout(FLOOR, [place("i1", TABLE, -3, 1.5)])).toEqual([
      { kind: "outside-room", instanceId: "i1" },
    ]);
  });

  it("still reports an overlap for a piece that crosses a wall", () => {
    const layout = [
      place("i1", SECTIONAL, 0.9, 1.5),
      place("i2", TABLE, 1.9, 1.5),
    ];

    expect(checkLayout(FLOOR, layout).map((problem) => problem.kind)).toEqual([
      "crosses-wall",
      "overlap",
    ]);
  });
});

describe("checkLayout: the order it reports in", () => {
  it("keeps each piece's own problems in placement order, then the pairs", () => {
    const layout = [
      place("i1", SECTIONAL, 2, 1.5),
      place("i2", TABLE, 3.8, 1.5),
      place("i3", TABLE, 2.4, 1.5),
    ];

    // i2 crosses the east wall; i1 overlaps i3. The piece problems come first.
    expect(
      checkLayout(FLOOR, layout).map((problem) =>
        "instanceId" in problem
          ? problem.instanceId
          : "instanceIds" in problem
            ? problem.instanceIds.join("+")
            : problem.roomIds.join("+"),
      ),
    ).toEqual(["i2", "i1+i3"]);
  });
});
