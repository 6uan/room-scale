import { describe, expect, it } from "vitest";
import { orientedRectCorners } from "@/domain/geometry";
import { metersFromInches } from "@/domain/units";
import { furnitureBoxes } from "./boxes";
import {
  createInstance,
  footprintRect,
  turnInstance,
  withInstanceHidden,
  type PlacedFurniture,
} from "./instance";
import type { FurnitureProduct } from "./product";

const SOFA: FurnitureProduct = {
  id: "sofa",
  name: "Sofa",
  retailer: "",
  productUrl: "",
  priceCents: 0,
  purchaseStatus: "wanted",
  category: "seating",
  footprint: {
    widthMeters: metersFromInches(84),
    depthMeters: metersFromInches(36),
  },
  heightMeters: metersFromInches(33),
};

const sofa = (id: string, x: number, z: number): PlacedFurniture => ({
  instance: createInstance(id, SOFA.id, { xMeters: x, zMeters: z }),
  product: SOFA,
});

describe("furnitureBoxes", () => {
  it("measures exactly what its product says it measures", () => {
    const [box] = furnitureBoxes([sofa("s", 1, 2)]);
    expect(box?.widthMeters).toBe(SOFA.footprint.widthMeters);
    expect(box?.depthMeters).toBe(SOFA.footprint.depthMeters);
    expect(box?.heightMeters).toBe(SOFA.heightMeters);
    expect(box?.center).toEqual({ xMeters: 1, zMeters: 2 });
  });

  it("stands on the footprint the plan draws and validation checks, turned or not", () => {
    const turned = {
      ...sofa("s", 1, 2),
      instance: turnInstance(sofa("s", 1, 2).instance, Math.PI / 6),
    };
    const [box] = furnitureBoxes([turned]);
    expect(box?.angleRadians).toBeCloseTo(Math.PI / 6, 12);
    // The box's own corners on the floor are the plan's footprint corners.
    const corners = orientedRectCorners({
      center: box!.center,
      widthMeters: box!.widthMeters,
      depthMeters: box!.depthMeters,
      rotationRadians: box!.angleRadians,
    });
    expect(corners).toEqual(orientedRectCorners(footprintRect(turned)));
  });

  it("leaves out a piece that is set aside", () => {
    const aside = {
      ...sofa("b", 0, 0),
      instance: withInstanceHidden(sofa("b", 0, 0).instance, true),
    };
    expect(
      furnitureBoxes([sofa("a", 0, 0), aside]).map((box) => box.instanceId),
    ).toEqual(["a"]);
  });
});
