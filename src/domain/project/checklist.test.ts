import { describe, expect, it } from "vitest";
import {
  createInstance,
  type FurnitureInstance,
  type FurnitureProduct,
  type PurchaseStatus,
} from "@/domain/furniture";
import { buildChecklist } from "./checklist";

function product(
  id: string,
  priceCents: number,
  purchaseStatus: PurchaseStatus = "considering",
): FurnitureProduct {
  return {
    id,
    name: id,
    retailer: "",
    productUrl: "",
    priceCents,
    purchaseStatus,
    footprint: { widthMeters: 1, depthMeters: 1 },
    heightMeters: 0.5,
  };
}

/** `count` copies of a product, placed anywhere. */
function placed(productId: string, count: number): FurnitureInstance[] {
  return Array.from({ length: count }, (_, index) =>
    createInstance(`${productId}-${index}`, productId, {
      xMeters: 1,
      zMeters: 1,
    }),
  );
}

const RUG = product("rug", 34900);
const SOFA = product("sofa", 199900);
const PILLOW = product("pillow", 4500);

describe("buildChecklist", () => {
  it("has nothing to buy for an empty project", () => {
    const checklist = buildChecklist([], []);

    expect(checklist.lines).toEqual([]);
    expect(checklist.totalCents).toBe(0);
    expect(checklist.remainingCents).toBe(0);
  });

  it("counts quantity from what is placed, not from the catalogue", () => {
    const checklist = buildChecklist(
      [RUG, PILLOW],
      [...placed("rug", 1), ...placed("pillow", 2)],
    );

    expect(
      checklist.lines.map((line) => [line.product.id, line.quantity]),
    ).toEqual([
      ["rug", 1],
      ["pillow", 2],
    ]);
  });

  it("charges for each copy", () => {
    const checklist = buildChecklist([PILLOW], placed("pillow", 3));

    expect(checklist.lines[0]?.lineCents).toBe(13500);
    expect(checklist.totalCents).toBe(13500);
  });

  it("totals what is in the room", () => {
    const checklist = buildChecklist(
      [RUG, SOFA, PILLOW],
      [...placed("rug", 1), ...placed("sofa", 1), ...placed("pillow", 2)],
    );

    // 349.00 + 1999.00 + 2 × 45.00 = 2438.00.
    expect(checklist.totalCents).toBe(243800);
  });

  it("leaves a product with nothing placed out of the total", () => {
    const checklist = buildChecklist([RUG, SOFA], placed("rug", 1));

    expect(checklist.totalCents).toBe(34900);
    expect(checklist.lines).toHaveLength(1);
    expect(checklist.unplaced.map((one) => one.id)).toEqual(["sofa"]);
  });

  it("counts a product held twice in the catalogue once", () => {
    // Not something the editor can produce, but a hand-edited file can, and a
    // budget that double-charges is worse than one that refuses the file.
    const checklist = buildChecklist([RUG, RUG], placed("rug", 1));

    expect(checklist.lines).toHaveLength(1);
    expect(checklist.totalCents).toBe(34900);
  });
});

describe("buildChecklist: what is still owed", () => {
  const instances = [...placed("rug", 1), ...placed("sofa", 1)];

  it("owes the whole total while everything is only being considered", () => {
    const checklist = buildChecklist([RUG, SOFA], instances);

    expect(checklist.committedCents).toBe(0);
    expect(checklist.remainingCents).toBe(checklist.totalCents);
  });

  it("stops owing for something once it is bought", () => {
    const checklist = buildChecklist(
      [product("rug", 34900, "owned"), SOFA],
      instances,
    );

    expect(checklist.committedCents).toBe(34900);
    expect(checklist.remainingCents).toBe(199900);
    // Buying something does not change what the room costs.
    expect(checklist.totalCents).toBe(234800);
  });

  it("treats an order as money already spent", () => {
    const checklist = buildChecklist(
      [RUG, product("sofa", 199900, "ordered")],
      instances,
    );

    expect(checklist.committedCents).toBe(199900);
    expect(checklist.remainingCents).toBe(34900);
  });

  it("owes nothing once everything is ordered or owned", () => {
    const checklist = buildChecklist(
      [product("rug", 34900, "owned"), product("sofa", 199900, "ordered")],
      instances,
    );

    expect(checklist.remainingCents).toBe(0);
    expect(checklist.committedCents).toBe(checklist.totalCents);
  });

  it("counts every copy of a bought product as bought", () => {
    const checklist = buildChecklist(
      [product("pillow", 4500, "owned")],
      placed("pillow", 2),
    );

    expect(checklist.committedCents).toBe(9000);
  });
});
