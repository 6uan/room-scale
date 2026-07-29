import { describe, expect, it } from "vitest";
import { createInstance } from "@/domain/furniture";
import { createProject, withInstances, withProducts } from "@/domain/project";
import { exportProject, importProject } from "./project-transfer";

const WHEN = 1_700_000_000_000;

/** A project with something in it, so a round trip has something to lose. */
function furnished() {
  return withInstances(
    withProducts(createProject(), [
      {
        id: "rug",
        name: `Rug, "the big one"`,
        retailer: "Article",
        productUrl: "https://example.com/rug",
        priceCents: 34900,
        purchaseStatus: "ordered",
        footprint: { widthMeters: 2.4384, depthMeters: 1.524 },
        heightMeters: 0.01,
      },
    ]),
    [createInstance("i1", "rug", { xMeters: 2.1, zMeters: 1.8 })],
  );
}

describe("exportProject", () => {
  it("writes the document in the envelope storage uses", () => {
    const text = exportProject(createProject(), WHEN);
    const parsed = JSON.parse(text);

    expect(parsed.version).toBeGreaterThan(0);
    expect(parsed.updatedAt).toBe(WHEN);
    expect(parsed.project.floor.rooms).toHaveLength(1);
  });

  it("is indented, for anyone who opens it to see what it holds", () => {
    expect(exportProject(createProject(), WHEN)).toContain("\n  ");
  });
});

describe("importProject", () => {
  it("reads back exactly what was exported", () => {
    const project = furnished();

    const result = importProject(exportProject(project, WHEN));

    // The bar the roadmap set: exported, cleared, re-imported, identical.
    expect(result.ok && result.project).toEqual(project);
  });

  it("keeps the awkward characters a name can hold", () => {
    const project = furnished();

    const result = importProject(exportProject(project, WHEN));

    expect(result.ok && result.project.products[0]?.name).toBe(
      `Rug, "the big one"`,
    );
  });

  it("refuses a file that is not JSON at all", () => {
    const result = importProject("not a project");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("not-json");
    const empty = importProject("");
    expect(!empty.ok && empty.reason).toBe("not-json");
  });

  it("refuses JSON that is not a project", () => {
    const result = importProject('{"hello":"world"}');
    expect(!result.ok && result.reason).toBe("unreadable");
  });

  it("refuses a project a newer build wrote, rather than reading round it", () => {
    const parsed = JSON.parse(exportProject(createProject(), WHEN));
    const newer = JSON.stringify({ ...parsed, version: parsed.version + 1 });

    const result = importProject(newer);
    expect(!result.ok && result.reason).toBe("from-a-newer-version");
  });

  it("migrates a file an older build wrote, the way storage would", () => {
    // A version 1 export: room, products, and a unit, and nothing else.
    const version1 = JSON.stringify({
      id: "current",
      version: 1,
      updatedAt: WHEN,
      project: {
        room: {
          widthMeters: 4.2,
          depthMeters: 3.6,
          heightMeters: 2.44,
          wallThicknessMeters: 0.1143,
          openings: [],
        },
        products: [],
        displayUnit: "metric",
      },
    });

    const result = importProject(version1);

    expect(result.ok).toBe(true);
    // Carried all the way forward: a floor, holding that room, in one layout.
    expect(result.ok && result.project.floor.rooms[0]?.widthMeters).toBe(4.2);
    expect(result.ok && result.project.layouts).toHaveLength(1);
    expect(result.ok && result.project.displayUnit).toBe("metric");
  });
});
