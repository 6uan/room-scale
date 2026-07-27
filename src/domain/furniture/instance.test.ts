import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM } from "@/domain/room";
import { metersFromInches } from "@/domain/units";
import {
  countPlaced,
  createInstance,
  placedFurniture,
  placementFor,
} from "./instance";
import type { FurnitureProduct } from "./product";

const ROOM = { ...DEFAULT_ROOM, widthMeters: 4, depthMeters: 3 };

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
    expect(placementFor(ROOM, 0)).toEqual({ xMeters: 2, zMeters: 1.5 });
  });

  it("steps later pieces aside so they do not stack invisibly", () => {
    const first = placementFor(ROOM, 0);
    const second = placementFor(ROOM, 1);

    expect(second.xMeters).toBeGreaterThan(first.xMeters);
    expect(second.zMeters).toBeGreaterThan(first.zMeters);
  });

  it("keeps the starting point inside the room however many are placed", () => {
    const far = placementFor(ROOM, 100);

    expect(far.xMeters).toBeLessThanOrEqual(ROOM.widthMeters);
    expect(far.zMeters).toBeLessThanOrEqual(ROOM.depthMeters);
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
