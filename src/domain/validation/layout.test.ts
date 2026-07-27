import { describe, expect, it } from "vitest";
import {
  createInstance,
  turnInstance,
  type PlacedFurniture,
} from "@/domain/furniture";
import type { FurnitureProduct } from "@/domain/furniture";
import { DEFAULT_ROOM } from "@/domain/room";
import { inchesFromMeters, metersFromInches } from "@/domain/units";
import { checkLayout, troubledInstanceIds } from "./layout";

const ROOM = { ...DEFAULT_ROOM, widthMeters: 4, depthMeters: 3 };

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
    expect(checkLayout(ROOM, [])).toEqual([]);
  });

  it("finds nothing wrong with two pieces that clear each other", () => {
    const layout = [
      place("i1", SECTIONAL, 1.3, 0.85),
      place("i2", TABLE, 3, 2.4),
    ];

    expect(checkLayout(ROOM, layout)).toEqual([]);
  });

  it("accepts a piece pushed flush against a wall", () => {
    // A 1.6 m deep sectional centered 0.8 m from the north wall touches it.
    expect(checkLayout(ROOM, [place("i1", SECTIONAL, 2, 0.8)])).toEqual([]);
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
    expect(checkLayout(ROOM, layout)).toEqual([
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

    expect(troubledInstanceIds(checkLayout(ROOM, layout))).toEqual(
      new Set(["i1", "i2"]),
    );
  });

  it("reports each overlapping pair of three pieces separately", () => {
    const layout = [
      place("i1", TABLE, 2, 1.5),
      place("i2", TABLE, 2.2, 1.5),
      place("i3", TABLE, 2.4, 1.5),
    ];

    expect(checkLayout(ROOM, layout)).toHaveLength(3);
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

    expect(checkLayout(ROOM, square)).toEqual([]);
    expect(checkLayout(ROOM, turned)).toHaveLength(1);
  });
});

describe("checkLayout: furniture against the room", () => {
  it("reports how far a piece crosses a wall", () => {
    const layout = [place("i1", SECTIONAL, 0.9, 1.5)];

    expect(checkLayout(ROOM, layout)).toEqual([
      {
        kind: "crosses-wall",
        instanceId: "i1",
        wall: "west",
        overhangMeters: expect.closeTo(0.3, 10),
      },
    ]);
  });

  it("reports both walls a piece crosses in a corner", () => {
    const problems = checkLayout(ROOM, [place("i1", SECTIONAL, 0.9, 0.5)]);

    expect(problems.map((problem) => problem.kind)).toEqual([
      "crosses-wall",
      "crosses-wall",
    ]);
    expect(problems).toContainEqual({
      kind: "crosses-wall",
      instanceId: "i1",
      wall: "north",
      overhangMeters: expect.closeTo(0.3, 10),
    });
  });

  it("says a piece is outside the room rather than listing four walls", () => {
    expect(checkLayout(ROOM, [place("i1", TABLE, -3, 1.5)])).toEqual([
      { kind: "outside-room", instanceId: "i1" },
    ]);
  });

  it("still reports an overlap for a piece that crosses a wall", () => {
    const layout = [
      place("i1", SECTIONAL, 0.9, 1.5),
      place("i2", TABLE, 1.9, 1.5),
    ];

    expect(checkLayout(ROOM, layout).map((problem) => problem.kind)).toEqual([
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
      checkLayout(ROOM, layout).map((problem) =>
        "instanceId" in problem
          ? problem.instanceId
          : problem.instanceIds.join("+"),
      ),
    ).toEqual(["i2", "i1+i3"]);
  });
});

describe("checkLayout: protected walkways", () => {
  /**
   * The route that matters: down the middle of the room from north to south,
   * at least 36 inches wide and 42 preferred — the rule from AGENTS.md.
   */
  const GUEST_ROOM_ROUTE = {
    id: "route-1",
    name: "To the guest room",
    start: { xMeters: 3, zMeters: 0 },
    end: { xMeters: 3, zMeters: 3 },
    minimumWidthMeters: metersFromInches(36),
    preferredWidthMeters: metersFromInches(42),
  };

  const WITH_ROUTE = { ...ROOM, walkways: [GUEST_ROOM_ROUTE] };

  /** A piece `depthMeters` deep, pushed into the route from the west. */
  function intoTheRouteFromTheWest(inchesOfIntrusion: number) {
    // The preferred corridor runs 21 inches either side of the route, and the
    // route is far enough east that a 2.4 m sectional fits beside it without
    // also going through the west wall.
    const westEdge = 3 - metersFromInches(21);
    const half = SECTIONAL.footprint.widthMeters / 2;
    return place(
      "i1",
      SECTIONAL,
      westEdge + metersFromInches(inchesOfIntrusion) - half,
      1.5,
    );
  }

  it("says nothing about a route nothing is standing in", () => {
    expect(checkLayout(WITH_ROUTE, [place("i1", TABLE, 0.6, 1.5)])).toEqual([]);
  });

  it("reports the shortfall when a sofa narrows the route below its minimum", () => {
    // 42 inches wide, narrowed by 12 from one side: 30 inches left, which is
    // 6 short of the 36 it needs.
    const problems = checkLayout(WITH_ROUTE, [intoTheRouteFromTheWest(12)]);

    expect(problems).toHaveLength(1);
    const problem = problems[0];
    expect(problem?.kind).toBe("walkway-blocked");
    if (problem?.kind !== "walkway-blocked") {
      throw new Error("expected the route to be blocked");
    }
    expect(inchesFromMeters(problem.clearMeters)).toBeCloseTo(30, 6);
    expect(inchesFromMeters(problem.shortfallMeters)).toBeCloseTo(6, 6);
    expect(problem.walkwayId).toBe("route-1");
    expect(problem.instanceIds).toEqual(["i1"]);
  });

  it("calls a route that clears the minimum but misses the preferred tight", () => {
    // 42 inches wide, narrowed by 4: 38 left. Past the 36 it needs, 4 short of
    // the 42 that would be comfortable.
    const problems = checkLayout(WITH_ROUTE, [intoTheRouteFromTheWest(4)]);

    const problem = problems[0];
    expect(problem?.kind).toBe("walkway-tight");
    if (problem?.kind !== "walkway-tight") {
      throw new Error("expected the route to be tight");
    }
    expect(inchesFromMeters(problem.clearMeters)).toBeCloseTo(38, 6);
    expect(inchesFromMeters(problem.shortfallMeters)).toBeCloseTo(4, 6);
  });

  it("does not complain twice about one route", () => {
    // Blocked is the whole story: a route you cannot walk down is not also
    // worth calling less comfortable than you hoped.
    const kinds = checkLayout(WITH_ROUTE, [intoTheRouteFromTheWest(12)]).map(
      (problem) => problem.kind,
    );

    expect(kinds).toEqual(["walkway-blocked"]);
  });

  it("names every piece narrowing the route", () => {
    const problems = checkLayout(WITH_ROUTE, [
      intoTheRouteFromTheWest(12),
      place("i2", TABLE, 2.4, 0.5),
    ]);

    expect(troubledInstanceIds(problems)).toEqual(new Set(["i1", "i2"]));
  });

  it("ignores a route whose own numbers do not make sense", () => {
    // Both ends in the same place: there is no route to protect, and the form
    // beside it says so rather than this inventing a corridor.
    const broken = {
      ...ROOM,
      walkways: [{ ...GUEST_ROOM_ROUTE, end: { ...GUEST_ROOM_ROUTE.start } }],
    };

    expect(checkLayout(broken, [intoTheRouteFromTheWest(12)])).toEqual([]);
  });

  it("still reports what else is wrong under a blocked route", () => {
    const problems = checkLayout(WITH_ROUTE, [
      place("i1", SECTIONAL, 1.5, 1.5),
      place("i2", TABLE, 2.4, 1.5),
    ]);

    // A route problem does not swallow the overlap underneath it, and the
    // pieces keep their order: each piece's own problems, then routes, then
    // the pairs.
    expect(problems.map((problem) => problem.kind)).toEqual([
      "walkway-blocked",
      "overlap",
    ]);
  });
});
