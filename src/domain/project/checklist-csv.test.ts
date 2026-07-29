import { describe, expect, it } from "vitest";
import { createInstance } from "@/domain/furniture";
import type { FurnitureProduct } from "@/domain/furniture";
import { buildChecklist } from "./checklist";
import { checklistCsv } from "./checklist-csv";

function product(
  id: string,
  name: string,
  priceCents: number,
  extra: Partial<FurnitureProduct> = {},
): FurnitureProduct {
  return {
    id,
    name,
    retailer: "Article",
    productUrl: "https://example.com/1",
    priceCents,
    purchaseStatus: "considering",
    footprint: { widthMeters: 2, depthMeters: 1 },
    heightMeters: 0.5,
    ...extra,
  };
}

function csvFor(products: readonly FurnitureProduct[], counts: number[]) {
  const instances = products.flatMap((one, index) =>
    Array.from({ length: counts[index] ?? 0 }, (_, copy) =>
      createInstance(`${one.id}-${copy}`, one.id, { xMeters: 1, zMeters: 1 }),
    ),
  );
  return checklistCsv(buildChecklist(products, instances));
}

function rows(csv: string) {
  return csv.split("\r\n");
}

describe("checklistCsv", () => {
  it("starts with a header a spreadsheet can read", () => {
    expect(rows(csvFor([], []))[0]).toBe(
      "Item,Retailer,Quantity,Price each,Line total,Status,Width (m),Depth (m),Link",
    );
  });

  it("writes one row a product, with what it costs", () => {
    const csv = csvFor([product("sofa", "Sectional", 199900)], [1]);

    expect(rows(csv)[1]).toBe(
      "Sectional,Article,1,1999.00,1999.00,Considering,2,1,https://example.com/1",
    );
  });

  it("multiplies the line by how many are placed", () => {
    const csv = csvFor([product("pillow", "Pillow", 4500)], [3]);

    expect(rows(csv)[1]).toContain(",3,45.00,135.00,");
  });

  it("writes money as a number, not as money", () => {
    const csv = csvFor([product("sofa", "Sectional", 199900)], [1]);

    // A spreadsheet adds up 1999.00 and cannot add up $1,999.00.
    expect(csv).not.toContain("$");
    expect(csv).not.toContain("1,999");
  });

  it("ends with the total, which is the number people came for", () => {
    const csv = csvFor(
      [product("sofa", "Sectional", 199900), product("rug", "Rug", 34900)],
      [1, 2],
    );

    expect(rows(csv).at(-1)).toBe("Total,,,,2697.00,,,,");
  });

  it("quotes a name with a comma in it, so the row keeps its shape", () => {
    const csv = csvFor([product("sofa", "Sofa, 3-seat", 100000)], [1]);

    expect(rows(csv)[1]).toContain('"Sofa, 3-seat"');
    expect(rows(csv)[1]?.split(",")[0]).toBe('"Sofa');
  });

  it("doubles a quote inside a quoted field, as the format says", () => {
    const csv = csvFor([product("rug", `Rug "big"`, 1000)], [1]);

    expect(rows(csv)[1]).toContain(`"Rug ""big"""`);
  });

  it("says the purchase status in the words the interface uses", () => {
    const csv = csvFor(
      [product("rug", "Rug", 1000, { purchaseStatus: "owned" })],
      [1],
    );

    expect(rows(csv)[1]).toContain("Already own it");
  });

  it("leaves out what is in the catalogue but not in the room", () => {
    const csv = csvFor([product("rug", "Rug", 1000)], [0]);

    // Header and total only: the list is what is standing in the apartment.
    expect(rows(csv)).toHaveLength(2);
  });
});
