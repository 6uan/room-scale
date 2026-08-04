import { describe, expect, it } from "vitest";
import { DEFAULT_FLOOR } from "@/domain/room";
import { LIVING_ROOM } from "@/domain/room/fixtures";
import { metersFromInches } from "@/domain/units";
import {
  clampToFloor,
  countPlaced,
  createInstance,
  footprintRect,
  furnitureAt,
  moveInstance,
  placedFurniture,
  placedNames,
  placementFor,
  turnInstance,
  withInstance,
} from "./instance";
import type { FurnitureProduct } from "./product";

/** A one-room apartment, four by three. */
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
const ROOM = {
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
};
const ROOM_PART = ROOM.parts[0]!;

const RUG: FurnitureProduct = {
  id: "rug",
  name: "Rug",
  retailer: "",
  productUrl: "",
  priceCents: 34900,
  purchaseStatus: "considering",
  footprint: {
    widthMeters: metersFromInches(96),
    depthMeters: metersFromInches(60),
  },
  heightMeters: 0.01,
};

describe("placementFor", () => {
  it("puts the first piece in the middle of the room", () => {
    expect(placementFor(FLOOR, 0)).toEqual({ xMeters: 2, zMeters: 1.5 });
  });

  it("steps later pieces aside so they do not stack invisibly", () => {
    const first = placementFor(FLOOR, 0);
    const second = placementFor(FLOOR, 1);

    expect(second.xMeters).toBeGreaterThan(first.xMeters);
    expect(second.zMeters).toBeGreaterThan(first.zMeters);
  });

  it("keeps the starting point inside the room however many are placed", () => {
    const far = placementFor(FLOOR, 100);

    expect(far.xMeters).toBeLessThanOrEqual(ROOM_PART.widthMeters);
    expect(far.zMeters).toBeLessThanOrEqual(ROOM_PART.depthMeters);
  });
});

describe("createInstance", () => {
  it("references the product rather than copying it", () => {
    const instance = createInstance("i1", "rug", { xMeters: 1, zMeters: 1 });

    expect(instance.productId).toBe("rug");
    expect(Object.keys(instance)).not.toContain("footprint");
  });

  it("starts unrotated", () => {
    expect(
      createInstance("i1", "rug", { xMeters: 1, zMeters: 1 }).rotationRadians,
    ).toBe(0);
  });
});

describe("placedFurniture", () => {
  it("joins each instance to the product it references", () => {
    const instance = createInstance("i1", "rug", { xMeters: 1, zMeters: 1 });

    const placed = placedFurniture([instance], [RUG]);

    expect(placed).toHaveLength(1);
    expect(placed[0]?.product.name).toBe("Rug");
  });

  it("gives every copy of one product the same product", () => {
    const instances = [
      createInstance("i1", "rug", { xMeters: 1, zMeters: 1 }),
      createInstance("i2", "rug", { xMeters: 2, zMeters: 2 }),
    ];

    const placed = placedFurniture(instances, [RUG]);

    // One price, two positions — the whole point of the split in ADR 0003.
    expect(placed).toHaveLength(2);
    expect(placed[0]?.product).toBe(placed[1]?.product);
    expect(placed[0]?.instance.position).not.toEqual(
      placed[1]?.instance.position,
    );
  });

  it("drops an instance whose product has gone, rather than rendering half a pair", () => {
    const orphan = createInstance("i1", "missing", { xMeters: 1, zMeters: 1 });

    expect(placedFurniture([orphan], [RUG])).toEqual([]);
  });
});

describe("countPlaced", () => {
  it("counts the copies of one product", () => {
    const instances = [
      createInstance("i1", "rug", { xMeters: 1, zMeters: 1 }),
      createInstance("i2", "rug", { xMeters: 2, zMeters: 2 }),
      createInstance("i3", "lamp", { xMeters: 3, zMeters: 1 }),
    ];

    expect(countPlaced(instances, "rug")).toBe(2);
    expect(countPlaced(instances, "lamp")).toBe(1);
    expect(countPlaced(instances, "sofa")).toBe(0);
  });
});

describe("footprintRect", () => {
  it("takes its size from the product and its place from the instance", () => {
    const instance = {
      ...createInstance("i1", "rug", { xMeters: 1, zMeters: 2 }),
      rotationRadians: Math.PI / 2,
    };

    expect(footprintRect({ instance, product: RUG })).toEqual({
      center: { xMeters: 1, zMeters: 2 },
      widthMeters: RUG.footprint.widthMeters,
      depthMeters: RUG.footprint.depthMeters,
      rotationRadians: Math.PI / 2,
    });
  });
});

describe("moveInstance", () => {
  it("moves a piece without turning it", () => {
    const turned = turnInstance(
      createInstance("i1", "rug", { xMeters: 1, zMeters: 1 }),
      Math.PI / 4,
    );

    const moved = moveInstance(turned, { xMeters: 3, zMeters: 2 });

    expect(moved.position).toEqual({ xMeters: 3, zMeters: 2 });
    expect(moved.rotationRadians).toBe(turned.rotationRadians);
  });
});

describe("turnInstance", () => {
  it("turns a piece without moving it", () => {
    const instance = createInstance("i1", "rug", { xMeters: 1, zMeters: 1 });

    const turned = turnInstance(instance, Math.PI);

    expect(turned.rotationRadians).toBe(Math.PI);
    expect(turned.position).toEqual(instance.position);
  });

  it("keeps the rotation inside one turn however far it is nudged", () => {
    const instance = createInstance("i1", "rug", { xMeters: 1, zMeters: 1 });

    expect(turnInstance(instance, -Math.PI / 2).rotationRadians).toBeCloseTo(
      (Math.PI * 3) / 2,
      12,
    );
    expect(turnInstance(instance, Math.PI * 2).rotationRadians).toBe(0);
  });
});

describe("furnitureAt", () => {
  const at = (xMeters: number, zMeters: number) => ({
    instance: createInstance("i1", "rug", { xMeters, zMeters }),
    product: RUG,
  });

  it("finds the piece a point falls on", () => {
    const rug = at(2, 1.5);

    expect(furnitureAt([rug], { xMeters: 2.4, zMeters: 1.6 })).toBe(rug);
  });

  it("finds nothing on empty floor", () => {
    expect(furnitureAt([at(2, 1.5)], { xMeters: 0.05, zMeters: 0.05 })).toBe(
      null,
    );
  });

  it("picks the piece on top when two overlap", () => {
    const under = at(2, 1.5);
    const over = at(2, 1.5);

    // Last in the list is drawn last, so it is the one being pointed at.
    expect(furnitureAt([under, over], { xMeters: 2, zMeters: 1.5 })).toBe(over);
  });

  it("follows a piece round as it turns", () => {
    // The rug is 2.44 m by 1.52 m: a point a meter east of center is on it
    // unturned, and off it once the long side runs north to south.
    const flat = at(2, 1.5);
    const turned = {
      instance: turnInstance(flat.instance, Math.PI / 2),
      product: RUG,
    };
    const point = { xMeters: 3, zMeters: 1.5 };

    expect(furnitureAt([flat], point)).toBe(flat);
    expect(furnitureAt([turned], point)).toBe(null);
  });
});

describe("clampToFloor", () => {
  it("leaves a point already on the floor alone", () => {
    expect(clampToFloor(FLOOR, { xMeters: 1, zMeters: 2 })).toEqual({
      xMeters: 1,
      zMeters: 2,
    });
  });

  it("keeps a center on the floor when it is dragged past a wall", () => {
    expect(clampToFloor(FLOOR, { xMeters: -3, zMeters: 99 })).toEqual({
      xMeters: 0,
      zMeters: ROOM_PART.depthMeters,
    });
  });
});

describe("withInstance", () => {
  it("replaces one instance and leaves the order alone", () => {
    const first = createInstance("i1", "rug", { xMeters: 1, zMeters: 1 });
    const second = createInstance("i2", "rug", { xMeters: 2, zMeters: 2 });
    const moved = moveInstance(first, { xMeters: 3, zMeters: 3 });

    const next = withInstance([first, second], moved);

    expect(next).toEqual([moved, second]);
  });
});

describe("placedNames", () => {
  const piece = (id: string, productId: string, name: string) => ({
    instance: createInstance(id, productId, { xMeters: 1, zMeters: 1 }),
    product: { ...RUG, id: productId, name },
  });

  it("leaves a product placed once unnumbered", () => {
    expect(placedNames([piece("i1", "rug", "Rug")])).toEqual(["Rug"]);
  });

  it("numbers the copies of a product placed more than once", () => {
    const names = placedNames([
      piece("i1", "pillow", "Pillow"),
      piece("i2", "rug", "Rug"),
      piece("i3", "pillow", "Pillow"),
    ]);

    expect(names).toEqual(["Pillow 1", "Rug", "Pillow 2"]);
  });
});
