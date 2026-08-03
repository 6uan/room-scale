import { describe, expect, it } from "vitest";
import { createProject } from "@/domain/project";
import {
  SCHEMA_VERSION,
  readStoredProject,
  toStoredProject,
} from "./project-schema";

const STORED = toStoredProject("current", createProject(), 1_700_000_000_000);

describe("readStoredProject", () => {
  it("reads back a document this build wrote", () => {
    const result = readStoredProject(STORED);

    expect(result).toEqual({ ok: true, project: createProject() });
  });

  it("survives a round trip through JSON, as structured cloning would", () => {
    const result = readStoredProject(JSON.parse(JSON.stringify(STORED)));

    expect(result.ok).toBe(true);
  });

  it("keeps openings and products through the round trip", () => {
    const project = {
      ...createProject(),
      products: [
        {
          id: "p1",
          name: "Rug",
          retailer: "",
          productUrl: "",
          priceCents: 34900,
          purchaseStatus: "considering" as const,
          footprint: { widthMeters: 2.4, depthMeters: 1.5 },
          heightMeters: 0.01,
        },
      ],
    };
    const result = readStoredProject(
      toStoredProject("current", project, 1_700_000_000_000),
    );

    expect(result.ok && result.project).toEqual(project);
    expect(result.ok && result.project.floor.rooms[0]?.openings).toHaveLength(
      2,
    );
  });

  it("upgrades a version 1 document, which predates placed furniture", () => {
    // Captured from the version 1 schema, exactly as it sat in IndexedDB.
    const version1 = {
      id: "current",
      version: 1,
      updatedAt: 1_700_000_000_000,
      project: {
        room: {
          widthMeters: 4.2,
          depthMeters: 3.6,
          heightMeters: 2.44,
          wallThicknessMeters: 0.1143,
          openings: [
            {
              id: "door-1",
              kind: "door",
              wall: "south",
              centerMeters: 0.9,
              widthMeters: 0.8128,
              hinge: "start",
              swing: "inward",
            },
          ],
        },
        products: [
          {
            id: "p1",
            name: "Rug",
            retailer: "",
            productUrl: "",
            priceCents: 34900,
            purchaseStatus: "considering",
            footprint: { widthMeters: 2.4, depthMeters: 1.5 },
            heightMeters: 0.01,
          },
        ],
        displayUnit: "imperial",
      },
    };

    const result = readStoredProject(version1);

    expect(result.ok).toBe(true);
    // Nothing was placed before version 2, so nothing is placed after it.
    expect(result.ok && result.project.layouts[0]?.instances).toEqual([]);
    // And everything the old document did hold survived the upgrade.
    expect(result.ok && result.project.products).toHaveLength(1);
    expect(result.ok && result.project.floor.rooms[0]?.openings).toHaveLength(
      1,
    );
    expect(result.ok && result.project.displayUnit).toBe("imperial");
  });

  it("upgrades a version 2 document", () => {
    // Captured from the version 2 schema, exactly as it sat in IndexedDB.
    const version2 = {
      id: "current",
      version: 2,
      updatedAt: 1_700_000_000_000,
      project: {
        room: {
          widthMeters: 4.2,
          depthMeters: 3.6,
          heightMeters: 2.44,
          wallThicknessMeters: 0.1143,
          openings: [
            {
              id: "window-1",
              kind: "window",
              wall: "north",
              centerMeters: 2.1,
              widthMeters: 1.2192,
            },
          ],
        },
        products: [
          {
            id: "p1",
            name: "Rug",
            retailer: "",
            productUrl: "",
            priceCents: 34900,
            purchaseStatus: "considering",
            footprint: { widthMeters: 2.4, depthMeters: 1.5 },
            heightMeters: 0.01,
          },
        ],
        instances: [
          {
            id: "i1",
            productId: "p1",
            position: { xMeters: 2.1, zMeters: 1.8 },
            rotationRadians: 0,
          },
        ],
        displayUnit: "imperial",
      },
    };

    const result = readStoredProject(version2);

    expect(result.ok).toBe(true);
    // The room the document did describe is untouched.
    expect(result.ok && result.project.floor.rooms[0]?.openings).toHaveLength(
      1,
    );
    expect(result.ok && result.project.layouts[0]?.instances).toHaveLength(1);
    expect(result.ok && result.project.products).toHaveLength(1);
  });

  it("upgrades a version 4 document, which predates layouts", () => {
    // Captured from the version 4 schema, exactly as it sat in IndexedDB.
    const version4 = {
      id: "current",
      version: 4,
      updatedAt: 1_700_000_000_000,
      project: {
        floor: {
          wallThicknessMeters: 0.1143,
          rooms: [
            {
              id: "room-1",
              name: "Living room",
              origin: { xMeters: 0, zMeters: 0 },
              widthMeters: 4.2,
              depthMeters: 3.6,
              heightMeters: 2.44,
              openings: [],
            },
          ],
        },
        products: [
          {
            id: "p1",
            name: "Rug",
            retailer: "",
            productUrl: "",
            priceCents: 34900,
            purchaseStatus: "considering",
            footprint: { widthMeters: 2.4, depthMeters: 1.5 },
            heightMeters: 0.01,
          },
        ],
        instances: [
          {
            id: "i1",
            productId: "p1",
            position: { xMeters: 2.1, zMeters: 1.8 },
            rotationRadians: 0,
          },
        ],
        displayUnit: "imperial",
      },
    };

    const result = readStoredProject(version4);

    expect(result.ok).toBe(true);
    // What it held was one arrangement nobody had needed to name yet.
    expect(result.ok && result.project.layouts).toHaveLength(1);
    expect(result.ok && result.project.layouts[0]?.instances).toHaveLength(1);
    expect(result.ok && result.project.activeLayoutId).toBe(
      result.ok ? result.project.layouts[0]?.id : "",
    );
    // And the furniture itself is untouched by the move.
    expect(
      result.ok && result.project.layouts[0]?.instances[0]?.position,
    ).toEqual({ xMeters: 2.1, zMeters: 1.8 });
  });

  it("drops retired floor data when upgrading a version 5 document", () => {
    const project = createProject();
    const legacyRooms = project.floor.rooms.map((room) => {
      const part = room.parts[0];
      if (part === undefined) {
        throw new Error("a room has a part");
      }
      return {
        id: room.id,
        name: room.name,
        origin: part.origin,
        widthMeters: part.widthMeters,
        depthMeters: part.depthMeters,
        heightMeters: room.heightMeters,
        openings: room.openings.map((opening) => {
          const { partId, ...legacy } = opening;
          void partId;
          return legacy;
        }),
      };
    });
    const version5 = {
      id: "current",
      version: 5,
      updatedAt: 1_700_000_000_000,
      project: {
        ...project,
        // The one thickness a version 5 floor carried, and nothing split yet.
        floor: {
          wallThicknessMeters: 0.1143,
          rooms: legacyRooms,
          retiredFloorData: [{ id: "legacy-1" }],
        },
      },
    };

    const result = readStoredProject(version5);

    expect(result).toEqual({ ok: true, project });
    expect(
      result.ok && "retiredFloorData" in (result.project.floor as object),
    ).toBe(false);
  });

  it("upgrades a version 6 rectangle to one room part", () => {
    const project = createProject();
    const room = project.floor.rooms[0];
    const part = room?.parts[0];
    if (room === undefined || part === undefined) {
      throw new Error("a new project starts with one room part");
    }
    const version6 = {
      id: "current",
      version: 6,
      updatedAt: 1_700_000_000_000,
      project: {
        ...project,
        floor: {
          wallThicknessMeters: 0.1143,
          rooms: [
            {
              id: room.id,
              name: room.name,
              origin: part.origin,
              widthMeters: part.widthMeters,
              depthMeters: part.depthMeters,
              heightMeters: room.heightMeters,
              openings: room.openings.map((opening) => {
                const { partId, ...legacy } = opening;
                void partId;
                return legacy;
              }),
            },
          ],
        },
      },
    };

    const result = readStoredProject(version6);

    expect(result.ok).toBe(true);
    expect(result.ok && result.project.floor.rooms[0]?.parts).toEqual([part]);
    expect(
      result.ok && result.project.floor.rooms[0]?.openings[0]?.partId,
    ).toBe(part.id);
  });

  it("upgrades a version 7 part, which could not yet be turned", () => {
    const project = createProject();
    const room = project.floor.rooms[0];
    const part = room?.parts[0];
    if (room === undefined || part === undefined) {
      throw new Error("a new project starts with one room part");
    }
    const { rotationRadians, openWalls, ...legacyPart } = part;
    void rotationRadians;
    void openWalls;
    const version7 = {
      id: "current",
      version: 7,
      updatedAt: 1_700_000_000_000,
      project: {
        ...project,
        floor: {
          wallThicknessMeters: 0.1143,
          rooms: [{ ...room, parts: [legacyPart] }],
        },
      },
    };

    const result = readStoredProject(version7);

    expect(result.ok).toBe(true);
    expect(result.ok && result.project.floor.rooms[0]?.parts).toEqual([part]);
  });

  it("splits a version 8 wall thickness into shell and partitions", () => {
    const project = createProject();
    const room = project.floor.rooms[0];
    const part = room?.parts[0];
    if (room === undefined || part === undefined) {
      throw new Error("a new project starts with one room part");
    }
    const { openWalls, ...closedPart } = part;
    void openWalls;
    const version8 = {
      id: "current",
      version: 8,
      updatedAt: 1_700_000_000_000,
      project: {
        ...project,
        floor: {
          wallThicknessMeters: 0.2,
          rooms: [{ ...room, parts: [closedPart] }],
        },
      },
    };

    const result = readStoredProject(version8);

    expect(result.ok).toBe(true);
    expect(result.ok && result.project.floor.exteriorWallThicknessMeters).toBe(
      0.2,
    );
    expect(result.ok && result.project.floor.interiorWallThicknessMeters).toBe(
      0.2,
    );
    expect(
      result.ok && result.project.floor.rooms[0]?.parts[0]?.openWalls,
    ).toEqual([]);
    expect(
      result.ok && "wallThicknessMeters" in (result.project.floor as object),
    ).toBe(false);
  });

  it("refuses a part whose rotation is missing at the current version", () => {
    const project = createProject();
    const room = project.floor.rooms[0];
    const part = room?.parts[0];
    if (room === undefined || part === undefined) {
      throw new Error("a new project starts with one room part");
    }
    const { rotationRadians, ...squarePart } = part;
    void rotationRadians;
    const current = {
      ...STORED,
      project: {
        ...project,
        floor: { ...project.floor, rooms: [{ ...room, parts: [squarePart] }] },
      },
    };

    expect(readStoredProject(current).ok).toBe(false);
  });

  it("refuses a project with no layout to put furniture in", () => {
    const empty = {
      ...STORED,
      project: { ...STORED.project, layouts: [] },
    };

    expect(readStoredProject(empty).ok).toBe(false);
  });

  it("refuses a version 1 document that was already broken", () => {
    const damaged = {
      id: "current",
      version: 1,
      updatedAt: 0,
      project: { room: "not a room", products: [], displayUnit: "imperial" },
    };

    expect(readStoredProject(damaged)).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });

  it("refuses a document from a newer build rather than reading round it", () => {
    const result = readStoredProject({
      ...STORED,
      version: SCHEMA_VERSION + 1,
    });

    expect(result).toEqual({ ok: false, reason: "from-a-newer-version" });
  });

  it("refuses anything without a version", () => {
    for (const value of [null, undefined, 42, "a project", {}, []]) {
      expect(readStoredProject(value)).toEqual({
        ok: false,
        reason: "unreadable",
      });
    }
  });

  it("refuses a document whose contents do not match the schema", () => {
    const missingRoom = { ...STORED, project: { products: [] } };
    const wrongType = {
      ...STORED,
      project: { ...STORED.project, displayUnit: "furlongs" },
    };

    expect(readStoredProject(missingRoom).ok).toBe(false);
    expect(readStoredProject(wrongType).ok).toBe(false);
  });

  it("refuses measurements that are not finite numbers", () => {
    const notFinite = {
      ...STORED,
      project: {
        ...STORED.project,
        floor: {
          ...STORED.project.floor,
          rooms: [
            {
              ...STORED.project.floor.rooms[0],
              parts: [
                {
                  ...STORED.project.floor.rooms[0]?.parts[0],
                  widthMeters: Number.NaN,
                },
              ],
            },
          ],
        },
      },
    };

    expect(readStoredProject(notFinite).ok).toBe(false);
  });

  it("refuses a price that is not whole cents", () => {
    const fractional = {
      ...STORED,
      project: {
        ...STORED.project,
        products: [
          {
            id: "p1",
            name: "Rug",
            retailer: "",
            productUrl: "",
            priceCents: 349.5,
            purchaseStatus: "considering",
            footprint: { widthMeters: 2.4, depthMeters: 1.5 },
            heightMeters: 0.01,
          },
        ],
      },
    };

    expect(readStoredProject(fractional).ok).toBe(false);
  });
});
